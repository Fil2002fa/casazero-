import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import {
  DOC_TYPES,
  DOC_TYPE_LABELS,
  CLASSIFICATION_CONFIDENCE_THRESHOLD,
  SISTEMI,
  SISTEMA_LABELS,
  type DocType,
  type Sistema,
} from '@/lib/document-classification'

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
  },
  required: ['doc_type', 'sistema', 'confidence', 'unita_riferimento', 'motivazione'],
  additionalProperties: false,
}

const CLASSIFICATION_SYSTEM_PROMPT = `Sei un assistente che classifica documenti di consegna di residenze immobiliari italiane (dichiarazioni di conformità, attestati energetici, manuali, garanzie, collaudi, certificati di agibilità, capitolati).

Classifica il PDF allegato in UNA delle seguenti categorie:
${DOC_TYPES.map(t => `- ${t}: ${DOC_TYPE_LABELS[t]}`).join('\n')}

Se il documento non è chiaramente riconducibile a nessuna delle categorie sopra (escluso "altro"), usa "altro".

Il campo "sistema" indica a QUALE impianto tecnico si riferisce il documento. Valorizzalo SOLO quando il documento riguarda un impianto specifico — tipicamente per dich_conformita_dm37, collaudo, manuale, garanzia. Per ape, agibilita, capitolato, altro → sempre null.
Valori ammessi per "sistema":
${SISTEMI.map(s => `- ${s}: ${SISTEMA_LABELS[s]}`).join('\n')}
Usa un valore specifico solo se l'impianto è chiaramente identificabile dal documento; usa "altro" solo se è chiaramente un impianto ma non rientra nell'elenco. In OGNI caso di dubbio → null: NON indovinare mai l'impianto, un valore inventato produce falsi allarmi di documenti mancanti a valle.

Se il documento cita esplicitamente un'unità immobiliare specifica (es. numero interno, scala, piano) riportalo in unita_riferimento; se il documento riguarda l'intero condominio o non cita un'unità specifica, usa null.

Assegna un valore di confidence tra 0 e 1 che rifletta quanto sei sicuro della classificazione: valori bassi per documenti ambigui, di scarsa qualità, o dove il contenuto non corrisponde chiaramente a nessuna categoria specifica.

Rispondi SOLO con l'oggetto JSON richiesto dallo schema, nessun altro testo.`

type ClassificationResult = {
  doc_type: DocType
  sistema: Sistema | null
  confidence: number
  unita_riferimento: string | null
  motivazione: string
}

function isValidClassificationResult(value: unknown): value is ClassificationResult {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.doc_type !== 'string' || !(DOC_TYPES as string[]).includes(v.doc_type)) return false
  if (v.sistema !== null && (typeof v.sistema !== 'string' || !(SISTEMI as string[]).includes(v.sistema))) return false
  if (typeof v.confidence !== 'number' || Number.isNaN(v.confidence) || v.confidence < 0 || v.confidence > 1) return false
  if (v.unita_riferimento !== null && typeof v.unita_riferimento !== 'string') return false
  if (typeof v.motivazione !== 'string') return false
  return true
}

// POST /api/classify-document — { documentId } — solo super_admin del builder
// proprietario. Un documento per invocazione (il batch è un loop client-side
// sequenziale, vedi DocumentiClient.tsx).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const admin = createServiceClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('role, builder_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'super_admin') {
    return NextResponse.json({ error: 'Permessi insufficienti' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const documentId = body?.documentId
  if (!documentId || typeof documentId !== 'string') {
    return NextResponse.json({ error: 'Parametro documentId mancante' }, { status: 400 })
  }

  const { data: doc } = await admin
    .from('documents')
    .select('id, title, storage_path, residence_id')
    .eq('id', documentId)
    .single()

  if (!doc) return NextResponse.json({ error: 'Documento non trovato' }, { status: 404 })

  // Scoping builder: service role bypassa RLS, la verifica va fatta qui
  // (stesso pattern di /api/reconcile-documents e /api/fascicolo-pdf).
  const { data: residence } = await admin
    .from('residences')
    .select('id')
    .eq('id', doc.residence_id)
    .eq('builder_id', profile.builder_id)
    .maybeSingle()

  if (!residence) return NextResponse.json({ error: 'Documento non trovato' }, { status: 404 })

  await admin.from('documents').update({ classification_status: 'in_corso' }).eq('id', documentId)

  try {
    const { data: fileBlob, error: downloadError } = await admin.storage
      .from('documents')
      .download(doc.storage_path)

    if (downloadError || !fileBlob) {
      throw new Error(`Errore download storage: ${downloadError?.message ?? 'sconosciuto'}`)
    }

    const arrayBuffer = await fileBlob.arrayBuffer()

    if (!hasPdfMagicBytes(arrayBuffer)) {
      await admin.from('documents').update({
        classification_status: 'da_revisionare',
        extracted_metadata: {
          skipped_reason: 'tipo file non supportato per classificazione automatica',
        },
      }).eq('id', documentId)
      return NextResponse.json({ status: 'da_revisionare', reason: 'not_a_pdf' })
    }

    if (arrayBuffer.byteLength > MAX_PDF_BYTES_FOR_API) {
      await admin.from('documents').update({
        classification_status: 'da_revisionare',
        extracted_metadata: {
          nota: 'PDF oltre 32MB: limite della richiesta API, classificazione automatica saltata',
        },
      }).eq('id', documentId)
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

    const finalStatus = parsed.confidence >= CLASSIFICATION_CONFIDENCE_THRESHOLD ? 'completata' : 'da_revisionare'

    await admin.from('documents').update({
      classification_status: finalStatus,
      doc_type: parsed.doc_type,
      classification_confidence: parsed.confidence,
      extracted_metadata: parsed,
    }).eq('id', documentId)

    return NextResponse.json({
      status: finalStatus,
      doc_type: parsed.doc_type,
      confidence: parsed.confidence,
      usage: response.usage,
    })
  } catch (err) {
    // Nessuno stato zombie: qualunque errore da qui in poi (download, chiamata
    // AI, parsing, schema non conforme) risolve sempre in 'fallita' — mai
    // output non validato scritto in doc_type.
    await admin.from('documents').update({ classification_status: 'fallita' }).eq('id', documentId)
    const message = err instanceof Error ? err.message : 'Errore sconosciuto'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
