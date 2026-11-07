import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import {
  DOC_TYPES,
  DOC_TYPE_LABELS,
  classificationOutcome,
  parseExpectedDocType,
  SISTEMI,
  SISTEMA_LABELS,
  normalizeVatNumber,
  type DocType,
  type Sistema,
} from '@/lib/document-classification'
import { refreshUnitProposal } from '@/lib/document-unit-proposal.server'
import { authorizeDocumentActor } from '@/lib/document-access'
import {
  ClassificationWriteError,
  TECHNICAL_ERROR_MESSAGE,
  WRITE_ERROR_FAILURE,
  downloadDocumentBuffer,
  handleClassificationFailure,
  sessionOutcome,
  writeDocumentState,
} from '@/lib/classification-write'

// Forza runtime Node.js — @anthropic-ai/sdk e il download storage non sono
// compatibili con Edge. maxDuration alto: una chiamata AI su un PDF di
// diverse pagine può richiedere più dei ~15-60s di default.
export const runtime = 'nodejs'
export const maxDuration = 120

// Limite request dell'API Anthropic per un documento PDF in base64 (non il
// limite applicativo di upload, che è 50MB — vedi MAX_DOCUMENT_SIZE).
const MAX_PDF_BYTES_FOR_API = 32 * 1024 * 1024

// documents può contenere anche immagini/Word (ALLOWED_DOCUMENT_MIME):
// questa route classifica solo PDF, quindi verifica i magic bytes prima di
// spendere una chiamata API — un file non-PDF inviato come 'application/pdf'
// produrrebbe un 400 dall'API a ogni tentativo, mai un 'fallita' risolvibile.
const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46] // %PDF

function hasPdfMagicBytes(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false
  const bytes = new Uint8Array(buffer, 0, 4)
  return PDF_MAGIC_BYTES.every((b, i) => bytes[i] === b)
}

const CLASSIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    doc_type: { type: 'string', enum: DOC_TYPES },
    sistema: { anyOf: [{ type: 'string', enum: SISTEMI }, { type: 'null' }] },
    confidence: { type: 'number' },
    unita_riferimento: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    motivazione: { type: 'string' },
    // Impresa installatrice — SOLO per doc_type = dich_conformita_dm37 (blocco
    // fornitori v2, commit "proposta dalle DiCo"). Per ogni altro doc_type il
    // prompt istruisce il modello a usare null; il codice lo impone comunque
    // (vedi dopo isValidClassificationResult), perché qui un errore non è
    // innocuo come per "sistema": un'impresa "agganciata" a un documento che
    // non è una DiCo alimenterebbe una proposta di fornitore falsa nel
    // commit (e). additionalProperties:false + required rende questi due
    // campi obbligatori nella risposta (nullable, non assenti): lo schema
    // non lascia al modello la scelta di ometterli.
    ragione_sociale_installatore: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    partita_iva_installatore: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: [
    'doc_type', 'sistema', 'confidence', 'unita_riferimento', 'motivazione',
    'ragione_sociale_installatore', 'partita_iva_installatore',
  ],
  additionalProperties: false,
}

