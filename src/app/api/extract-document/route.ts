import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { DOC_TYPE_LABELS, type DocType } from '@/lib/document-classification'
import { MAX_PDF_BYTES_FOR_API, hasPdfMagicBytes } from '@/lib/document-upload'
import { authorizeDocumentActor } from '@/lib/document-access'
import {
  AMBITI,
  CLASSI_ENERGETICHE,
  FIELD_KEYS,
  TYPED_DOC_TYPES,
  computeValidUntil,
  emptyFields,
  isExtractableDocType,
  isTypedDocType,
  normalizeIsoDate,
  type Ambito,
  type CommonExtraction,
  type ExtractionStatus,
  type TypedDocType,
} from '@/lib/document-extraction'

// SECONDA chiamata AI, separata dalla classificazione (classify-document
// resta byte-identica, schema a 7 campi: decisione FASE 0 18/09). Qui il
// doc_type è già finale e lo schema di output è scelto dal codice in base a
// quello: nessun campo condizionale nello schema, quattro schemi piatti.
// Scrive SOLO su document_extractions (040), mai su documents.

export const runtime = 'nodejs'
export const maxDuration = 120

// Stesso modello della classificazione (parità di costo e latenza, decisione
// 18/09); scritto nella colonna `model` di ogni riga per tracciare con cosa
// è stata prodotta. Non esportato: una route Next.js ammette solo gli export
// riservati (POST, runtime, maxDuration…).
const EXTRACTION_MODEL = 'claude-sonnet-5'

// Fallimento della scrittura su document_extractions: tecnico, mai un
// esito 'fallita' del documento (vedi catch in POST).
class ExtractionWriteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExtractionWriteError'
  }
}

// ------------------------------------------------------------
// Schema di output per doc_type
// ------------------------------------------------------------

const NULLABLE_STRING = { anyOf: [{ type: 'string' }, { type: 'null' }] }
// format: 'date' è tra i formati supportati dagli structured outputs: il
// modello è vincolato a 'YYYY-MM-DD'. normalizeIsoDate rivalida comunque
// (calendario reale, non solo forma) prima della scrittura.
const NULLABLE_DATE = { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] }
const NULLABLE_INTEGER = { anyOf: [{ type: 'integer' }, { type: 'null' }] }

const COMMON_PROPERTIES = {
  data_documento: NULLABLE_DATE,
  ambito: { anyOf: [{ type: 'string', enum: AMBITI }, { type: 'null' }] },
  unita_riferimento: NULLABLE_STRING,
}

const TYPED_PROPERTIES: Record<TypedDocType, Record<string, unknown>> = {
  garanzia: {
    inizio: NULLABLE_DATE,
    durata_anni: NULLABLE_INTEGER,
    oggetto: NULLABLE_STRING,
    rilasciata_da: NULLABLE_STRING,
  },
  ape: {
    classe_energetica: { anyOf: [{ type: 'string', enum: CLASSI_ENERGETICHE }, { type: 'null' }] },
    valida_fino_al: NULLABLE_DATE,
  },
  polizza_decennale: {
    compagnia: NULLABLE_STRING,
    numero_polizza: NULLABLE_STRING,
    decorrenza: NULLABLE_DATE,
    scadenza: NULLABLE_DATE,
  },
}

// Tutti i campi required e nullable, additionalProperties false: lo schema
// non lascia al modello la scelta di omettere una chiave (stessa scelta
// della classificazione per i campi installatore).
function buildSchema(docType: DocType) {
  const properties: Record<string, unknown> = { ...COMMON_PROPERTIES }
  if (isTypedDocType(docType)) Object.assign(properties, TYPED_PROPERTIES[docType])
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  }
}

