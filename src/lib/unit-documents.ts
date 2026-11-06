/**
 * Documenti attesi PER UNITÀ e loro stato (presente / da verificare /
 * mancante), con i dati chiave di ciascuno. Modulo puro sui DocRow già
 * caricati dalla pagina Documenti: nessuna query. Fonte unica per il quadro
 * unità × documenti in pagina e per il riepilogo unità dell'Excel (E1a,
 * decisione D1: APE, planimetria catastale, dichiarazione di conformità
 * dell'impianto elettrico). Verificato da scripts/verify-unit-documents.mjs.
 *
 * Il quadro si basa SOLO su documents.unit_id: l'unità citata nel testo
 * ("interno 3") è un dato libero dell'AI e non si confronta con le etichette
 * (decisione D2). I documenti che citano un'unità ma non sono assegnati si
 * contano a parte (documentsMentioningUnitWithoutAssignment).
 *
 * La checklist della residenza (document-checklist.ts, B4) non vede lo scope
 * 'unit': questo modulo non la tocca. La regola del sistema (null da una
 * delle due parti = compatibile) è la stessa del match di B4 e vive in
 * sistemaMatches (document-classification.ts), usata da entrambi.
 *
 * Import relativi tra moduli di lib: vedi document-rows.ts.
 */
import {
  DOC_TYPE_LABELS,
  SISTEMA_LABELS,
  sistemaMatches,
  type DocType,
  type Sistema,
} from './document-classification'
import { formatDateIT } from './formatDate'
import {
  currentExtraction,
  dataOrigin,
  displayDate,
  documentFacts,
  isReviewClosed,
  type DocRow,
  type UnitRow,
} from './document-rows'

export type UnitExpectationKey = 'ape' | 'planimetria_catastale' | 'dico_elettrico'

export type UnitExpectation = {
  key: UnitExpectationKey
  docType: DocType
  sistema: Sistema | null
  label: string
}

export const UNIT_EXPECTATIONS: readonly UnitExpectation[] = [
  { key: 'ape', docType: 'ape', sistema: null, label: DOC_TYPE_LABELS.ape },
  { key: 'planimetria_catastale', docType: 'planimetria_catastale', sistema: null, label: DOC_TYPE_LABELS.planimetria_catastale },
  {
    key: 'dico_elettrico',
    docType: 'dich_conformita_dm37',
    sistema: 'elettrico',
    label: `${DOC_TYPE_LABELS.dich_conformita_dm37} · ${SISTEMA_LABELS.elettrico}`,
  },
]

export type UnitDocState = 'presente' | 'da_verificare' | 'mancante'

/** Un dato chiave già etichettato; `date` è ISO yyyy-mm-dd da formattare a chi legge. */
export type KeyDatum = { label: string; value: string; kind: 'text' | 'date' }

export type UnitDocumentCell = {
  expectation: UnitExpectation
  state: UnitDocState
  /** Il documento che decide lo stato: il primo che combacia nell'ordine ricevuto (created_at decrescente). */
  doc: DocRow | null
  /** Solo per 'presente'; vuoto altrimenti. */
  keyData: KeyDatum[]
}

export type UnitDocumentRow = {
  unit: UnitRow
  cells: UnitDocumentCell[]
  /** Documenti assegnati a questa unità (documents.unit_id). */
  documentCount: number
  /** Di questi, quelli con origine "da verificare" (classificazione non chiusa). */
  toVerifyCount: number
}

// Riesportata per chi la importava da qui: la copia unica è in document-classification.ts.
export { sistemaMatches }

// "Presente" legge solo le colonne confermate, come B4: il verbale AI non conta.
function isConfirmedMatch(doc: DocRow, exp: UnitExpectation): boolean {
  return isReviewClosed(doc)
    && doc.doc_type === exp.docType
    && sistemaMatches(exp.sistema, doc.sistema)
}

