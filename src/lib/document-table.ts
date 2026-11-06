/**
 * Tabella "Tutti i documenti" della pagina Documenti di residenza (E1b, 7a):
 * filtri, ordinamento e testo cercabile come funzioni pure. Il componente
 * non decide niente da solo, e lo script scripts/verify-document-table.mjs
 * prova ogni regola senza avviare l'app.
 *
 * I filtri della tabella hanno stato proprio e non toccano quelli della lista
 * a card (decisione 7a): quando la lista a card sparirà, spariranno con lei.
 *
 * Import relativi tra moduli di lib: vedi document-rows.ts.
 */
import { DOC_TYPES, DOC_TYPE_LABELS, type DocType } from './document-classification'
import { humanizeDocumentTitle } from './documentTitle'
import { pluralize } from './pluralize'
import { compareUnitLabels } from './unit-utils'
import {
  CLASSIFICATION_STATUS_LABELS,
  REVIEW_LABEL,
  displayDate,
  reviewState,
  type DocRow,
  type ReviewState,
  type UnitRow,
} from './document-rows'

// Valori speciali del filtro Unità. Un id unità è un uuid: non collide.
export const UNIT_FILTER_ALL = 'all'
export const UNIT_FILTER_NONE = 'none'

export type TableStateFilter = 'all' | ReviewState

export type TableFilters = {
  search: string
  // UNIT_FILTER_ALL, UNIT_FILTER_NONE oppure l'id di un'unità.
  unit: string
  docType: DocType | 'all'
  state: TableStateFilter
}

export const EMPTY_TABLE_FILTERS: TableFilters = {
  search: '',
  unit: UNIT_FILTER_ALL,
  docType: 'all',
  state: 'all',
}

export function isTableFiltered(f: TableFilters): boolean {
  return f.search.trim() !== ''
    || f.unit !== UNIT_FILTER_ALL
    || f.docType !== 'all'
    || f.state !== 'all'
}

// Il filtro Stato raggruppa per reviewState (la stessa regola di quadro, badge
// e Excel); la colonna mostra invece la parola precisa del DB. "Da verificare"
// è la stessa costante ambra di tutta la pagina, mai riscritta.
export const STATE_FILTER_OPTIONS: { value: TableStateFilter; label: string }[] = [
  { value: 'all', label: 'Tutti gli stati' },
  { value: 'da_rivedere', label: REVIEW_LABEL },
  { value: 'chiusa', label: CLASSIFICATION_STATUS_LABELS.completata },
  { value: 'in_lavorazione', label: 'Da classificare' },
]

export function tableStateLabel(doc: Pick<DocRow, 'classification_status'>): string {
  return CLASSIFICATION_STATUS_LABELS[doc.classification_status]
}

// Cosa si cerca nel nome: titolo grezzo e leggibile (così "garanzia caldaia"
// trova "certificato_garanzia_caldaia") e nome del file, in minuscolo. Un solo
// posto: la ricerca della lista a card ci aggiunge solo i dati estratti.
export function documentNameText(doc: Pick<DocRow, 'title' | 'file_name'>): string {
  return [doc.title, humanizeDocumentTitle(doc.title), doc.file_name].join(' ').toLowerCase()
}

// Solo i doc_type davvero presenti, in ordine alfabetico per etichetta: in una
// tendina si cerca per nome, non per l'ordine tecnico della costante. Il tipo
// selezionato resta anche a zero documenti, così il select non punta a
// un'option inesistente.
export function presentDocTypes(
  docs: readonly Pick<DocRow, 'doc_type'>[],
  selected: DocType | 'all',
): DocType[] {
  return DOC_TYPES
    .filter(t => t === selected || docs.some(d => d.doc_type === t))
    .sort((a, b) => DOC_TYPE_LABELS[a].localeCompare(DOC_TYPE_LABELS[b], 'it'))
}

// Unità ordinate in modo naturale ("Unità 2" prima di "Unità 10"). Tutte, non
// solo quelle con documenti: filtrare su un'unità vuota è un esito legittimo.
export function sortedUnits(units: readonly UnitRow[]): UnitRow[] {
  return [...units].sort((a, b) => compareUnitLabels(a.label, b.label))
}

export function filterTableDocs(docs: readonly DocRow[], f: TableFilters): DocRow[] {
  const q = f.search.trim().toLowerCase()
  return docs.filter(d => {
    if (f.docType !== 'all' && d.doc_type !== f.docType) return false
    if (f.state !== 'all' && reviewState(d) !== f.state) return false
    if (f.unit === UNIT_FILTER_NONE && d.unit_id !== null) return false
    if (f.unit !== UNIT_FILTER_ALL && f.unit !== UNIT_FILTER_NONE && d.unit_id !== f.unit) return false
    if (q !== '' && !documentNameText(d).includes(q)) return false
    return true
  })
}

// Più recenti in alto (la data mostrata in riga), a parità per titolo e poi per
// id: l'ordine non cambia da un render all'altro. Non muta l'input.
export function sortTableDocs(docs: readonly DocRow[]): DocRow[] {
  return [...docs].sort((a, b) => {
    const byDate = displayDate(b).localeCompare(displayDate(a))
    if (byDate !== 0) return byDate
    const byTitle = humanizeDocumentTitle(a.title).localeCompare(humanizeDocumentTitle(b.title), 'it', { sensitivity: 'base' })
    if (byTitle !== 0) return byTitle
    return a.id.localeCompare(b.id)
  })
}

