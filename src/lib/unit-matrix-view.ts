/**
 * Regola di vista del quadro unità × documenti (E1b, commit 10): quando il
 * quadro passa in modalità compatta, quali righe mostra, cosa dice quando non
 * ne mostra nessuna. Modulo puro sulle righe già calcolate da unitDocumentRows
 * (unit-documents.ts, che non si tocca): nessuna query, nessuno stato.
 * Verificato da scripts/verify-unit-matrix-view.mjs (npm run verify:unitmatrix).
 *
 * Fino a COMPACT_UNIT_THRESHOLD unità il quadro è quello di sempre: nessun
 * toggle, nessuna ricerca, tutte le righe. Oltre la soglia il toggle "Solo
 * unità incomplete" è acceso di default e la ricerca per unità si compone con
 * lui in AND. Il toggle vive nel componente come override (null = nessuna
 * scelta dell'utente): il valore effettivo si ricalcola dal numero di unità,
 * così non esiste uno stato da tenere sincronizzato quando le unità cambiano.
 *
 * "Incompleta" = almeno una cella non "presente": `da_verificare` conta come
 * incompleta, perché la classificazione non è ancora chiusa.
 */
import type { UnitDocState } from './unit-documents'

/** Oltre questo numero di unità il quadro passa in modalità compatta. */
export const COMPACT_UNIT_THRESHOLD = 12

/** Il minimo che serve di una riga: la verifica non dipende da DocRow né da UnitRow completi. */
export type MatrixRowLike = {
  unit: { label: string }
  cells: ReadonlyArray<{ state: UnitDocState }>
}

export type MatrixFilter = {
  incompleteOnly: boolean
  query: string
}

export function isCompactMatrix(unitCount: number): boolean {
  return unitCount > COMPACT_UNIT_THRESHOLD
}

export function isUnitIncomplete(row: MatrixRowLike): boolean {
  return row.cells.some(cell => cell.state !== 'presente')
}

/**
 * Valore effettivo del toggle. `override` è la scelta dell'utente (null = mai
 * toccato). Sotto o pari alla soglia il toggle non esiste e non filtra mai,
 * qualunque sia l'override.
 */
export function effectiveIncompleteOnly(override: boolean | null, unitCount: number): boolean {
  if (!isCompactMatrix(unitCount)) return false
  return override ?? true
}

/** Minuscolo, senza accenti, spazi compressi e tagliati. */
export function normalizeUnitQuery(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Righe da mostrare, nell'ordine ricevuto (l'ordinamento delle unità resta a
 * chi chiama). Non muta `rows`. Ricerca vuota = nessun filtro di ricerca.
 */
export function filterMatrixRows<T extends MatrixRowLike>(rows: readonly T[], filter: MatrixFilter): T[] {
  const query = normalizeUnitQuery(filter.query)
  return rows.filter(row => {
    if (filter.incompleteOnly && !isUnitIncomplete(row)) return false
    if (query !== '' && !normalizeUnitQuery(row.unit.label).includes(query)) return false
    return true
  })
}

/** "5 di 15 unità": senza, il toggle nasconderebbe righe in silenzio. */
export function formatMatrixCount(shown: number, total: number): string {
  return `${shown} di ${total} unità`
}

export type MatrixEmptyKind =
  /** Toggle acceso, nessuna ricerca: tutte le unità sono complete. */
  | 'all_complete'
  /** Toggle acceso e ricerca: nessuna incompleta corrisponde, ma tra tutte le unità sì. */
  | 'no_incomplete_match'
  /** La ricerca non corrisponde a nessuna unità, neanche togliendo il toggle. */
  | 'no_match'
  /** Nessuna unità nella residenza. */
  | 'no_units'

export type MatrixEmptyState = {
  kind: MatrixEmptyKind
  /** Vero se "Mostra tutte" porta davvero a delle righe. */
  offerShowAll: boolean
}

/**
 * Cosa dire quando la lista filtrata è vuota; null se ci sono righe da
 * mostrare. "Mostra tutte" si offre solo quando spegnere il toggle serve a
 * qualcosa: mai su una ricerca che non corrisponde a nessuna unità.
 */
export function matrixEmptyState<T extends MatrixRowLike>(rows: readonly T[], filter: MatrixFilter): MatrixEmptyState | null {
  if (filterMatrixRows(rows, filter).length > 0) return null
  if (rows.length === 0) return { kind: 'no_units', offerShowAll: false }
  const hasQuery = normalizeUnitQuery(filter.query) !== ''
  if (filter.incompleteOnly) {
    if (!hasQuery) return { kind: 'all_complete', offerShowAll: true }
    const withoutToggle = filterMatrixRows(rows, { incompleteOnly: false, query: filter.query })
    return withoutToggle.length > 0
      ? { kind: 'no_incomplete_match', offerShowAll: true }
      : { kind: 'no_match', offerShowAll: false }
  }
  return { kind: 'no_match', offerShowAll: false }
}