// "Da verificare": classificazione non chiusa e la PROPOSTA (colonna o verbale
// AI) indica proprio questo tipo. Un documento senza proposta non marca nessuna
// cella: finisce nel conteggio toVerifyCount della riga.
function isUnconfirmedProposal(doc: DocRow, exp: UnitExpectation): boolean {
  if (isReviewClosed(doc)) return false
  const proposedType = doc.doc_type ?? doc.extracted_metadata?.doc_type ?? null
  const proposedSistema = doc.sistema ?? doc.extracted_metadata?.sistema ?? null
  return proposedType === exp.docType && sistemaMatches(exp.sistema, proposedSistema)
}

function dateDatum(label: string, value: string | null): KeyDatum[] {
  const iso = value ? value.slice(0, 10) : ''
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? [{ label, value: iso, kind: 'date' }] : []
}

function textDatum(label: string, value: string | null): KeyDatum[] {
  return value ? [{ label, value, kind: 'text' }] : []
}

// Dati chiave per tipo: da documentFacts e displayDate, gli stessi valori che
// mostrano la card e l'Excel dei documenti.
export function unitKeyData(key: UnitExpectationKey, doc: DocRow): KeyDatum[] {
  const facts = documentFacts(doc)
  switch (key) {
    case 'ape':
      return [
        ...textDatum('Classe energetica', facts.classeEnergetica),
        ...dateDatum('Valida fino al', facts.validUntil),
      ]
    case 'planimetria_catastale':
      return dateDatum('Data documento', displayDate(doc))
    case 'dico_elettrico':
      return [
        ...textDatum('Impresa installatrice', facts.installatore),
        ...dateDatum('Data documento', displayDate(doc)),
      ]
  }
}

/** "Classe energetica: A2 · Valida fino al: 20 feb 2034"; null se non c'è nessun dato. */
export function formatKeyData(keyData: KeyDatum[]): string | null {
  if (keyData.length === 0) return null
  return keyData
    .map(k => `${k.label}: ${k.kind === 'date' ? formatDateIT(k.value) : k.value}`)
    .join(' · ')
}

function buildCell(unitDocs: DocRow[], exp: UnitExpectation): UnitDocumentCell {
  const confirmed = unitDocs.find(d => isConfirmedMatch(d, exp))
  if (confirmed) {
    return { expectation: exp, state: 'presente', doc: confirmed, keyData: unitKeyData(exp.key, confirmed) }
  }
  const proposed = unitDocs.find(d => isUnconfirmedProposal(d, exp))
  if (proposed) return { expectation: exp, state: 'da_verificare', doc: proposed, keyData: [] }
  return { expectation: exp, state: 'mancante', doc: null, keyData: [] }
}

/** Una riga per unità, nell'ordine di `units`. O(documenti + unità). */
export function unitDocumentRows(docs: DocRow[], units: UnitRow[]): UnitDocumentRow[] {
  const byUnit = new Map<string, DocRow[]>()
  for (const doc of docs) {
    if (doc.unit_id === null) continue
    const list = byUnit.get(doc.unit_id)
    if (list) list.push(doc)
    else byUnit.set(doc.unit_id, [doc])
  }
  return units.map(unit => {
    const unitDocs = byUnit.get(unit.id) ?? []
    return {
      unit,
      cells: UNIT_EXPECTATIONS.map(exp => buildCell(unitDocs, exp)),
      documentCount: unitDocs.length,
      toVerifyCount: unitDocs.filter(d => dataOrigin(d) === 'da_verificare').length,
    }
  })
}

/**
 * Documenti della residenza (unit_id nullo) che citano un'unità: ambito
 * "unità" o unità di riferimento valorizzata, sull'estrazione EFFETTIVA
 * (correzioni comprese). Sono quelli da assegnare a mano a un'unità.
 */
export function documentsMentioningUnitWithoutAssignment(docs: DocRow[]): DocRow[] {
  return docs.filter(doc => {
    if (doc.unit_id !== null) return false
    const ext = currentExtraction(doc)
    if (!ext) return false
    return ext.ambito === 'unita' || (ext.unita_riferimento ?? '').trim() !== ''
  })
}