// ---------------------------------------------------------------------------
// Selezione e assegnazione multipla (E1b, 7a-2)
// ---------------------------------------------------------------------------

// Dei documenti selezionati restano solo quelli ancora in tabella: cambiare un
// filtro o assegnare un documento fuori dal filtro non lascia selezioni
// invisibili su cui un'azione potrebbe agire. Restituisce lo stesso Set se non
// c'è niente da togliere, così un effetto che lo usa non rigenera lo stato a vuoto.
export function pruneSelection(selected: ReadonlySet<string>, visible: readonly Pick<DocRow, 'id'>[]): ReadonlySet<string> {
  const ids = new Set(visible.map(d => d.id))
  let toRemove = false
  for (const id of selected) if (!ids.has(id)) { toRemove = true; break }
  if (!toRemove) return selected
  return new Set([...selected].filter(id => ids.has(id)))
}

export type SelectAllState = 'none' | 'some' | 'all'

export function selectAllState(selected: ReadonlySet<string>, visible: readonly Pick<DocRow, 'id'>[]): SelectAllState {
  if (visible.length === 0) return 'none'
  const n = visible.filter(d => selected.has(d.id)).length
  return n === 0 ? 'none' : n === visible.length ? 'all' : 'some'
}

// Il checkbox di intestazione agisce sulle righe VISIBILI: se sono tutte
// selezionate le deseleziona, altrimenti le seleziona tutte.
export function toggleSelectAll(selected: ReadonlySet<string>, visible: readonly Pick<DocRow, 'id'>[]): Set<string> {
  const next = new Set(selected)
  if (selectAllState(selected, visible) === 'all') for (const d of visible) next.delete(d.id)
  else for (const d of visible) next.add(d.id)
  return next
}

// I documenti già nell'unità di destinazione non si riscrivono: niente chiamata,
// niente evento nel registro, e il messaggio finale li dice a parte.
export function splitBulkAssign<T extends Pick<DocRow, 'unit_id'>>(
  selected: readonly T[],
  targetUnitId: string | null,
): { toApply: T[]; alreadyThere: T[] } {
  return {
    toApply: selected.filter(d => d.unit_id !== targetUnitId),
    alreadyThere: selected.filter(d => d.unit_id === targetUnitId),
  }
}

export type BulkFailure = { name: string; error: string }
export type BulkAssignSummary = { kind: 'success' | 'warning' | 'error'; message: string; persistent: boolean }

const MAX_NAMES_IN_MESSAGE = 3

function endSentence(text: string): string {
  return text.endsWith('.') ? text : text + '.'
}

function namesList(names: readonly string[]): string {
  const shown = names.slice(0, MAX_NAMES_IN_MESSAGE).join(', ')
  const rest = names.length - MAX_NAMES_IN_MESSAGE
  return rest > 0 ? `${shown} e altri ${rest}` : shown
}

// Un solo messaggio per tutto il ciclo ("N assegnati, M falliti: nomi"). Con
// dei fallimenti il toast è persistente, perché i nomi vanno letti e il
// motivo (uno solo, se è lo stesso per tutti) è l'unico indizio su cosa
// ritentare.
export function summarizeBulkAssign(input: {
  assigned: number
  alreadyThere: number
  failures: readonly BulkFailure[]
  // null = documenti riportati alla residenza (nessuna unità)
  targetLabel: string | null
}): BulkAssignSummary {
  const { assigned, alreadyThere, failures, targetLabel } = input
  const where = targetLabel === null ? 'senza unità' : `in ${targetLabel}`
  const already = alreadyThere > 0
    ? ` (${pluralize(alreadyThere, 'era già', 'erano già')} ${where})`
    : ''

  if (failures.length === 0) {
    if (assigned === 0) {
      return { kind: 'success', message: `Niente da fare: ${alreadyThere === 1 ? 'il documento è già' : 'i documenti sono già'} ${where}.`, persistent: false }
    }
    const done = targetLabel === null
      ? `${pluralize(assigned, 'documento riportato', 'documenti riportati')} alla residenza`
      : `${pluralize(assigned, 'documento assegnato', 'documenti assegnati')} a ${targetLabel}`
    return { kind: 'success', message: `${done}${already}.`, persistent: false }
  }

  const reasons = new Set(failures.map(f => f.error))
  const reason = reasons.size === 1 ? ` Motivo: ${[...reasons][0]}` : ''
  const names = namesList(failures.map(f => f.name))
  const failed = pluralize(failures.length, 'fallito', 'falliti')
  if (assigned === 0) {
    return { kind: 'error', message: endSentence(`Nessun documento assegnato, ${failed}: ${names}.${reason}`), persistent: true }
  }
  return {
    kind: 'warning',
    message: endSentence(`${pluralize(assigned, 'assegnato', 'assegnati')}, ${failed}: ${names}.${reason}${already}`),
    persistent: true,
  }
}
