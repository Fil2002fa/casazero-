/**
 * Contatori della testata del quadro unità × documenti (E1b, commit 12).
 * Modulo puro sulle righe già calcolate da unitDocumentRows (unit-documents.ts):
 * nessuna query, nessuno stato. Verificato da
 * scripts/verify-unit-matrix-summary.mjs (npm run verify:matrixsummary).
 *
 * Si conta per SLOT, cioè per cella del quadro (unità × tipo atteso), non per
 * documenti: il chip "Da verificare (N)" e il badge dei tab contano altro.
 * T = somma delle celle di tutte le righe, quindi unità × tipi attesi senza un
 * numero scritto a mano. La firma prende SOLO le righe: toggle e ricerca non
 * hanno modo di entrare, e chi chiama deve passare tutte le righe, mai quelle
 * filtrate (filterMatrixRows).
 *
 * "Completo" = nessuno slot mancante E nessuno da verificare: una cella ambra
 * non è completa (stessa regola di isUnitIncomplete in unit-matrix-view.ts).
 */
import type { MatrixRowLike } from './unit-matrix-view'
import { pluralize } from './pluralize'

export type MatrixSummary = {
  /** Tutti gli slot: unità × tipi attesi. */
  total: number
  /** Celle "mancante". */
  missing: number
  /** Celle "da_verificare". */
  toVerify: number
  /** Nessuno slot mancante e nessuno da verificare. */
  allComplete: boolean
}

/** null senza unità: la testata non mostra niente. */
export function matrixSummary(rows: readonly MatrixRowLike[]): MatrixSummary | null {
  if (rows.length === 0) return null
  let total = 0
  let missing = 0
  let toVerify = 0
  for (const row of rows) {
    for (const cell of row.cells) {
      total += 1
      if (cell.state === 'mancante') missing += 1
      else if (cell.state === 'da_verificare') toVerify += 1
    }
  }
  return { total, missing, toVerify, allComplete: missing === 0 && toVerify === 0 }
}

export type SummaryPillKind = 'missing' | 'all_complete' | 'to_verify'

export type SummaryPill = { kind: SummaryPillKind; text: string }

/**
 * Le pillole da mostrare, nell'ordine di lettura. Mancanti e "tutti completi"
 * si escludono a vicenda; "tutti completi" esce solo senza slot ambra, quindi
 * con zero mancanti e qualcosa da verificare resta la sola pillola ambra.
 */
export function summaryPills(summary: MatrixSummary | null): SummaryPill[] {
  if (summary === null) return []
  const pills: SummaryPill[] = []
  if (summary.missing > 0) {
    pills.push({
      kind: 'missing',
      text: `${pluralize(summary.missing, 'slot mancante', 'slot mancanti')} su ${summary.total}`,
    })
  } else if (summary.allComplete) {
    pills.push({ kind: 'all_complete', text: `Tutti i ${summary.total} slot sono completi` })
  }
  if (summary.toVerify > 0) {
    pills.push({ kind: 'to_verify', text: `${summary.toVerify} slot da verificare` })
  }
  return pills
}