const CLASSIFICATION_SYSTEM_PROMPT = `Sei un assistente che classifica documenti di consegna di residenze immobiliari italiane (dichiarazioni di conformità, attestati energetici, manuali, garanzie, collaudi, certificati di agibilità, capitolati).

Classifica il PDF allegato in UNA delle seguenti categorie:
${DOC_TYPES.map(t => `- ${t}: ${DOC_TYPE_LABELS[t]}`).join('\n')}

Se il documento non è chiaramente riconducibile a nessuna delle categorie sopra (escluso "altro"), usa "altro".

Distinzione importante — "libretto_impianto" vs "manuale": il libretto d'impianto è il documento di registrazione degli interventi e dei controlli di efficienza energetica previsto dalla normativa sugli impianti termici (DPR 74/2013), tipicamente con tabelle da compilare a ogni manutenzione; il manuale è invece la documentazione d'uso e manutenzione fornita dal produttore dell'apparecchio (istruzioni, caratteristiche tecniche). Non confonderli.

Il campo "sistema" indica a QUALE impianto tecnico si riferisce il documento. Valorizzalo SOLO quando il documento riguarda un impianto specifico — tipicamente per dich_conformita_dm37, collaudo, manuale, garanzia. Per ape, agibilita, capitolato, altro → sempre null.
Valori ammessi per "sistema":
${SISTEMI.map(s => `- ${s}: ${SISTEMA_LABELS[s]}`).join('\n')}
Usa un valore specifico solo se l'impianto è chiaramente identificabile dal documento; usa "altro" solo se è chiaramente un impianto ma non rientra nell'elenco. In OGNI caso di dubbio → null: NON indovinare mai l'impianto, un valore inventato produce falsi allarmi di documenti mancanti a valle.

Se il documento cita esplicitamente un'unità immobiliare specifica (es. numero interno, scala, piano) riportalo in unita_riferimento; se il documento riguarda l'intero condominio o non cita un'unità specifica, usa null.

Se doc_type è "dich_conformita_dm37", estrai anche l'impresa installatrice che ha eseguito i lavori: ragione_sociale_installatore (la denominazione dell'impresa esattamente come riportata nel documento) e partita_iva_installatore (solo cifre o testo così come appare, non serve che tu lo formatti: la normalizzazione avviene dopo). Se il documento cita più imprese senza indicare chiaramente quale ha installato l'impianto, o non riporta l'impresa, usa null per entrambi — non indovinare. Per QUALSIASI doc_type diverso da "dich_conformita_dm37", ragione_sociale_installatore e partita_iva_installatore devono essere sempre null.

Assegna un valore di confidence tra 0 e 1 che rifletta quanto sei sicuro della classificazione: valori bassi per documenti ambigui, di scarsa qualità, o dove il contenuto non corrisponde chiaramente a nessuna categoria specifica.

Rispondi SOLO con l'oggetto JSON richiesto dallo schema, nessun altro testo.`

type ClassificationResult = {
  doc_type: DocType
  sistema: Sistema | null
  confidence: number
  unita_riferimento: string | null
  motivazione: string
  ragione_sociale_installatore: string | null
  partita_iva_installatore: string | null
}

// Discriminante servizio-vs-documento (vedi catch sotto): chiave assente/vuota
// a monte, o queste classi di errore dell'SDK durante la chiamata, sono un
// problema del servizio di classificazione, mai del documento — non vanno mai
// scritte come 'fallita'. instanceof Anthropic.APIError con status >= 500 è
// una rete di sicurezza per errori non passati da APIError.generate() (che
// mappa già ogni 5xx a InternalServerError).
function isServiceUnavailableError(err: unknown): boolean {
  return (
    err instanceof Anthropic.APIConnectionError ||
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.RateLimitError ||
    err instanceof Anthropic.InternalServerError ||
    (err instanceof Anthropic.APIError && typeof err.status === 'number' && err.status >= 500)
  )
}

function isValidClassificationResult(value: unknown): value is ClassificationResult {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.doc_type !== 'string' || !(DOC_TYPES as string[]).includes(v.doc_type)) return false
  if (v.sistema !== null && (typeof v.sistema !== 'string' || !(SISTEMI as string[]).includes(v.sistema))) return false
  if (typeof v.confidence !== 'number' || Number.isNaN(v.confidence) || v.confidence < 0 || v.confidence > 1) return false
  if (v.unita_riferimento !== null && typeof v.unita_riferimento !== 'string') return false
  if (typeof v.motivazione !== 'string') return false
  if (v.ragione_sociale_installatore !== null && typeof v.ragione_sociale_installatore !== 'string') return false
  if (v.partita_iva_installatore !== null && typeof v.partita_iva_installatore !== 'string') return false
  return true
}

