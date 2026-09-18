/**
 * Export Excel dei documenti di una residenza: una riga per documento, con
 * gli stessi valori che la pagina Documenti mostra. Modulo puro, senza
 * libreria xlsx: produce celle tipizzate (testo o data ISO) che la route
 * api/documenti-xlsx converte nel formato di write-excel-file. Verificato
 * da scripts/verify-document-export.mjs.
 *
 * Tutti i documenti della residenza, anche quelli senza estrazione o non
 * classificati: le celle che dipendono dall'estrazione restano vuote.
 * Nessun dato contabile: lo schema non ne contiene.
 *
 * Import relativi tra moduli di lib: vedi document-rows.ts.
 */
import { humanizeDocumentTitle } from './documentTitle'
import { formatUnitLabel } from './formatUnitLabel'
import { DOC_TYPE_LABELS } from './document-classification'
import { normalizeIsoDate } from './document-extraction'
import { displayDate, documentFacts, type DocRow, type UnitRow } from './document-rows'

export const DOCUMENT_EXPORT_HEADERS = [
  'Titolo',
  'Tipo',
  'Ambito',
  'Unità',
  'Data documento',
  'Scadenza o validità',
  'Installatore',
  'Partita IVA',
  'Compagnia',
  'Numero polizza',
  'Classe energetica',
  'Oggetto coperto',
] as const

// Una data resta una data (ordinabile e filtrabile in Excel), mai una
// stringa formattata. La partita IVA e il numero di polizza restano testo:
// come numero Excel perderebbero gli zeri iniziali.
export type ExportCell =
  | { type: 'text'; value: string }
  | { type: 'date'; value: string }   // ISO yyyy-mm-dd
  | null

function text(value: string | null): ExportCell {
  return value ? { type: 'text', value } : null
}

// Primi 10 caratteri, come formatDateIT: la data in riga può essere il
// created_at (TIMESTAMPTZ) quando il documento non ha altre date.
function date(value: string | null): ExportCell {
  const iso = value ? normalizeIsoDate(value.slice(0, 10)) : null
  return iso ? { type: 'date', value: iso } : null
}

// Ordinamento naturale per etichetta, come la pagina della residenza:
// "Unità 2" prima di "Unità 10" (la query ordina label come TEXT).
function compareUnitLabels(a: UnitRow, b: UnitRow): number {
  return a.label.localeCompare(b.label, 'it', { numeric: true, sensitivity: 'base' })
}

export function documentExportRow(doc: DocRow, unitLabel: string | null): ExportCell[] {
  const facts = documentFacts(doc)
  return [
    text(humanizeDocumentTitle(doc.title)),
    text(doc.doc_type ? DOC_TYPE_LABELS[doc.doc_type] : null),
    text(facts.ambito),
    text(unitLabel ? formatUnitLabel(unitLabel) : null),
    date(displayDate(doc)),
    facts.validUntil ? date(facts.validUntil) : text(facts.validityFormula),
    text(facts.installatore),
    text(facts.partitaIva),
    text(facts.compagnia),
    text(facts.numeroPolizza),
    text(facts.classeEnergetica),
    text(facts.oggetto),
  ]
}

// Righe nell'ordine della consegna: prima i documenti di residenza
// (unit_id null), poi le unità in ordine naturale di etichetta; dentro
// ogni gruppo l'ordine ricevuto (created_at decrescente, come a schermo).
// "Unità" è l'unità assegnata all'upload (documents.unit_id), non quella
// citata nel testo, che sta nella colonna Ambito.
export function documentExportRows(docs: DocRow[], units: UnitRow[]): ExportCell[][] {
  const rows: ExportCell[][] = []
  for (const doc of docs) {
    if (doc.unit_id === null) rows.push(documentExportRow(doc, null))
  }
  const sortedUnits = [...units].sort(compareUnitLabels)
  const known = new Set(sortedUnits.map(u => u.id))
  for (const unit of sortedUnits) {
    for (const doc of docs) {
      if (doc.unit_id === unit.id) rows.push(documentExportRow(doc, unit.label))
    }
  }
  // Difesa: un unit_id senza unità nella lista (non dovrebbe accadere, FK
  // sulla stessa residenza) non fa sparire il documento dall'export.
  for (const doc of docs) {
    if (doc.unit_id !== null && !known.has(doc.unit_id)) rows.push(documentExportRow(doc, null))
  }
  return rows
}