// Prompt di sistema UNICO per tutti i doc_type (cacheable tra chiamate): la
// parte variabile — quale tipo è il documento — viaggia nel messaggio utente.
const EXTRACTION_SYSTEM_PROMPT = `Sei un assistente che estrae dati strutturati da documenti di consegna di residenze immobiliari italiane. Il documento allegato è GIÀ classificato: il tipo ti viene indicato nel messaggio. Non riclassificarlo.

Regola generale: estrai SOLO ciò che è scritto nel documento. Se un dato non è presente, è illeggibile o è ambiguo usa null: non dedurlo, non calcolarlo, non inventarlo. Un null è sempre preferibile a un valore sbagliato.
Le date vanno nel formato ISO YYYY-MM-DD. Se nel documento compare solo mese e anno, o solo l'anno, usa null.

Campi comuni a ogni documento:
- data_documento: la data di emissione, firma o redazione del documento. Per una dichiarazione di conformità è la data della dichiarazione; per una polizza la data di emissione; per un attestato energetico la data di emissione; per una garanzia la data del certificato.
- ambito: "unita" se il documento riguarda una singola unità immobiliare (interno, appartamento, subalterno); "parti_comuni" se riguarda esplicitamente le parti comuni o un impianto condominiale (centrale termica, ascensore, vano scale, impianto comune, copertura); "residenza" se riguarda l'intero edificio o l'intero intervento nel suo complesso. In caso di dubbio null.
- unita_riferimento: l'unità immobiliare citata, come testo così come appare (es. "interno 3", "scala B, piano 2"); null se non è citata alcuna unità specifica.

Campi aggiuntivi, presenti nello schema solo per il tipo corrispondente:
- garanzia: inizio (data di decorrenza della garanzia: data di installazione, posa o consegna da cui parte la copertura), durata_anni (durata come numero intero di anni; se espressa in mesi convertila solo se è un multiplo esatto di 12, altrimenti null), oggetto (che cosa è coperto: il componente, l'apparecchio o l'opera), rilasciata_da (chi rilascia la garanzia: produttore o impresa, denominazione come appare). NON calcolare la data di scadenza: viene calcolata dopo.
- ape: classe_energetica (una tra ${CLASSI_ENERGETICHE.join(', ')}; se il documento riporta una classe non in elenco usa null), valida_fino_al (la data di validità o scadenza dell'attestato, se riportata).
- polizza_decennale: compagnia (la compagnia assicurativa), numero_polizza (il numero o identificativo della polizza così come appare), decorrenza (data di effetto della copertura), scadenza (data di fine della copertura).

Nessun dato economico: non estrarre importi, premi, massimali, costi, prezzi o riferimenti a fatture, anche se presenti nel documento.

Rispondi SOLO con l'oggetto JSON richiesto dallo schema, nessun altro testo.`

// ------------------------------------------------------------
// Validazione e normalizzazione dell'output
// ------------------------------------------------------------

function cleanString(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

function cleanAmbito(raw: unknown): Ambito | null {
  return typeof raw === 'string' && (AMBITI as string[]).includes(raw) ? (raw as Ambito) : null
}

function cleanPositiveInteger(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : null
}

function cleanClasseEnergetica(raw: unknown): string | null {
  return typeof raw === 'string' && (CLASSI_ENERGETICHE as readonly string[]).includes(raw) ? raw : null
}

// L'output è già vincolato dallo schema; qui si impone il tipo TS e si
// normalizza (trim, stringhe vuote → null, date rivalidate a calendario,
// enum riverificati). Un valore fuori regola diventa null, non un errore:
// il documento resta estratto, con quel dato assente — lo schema garantisce
// la forma, la normalizzazione garantisce il contenuto.
function normalizeCommon(v: Record<string, unknown>): CommonExtraction {
  return {
    data_documento: normalizeIsoDate(v.data_documento),
    ambito: cleanAmbito(v.ambito),
    unita_riferimento: cleanString(v.unita_riferimento),
  }
}

function normalizeTypedFields(docType: TypedDocType, v: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...emptyFields(docType) }
  switch (docType) {
    case 'garanzia':
      out.inizio = normalizeIsoDate(v.inizio)
      out.durata_anni = cleanPositiveInteger(v.durata_anni)
      out.oggetto = cleanString(v.oggetto)
      out.rilasciata_da = cleanString(v.rilasciata_da)
      break
    case 'ape':
      out.classe_energetica = cleanClasseEnergetica(v.classe_energetica)
      out.valida_fino_al = normalizeIsoDate(v.valida_fino_al)
      break
    case 'polizza_decennale':
      out.compagnia = cleanString(v.compagnia)
      out.numero_polizza = cleanString(v.numero_polizza)
      out.decorrenza = normalizeIsoDate(v.decorrenza)
      out.scadenza = normalizeIsoDate(v.scadenza)
      break
  }
  // Solo le chiavi ammesse per il tipo, mai altro (difesa in profondità
  // rispetto ad additionalProperties: false).
  for (const key of Object.keys(out)) {
    if (!(FIELD_KEYS[docType] as readonly string[]).includes(key)) delete out[key]
  }
  return out
}

