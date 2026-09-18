/**
 * Lettura delle righe documento di una residenza, con embed 1:1 di
 * document_extractions (040) normalizzato, e delle sue unità. Estratta da
 * documenti/page.tsx perché l'export Excel (api/documenti-xlsx) deve
 * restituire esattamente le righe che la pagina mostra: una sola select,
 * un solo punto di normalizzazione.
 *
 * Va chiamata con il client di SESSIONE: la policy SELECT di
 * document_extractions delega a documents, quindi chi vede il documento
 * vede la sua estrazione, e il perimetro resta quello di RLS.
 *
 * `error` non viene mai scartato: la prima causa tecnica va nel log del
 * server e torna al chiamante, che decide come mostrarla (la pagina rende
 * la lista vuota come faceva prima, la route risponde 500).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeEmbed } from '@/lib/postgrest-embed'
import type { DocumentExtractionRow } from '@/lib/document-extraction'
import type { DocRow, UnitRow } from '@/lib/document-rows'

export type ResidenceDocumentRows = {
  docs: DocRow[]
  units: UnitRow[]
  error: string | null
}

export async function loadResidenceDocumentRows(
  supabase: SupabaseClient,
  residenceId: string,
): Promise<ResidenceDocumentRows> {
  const [{ data: rawDocs, error: docsError }, { data: rawUnits, error: unitsError }] = await Promise.all([
    supabase
      .from('documents')
      .select('id, title, category, file_name, storage_path, file_date, unit_id, created_at, classification_status, doc_type, sistema, classification_confidence, extracted_metadata, document_extractions(for_doc_type, status, document_date, ambito, unita_riferimento, valid_until, fields)')
      .eq('residence_id', residenceId)
      .order('created_at', { ascending: false }),
    supabase
      .from('units')
      .select('id, label')
      .eq('residence_id', residenceId)
      .order('label'),
  ])

  const firstError = docsError ?? unitsError
  if (firstError) {
    console.error('[document-rows] lettura documenti/unità fallita', { residenceId, error: firstError })
  }

  // L'embed to-one può tornare oggetto o array di un elemento (bug class
  // registrata, vedi postgrest-embed.ts): normalizzato qui, una volta.
  const docs: DocRow[] = ((rawDocs ?? []) as Array<Record<string, unknown>>).map(row => {
    const { document_extractions, ...rest } = row
    return {
      ...(rest as Omit<DocRow, 'extraction'>),
      extraction: normalizeEmbed<DocumentExtractionRow>(document_extractions),
    }
  })

  return {
    docs,
    units: (rawUnits ?? []) as UnitRow[],
    error: firstError ? firstError.message : null,
  }
}