// POST /api/classify-document — { documentId } — super_admin del builder
// proprietario, o admin assegnato alla residenza del documento. Un documento
// per invocazione (il batch è un loop client-side sequenziale, vedi
// DocumentiClient.tsx).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  const session = sessionOutcome({ user, error: userError })
  if (session.kind === 'technical') {
    console.error('[classify-document] verifica sessione fallita:', session.message)
    return NextResponse.json({ error: TECHNICAL_ERROR_MESSAGE }, { status: 500 })
  }
  if (session.kind === 'unauthenticated') {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const documentId = body?.documentId
  if (!documentId || typeof documentId !== 'string') {
    return NextResponse.json({ error: 'Parametro documentId mancante' }, { status: 400 })
  }

  // Scoping builder: service role bypassa RLS, la verifica sta in
  // authorizeDocumentActor (src/lib/document-access.ts), fonte unica con
  // extract-document. 403 per il ruolo sbagliato, 404 "Documento non trovato"
  // per documento inesistente o fuori perimetro (stessa risposta per i due
  // ruoli, per non rivelare all'admin documenti di altre residenze), 500
  // "Errore tecnico, riprova" per un guasto di lettura: `error` mai scartato.
  const admin = createServiceClient()
  const actor = await authorizeDocumentActor(admin, session.userId, documentId, '[classify-document]')
  if (!actor.ok) return NextResponse.json({ error: actor.error }, { status: actor.status })
  const { doc } = actor

  // Tipo atteso (E1b, caricamento da una cella del quadro): facoltativo, ma se c'è
  // deve essere un doc_type ammesso. Un valore non valido è un 400, mai ignorato.
  // Validato dopo l'autorizzazione: chi non può agire sul documento non impara
  // nulla dal tipo di errore di un parametro.
  const expectedParse = parseExpectedDocType(body?.expected_doc_type)
  if (!expectedParse.ok) {
    return NextResponse.json(
      { error: 'Parametro expected_doc_type non valido', cause: 'invalid_expected_doc_type' },
      { status: 400 },
    )
  }
  const expectedDocType = expectedParse.expected

  // Corto circuito, non unico discriminante: chiave assente e chiave vuota
  // (es. riga duplicata in .env.local) vanno trattate come lo stesso caso,
  // PRIMA di toccare 'in_corso' — mai un documento appeso su 'in_corso' per
  // un problema di configurazione mai partito.
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error('[classify-document] ANTHROPIC_API_KEY assente o vuota — servizio di classificazione non disponibile')
    return NextResponse.json({ error: 'Servizio di classificazione non disponibile', cause: 'service_unavailable' }, { status: 503 })
  }

  // Se questa scrittura fallisce non si spende la chiamata AI e non c'è nulla
  // da riportare indietro: il documento non è mai entrato in 'in_corso'.
  try {
    await writeDocumentState(admin, documentId, { classification_status: 'in_corso' }, 'in_corso')
  } catch (err) {
    if (err instanceof ClassificationWriteError) {
      return NextResponse.json(WRITE_ERROR_FAILURE.body, { status: WRITE_ERROR_FAILURE.status })
    }
    throw err
  }

  try {
    const arrayBuffer = await downloadDocumentBuffer(admin, doc.storage_path)

    if (!hasPdfMagicBytes(arrayBuffer)) {
      await writeDocumentState(admin, documentId, {
        classification_status: 'da_revisionare',
        extracted_metadata: {
          skipped_reason: 'tipo file non supportato per classificazione automatica',
        },
      }, 'da_revisionare (non PDF)')
      return NextResponse.json({ status: 'da_revisionare', reason: 'not_a_pdf' })
    }

    if (arrayBuffer.byteLength > MAX_PDF_BYTES_FOR_API) {
      await writeDocumentState(admin, documentId, {
        classification_status: 'da_revisionare',
        extracted_metadata: {
          nota: 'PDF oltre 32MB: limite della richiesta API, classificazione automatica saltata',
        },
      }, 'da_revisionare (oltre 32MB)')
      return NextResponse.json({ status: 'da_revisionare', reason: 'file_too_large' })
    }

    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const anthropic = new Anthropic()

    const response = await anthropic.messages.create(
      {
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        thinking: { type: 'disabled' },
        system: [
          {
            type: 'text',
            text: CLASSIFICATION_SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        output_config: {
          format: { type: 'json_schema', schema: CLASSIFICATION_SCHEMA },
        },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: base64 },
              },
              { type: 'text', text: 'Classifica questo documento secondo lo schema fornito.' },
            ],
          },
        ],
      },
      // maxRetries: 1 → un solo retry automatico su 429/5xx (invece del default
      // 2), poi l'errore risale e va in 'fallita'. timeout: budget generoso ma
      // entro maxDuration=120 della route, lasciando margine a download+scrittura.
      { maxRetries: 1, timeout: 90_000 }
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

    if (!isValidClassificationResult(parsed)) {
      throw new Error('Risposta AI non conforme allo schema atteso')
    }

    console.log('[ai-usage]', JSON.stringify({
      route: 'classify-document',
      doc_type: parsed.doc_type,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
    }))

    // Sotto soglia, oppure tipo diverso da quello atteso dal chiamante: il
    // documento non si chiude da solo e va controllato da una persona.
    const { status: finalStatus, mismatch } = classificationOutcome({
      confidence: parsed.confidence,
      docType: parsed.doc_type,
      expected: expectedDocType,
    })

    // Impresa installatrice: imposta a null per ogni doc_type diverso da
    // dich_conformita_dm37, indipendentemente da cosa ha risposto il modello.
    // Il prompt già lo chiede, ma qui è imposto anche in codice — a differenza
    // di `sistema`, un valore che sfugge alla regola non resterebbe un'etichetta
    // sbagliata: alimenterebbe una proposta di fornitore falsa nel commit (e).
    // Partita IVA normalizzata PRIMA di scrivere extracted_metadata: è la
    // chiave di match di quel commit, e "IT 01234567891" vs "01234567891"
    // fallirebbe il match pur essendo lo stesso numero. La normalizzazione
    // non riscrive extracted_metadata dopo il fatto (il verbale resta
    // write-once): sostituisce solo cosa entra nel verbale al momento della
    // prima scrittura.
    const isDichiarazioneConformita = parsed.doc_type === 'dich_conformita_dm37'
    const extractedMetadata: ClassificationResult = {
      ...parsed,
      ragione_sociale_installatore: isDichiarazioneConformita ? parsed.ragione_sociale_installatore : null,
      partita_iva_installatore: isDichiarazioneConformita ? normalizeVatNumber(parsed.partita_iva_installatore) : null,
    }

    await writeDocumentState(admin, documentId, {
      classification_status: finalStatus,
      doc_type: parsed.doc_type,
      // Colonna `sistema` = verità (per ora, dalla proposta AI; l'umano la
      // può correggere in revisione). Coerente con extracted_metadata, che
      // resta il verbale della proposta. null = nessun impianto specifico.
      sistema: parsed.sistema,
      classification_confidence: parsed.confidence,
      extracted_metadata: extractedMetadata,
    }, 'classificazione finale')

    // Proposta di unità dal testo del verbale (E1b). Mai un'assegnazione, e un
    // guasto qui non cambia l'esito della classificazione già scritta.
    await refreshUnitProposal(admin, documentId)

    return NextResponse.json({
      status: finalStatus,
      doc_type: parsed.doc_type,
      confidence: parsed.confidence,
      // Solo con un tipo atteso: il client ne ricava il toast "controlla".
      ...(expectedDocType !== null && {
        expected_doc_type: expectedDocType,
        actual_doc_type: parsed.doc_type,
        mismatch,
      }),
      usage: response.usage,
    })
  } catch (err) {
    // Nessuno stato zombie su 'in_corso': ogni ramo riporta il documento in
    // coda ('non_classificato': scrittura o storage fallito, servizio AI giù)
    // o lo chiude ('fallita': errore sul documento). Rollback loggato se fallisce.
    const failure = await handleClassificationFailure(admin, documentId, err, isServiceUnavailableError(err))
    return NextResponse.json(failure.body, { status: failure.status })
  }
}
