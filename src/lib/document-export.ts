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
import {
  DOC_TYPE_LABELS,
  classificationConfidenceBand,
  type ClassificationStatus,
  type ConfidenceBand,
} from './document-classification'
import { textCell, dateCell, type ExportCell } from './xlsx-helpers'
import { compareUnitLabels } from './unit-utils'
import {
  correctedFieldLabels,
  dataOrigin,
  displayDate,
  documentFacts,
  type DataOrigin,
  type DocRow,
  type UnitRow,
} from './document-rows'

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
  'File',
  'Stato classificazione',
  'Confidenza classificazione',
  'Origine del dato',
  'Campi corretti a mano',
] as const

// Stato di classificazione: stessa parola della card dove esiste ("Da
// rivedere"); 'non_classificato' non ha badge a schermo ma nel foglio una
// cella vuota sarebbe ambigua.
const CLASSIFICATION_STATUS_LABELS: Record<ClassificationStatus, string> = {
  completata: 'Classificato',
  da_revisionare: 'Da rivedere',
  fallita: 'Non classificabile',
  in_corso: 'In classificazione',
  non_classificato: 'Non classificato',
}

const CONFIDENCE_BAND_LABELS: Record<ConfidenceBand, string> = {
  alta: 'Alta',
  media: 'Media',
  bassa: 'Bassa',
}

const DATA_ORIGIN_LABELS: Record<DataOrigin, string> = {
  da_verificare: 'Da verificare',
  non_estratto: 'Non estratto',
  corretto_a_mano: 'Corretto a mano',
  ai: 'AI',
}

// Celle tipizzate e conversione xlsx: src/lib/xlsx-helpers.ts.
const text = textCell
const date = dateCell

// Ordinamento naturale per etichetta, come la pagina della residenza:
// "Unità 2" prima di "Unità 10" (la query ordina label come TEXT).
function compareUnitRows(a: UnitRow, b: UnitRow): number {
  return compareUnitLabels(a.label, b.label)
}

export function documentExportRow(doc: DocRow, unitLabel: string | null): ExportCell[] {
  const facts = documentFacts(doc)
  const origin = dataOrigin(doc)
  const corrected = correctedFieldLabels(doc)
  const band = classificationConfidenceBand(doc.classification_confidence)
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
    text(doc.file_name),
    text(CLASSIFICATION_STATUS_LABELS[doc.classification_status] ?? null),
    text(band ? CONFIDENCE_BAND_LABELS[band] : null),
    text(origin ? DATA_ORIGIN_LABELS[origin] : null),
    text(corrected.length > 0 ? corrected.join(', ') : null),
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
  const sortedUnits = [...units].sort(compareUnitRows)
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
