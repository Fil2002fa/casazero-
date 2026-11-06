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
import { normalizeEmbed } from './postgrest-embed'
import type { DocumentExtractionRow } from '@/lib/document-extraction'
import type { DocRow, UnitRow } from '@/lib/document-rows'
import type { OverrideRow } from '@/lib/document-overrides'

export type ResidenceDocumentRows = {
  docs: DocRow[]
  units: UnitRow[]
  error: string | null
}

// Colonne lette per ogni riga documento: una sola stringa per la pagina, l'export
// e il calcolo delle proposte di unità.
export const DOCUMENT_ROW_SELECT =
  'id, title, category, file_name, storage_path, file_date, unit_id, created_at, classification_status, doc_type, sistema, classification_confidence, extracted_metadata, proposed_unit_id, unit_proposal_confidence, unit_proposal_dismissed_at, document_extractions(for_doc_type, status, document_date, ambito, unita_riferimento, valid_until, fields), document_field_overrides(for_doc_type, field_key, value, set_by, set_at)'

// L'embed to-one può tornare oggetto o array di un elemento (bug class
// registrata, vedi postgrest-embed.ts): normalizzato qui, una volta.
export function toDocRow(row: Record<string, unknown>): DocRow {
  const { document_extractions, document_field_overrides, ...rest } = row
  return {
    ...(rest as Omit<DocRow, 'extraction' | 'overrides'>),
    extraction: normalizeEmbed<DocumentExtractionRow>(document_extractions),
    // Embed to-many (048, PK su più righe per documento): sempre array.
    overrides: Array.isArray(document_field_overrides) ? (document_field_overrides as OverrideRow[]) : [],
  }
}

export async function loadResidenceDocumentRows(
  supabase: SupabaseClient,
  residenceId: string,
): Promise<ResidenceDocumentRows> {
  const [{ data: rawDocs, error: docsError }, { data: rawUnits, error: unitsError }] = await Promise.all([
    supabase
      .from('documents')
      .select(DOCUMENT_ROW_SELECT)
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

  const docs: DocRow[] = ((rawDocs ?? []) as Array<Record<string, unknown>>).map(toDocRow)

  return {
    docs,
    units: (rawUnits ?? []) as UnitRow[],
    error: firstError ? firstError.message : null,
  }
}