// Discriminante servizio-vs-documento, identico a classify-document: questi
// errori sono del servizio, mai del documento, e non producono 'fallita'.
function isServiceUnavailableError(err: unknown): boolean {
  return (
    err instanceof Anthropic.APIConnectionError ||
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.RateLimitError ||
    err instanceof Anthropic.InternalServerError ||
    (err instanceof Anthropic.APIError && typeof err.status === 'number' && err.status >= 500)
  )
}

// ------------------------------------------------------------
// POST /api/extract-document — { documentId }
// super_admin del builder proprietario, o admin assegnato alla residenza.
// Un documento per invocazione (il batch è un loop client-side sequenziale,
// come per la classificazione). Rieseguibile: l'upsert sovrascrive la riga.
// ------------------------------------------------------------
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const documentId = body?.documentId
  if (!documentId || typeof documentId !== 'string') {
    return NextResponse.json({ error: 'Parametro documentId mancante' }, { status: 400 })
  }

  const admin = createServiceClient()
  const actor = await authorizeDocumentActor(admin, user.id, documentId, '[extract-document]')
  if (!actor.ok) return NextResponse.json({ error: actor.error }, { status: actor.status })
  const { doc } = actor

  // Base affidabile: solo un doc_type finale ('completata') ed estraibile
  // (≠ altro). Un documento in revisione o senza tipo non ha uno schema da
  // applicare: 409, nessuna riga scritta. La regola è la stessa di
  // needsExtraction (document-extraction.ts), senza il controllo "già
  // corrente": la ri-estrazione esplicita è ammessa.
  if (doc.classification_status !== 'completata' || !isExtractableDocType(doc.doc_type)) {
    return NextResponse.json(
      { error: 'Documento senza classificazione finale o senza dati da estrarre', cause: 'not_extractable' },
      { status: 409 },
    )
  }
  const docType = doc.doc_type

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error('[extract-document] ANTHROPIC_API_KEY assente o vuota — servizio di estrazione non disponibile')
    return NextResponse.json({ error: 'Servizio di estrazione non disponibile', cause: 'service_unavailable' }, { status: 503 })
  }

  // Nessuno stato 'in_corso' per l'estrazione: la riga si scrive una sola
  // volta, alla fine, con l'esito. Non esiste quindi uno stato zombie da
  // ripulire in caso di crash a metà.
  const writeRow = async (
    status: ExtractionStatus,
    values: Partial<{
      document_date: string | null
      ambito: Ambito | null
      unita_riferimento: string | null
      valid_until: string | null
      fields: Record<string, unknown>
      // null quando nessun modello è stato chiamato (righe 'saltata'): la
      // colonna dice con cosa sono stati prodotti i dati, non quale modello
      // era configurato. Le 'fallita' tengono il modello: la chiamata è
      // stata tentata, e il valore dice quale.
      model: string | null
    }>,
    options: { keepExisting?: boolean } = {},
  ) => {
    const row = {
      document_id: doc.id,
      for_doc_type: docType,
      status,
      document_date: null,
      ambito: null,
      unita_riferimento: null,
      valid_until: null,
      fields: {},
      model: EXTRACTION_MODEL,
      extracted_at: new Date().toISOString(),
      ...values,
    }
    // keepExisting (ON CONFLICT DO NOTHING): un esito negativo non deve
    // cancellare dati buoni di una estrazione precedente per lo stesso tipo.
    const { error } = await admin
      .from('document_extractions')
      .upsert(row, { onConflict: 'document_id', ignoreDuplicates: options.keepExisting === true })
    if (error) {
      console.error(`[extract-document] scrittura document_extractions fallita (documentId=${doc.id}):`, error.message)
      throw new ExtractionWriteError(error.message)
    }
  }

  try {
    const { data: fileBlob, error: downloadError } = await admin.storage
      .from('documents')
      .download(doc.storage_path)

    if (downloadError || !fileBlob) {
      throw new Error(`Errore download storage: ${downloadError?.message ?? 'sconosciuto'}`)
    }

    const arrayBuffer = await fileBlob.arrayBuffer()

    // Righe 'saltata': fields porta solo il motivo, non dati estratti
    // (contratto documentato in document-extraction.ts). keepExisting: se
    // esiste già un'estrazione buona, resta.
    if (!hasPdfMagicBytes(arrayBuffer)) {
      await writeRow('saltata', { model: null, fields: { skipped_reason: 'tipo file non supportato per estrazione automatica' } }, { keepExisting: true })
      return NextResponse.json({ status: 'saltata', reason: 'not_a_pdf' })
    }

    if (arrayBuffer.byteLength > MAX_PDF_BYTES_FOR_API) {
      await writeRow('saltata', { model: null, fields: { skipped_reason: 'PDF oltre 32MB: limite della richiesta API, estrazione automatica saltata' } }, { keepExisting: true })
      return NextResponse.json({ status: 'saltata', reason: 'file_too_large' })
    }

    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const anthropic = new Anthropic()

    const response = await anthropic.messages.create(
      {
        model: EXTRACTION_MODEL,
        max_tokens: 1024,
        thinking: { type: 'disabled' },
        system: [
          {
            type: 'text',
            text: EXTRACTION_SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        output_config: {
          format: { type: 'json_schema', schema: buildSchema(docType) },
        },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: base64 },
              },
              {
                type: 'text',
                text: `Il documento allegato è classificato come "${DOC_TYPE_LABELS[docType]}" (${docType}). Estrai i campi richiesti dallo schema fornito.`,
              },
            ],
          },
        ],
      },
      { maxRetries: 1, timeout: 90_000 },
    )

    if (response.stop_reason === 'refusal') {
      throw new Error('Richiesta rifiutata dai filtri di sicurezza del modello')
    }

    const textBlock = response.content.find(b => b.type === 'text')
    let parsed: unknown = null
    if (textBlock && 'text' in textBlock) {
      try {
        parsed = JSON.parse(textBlock.text)
      } catch {
        parsed = null
      }
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Risposta AI non conforme allo schema atteso')
    }

    const raw = parsed as Record<string, unknown>
    const common = normalizeCommon(raw)
    const fields = isTypedDocType(docType) ? normalizeTypedFields(docType, raw) : {}
    const validUntil = computeValidUntil(docType, fields)

    await writeRow('completata', {
      document_date: common.data_documento,
      ambito: common.ambito,
      unita_riferimento: common.unita_riferimento,
      valid_until: validUntil,
      fields,
    })

    return NextResponse.json({
      status: 'completata',
      for_doc_type: docType,
      document_date: common.data_documento,
      ambito: common.ambito,
      valid_until: validUntil,
      typed: (TYPED_DOC_TYPES as string[]).includes(docType),
      usage: response.usage,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Errore sconosciuto'

    // La scrittura su DB è fallita: non c'è nulla da annotare in tabella e
    // non è un problema del documento. 500 tecnico, mai 'fallita'.
    if (err instanceof ExtractionWriteError) {
      return NextResponse.json({ error: 'Errore tecnico nel salvataggio, riprova', cause: 'write_error' }, { status: 500 })
    }

    if (isServiceUnavailableError(err)) {
      // Il servizio è il problema, non il documento: nessuna riga scritta,
      // il documento resta "da estrarre" e rientra nel batch al prossimo giro.
      console.error(`[extract-document] servizio non disponibile (documentId=${documentId}):`, message)
      return NextResponse.json({ error: message, cause: 'service_unavailable' }, { status: 503 })
    }

    // Errore sul documento (download, parsing, refusal): 'fallita', senza
    // cancellare un'eventuale estrazione buona precedente dello stesso tipo.
    console.error(`[extract-document] estrazione fallita (documentId=${documentId}):`, message)
    try {
      await writeRow('fallita', {}, { keepExisting: true })
    } catch {
      // già loggato in writeRow; l'esito verso il client resta document_error
    }
    return NextResponse.json({ error: message, cause: 'document_error' }, { status: 502 })
  }
}
