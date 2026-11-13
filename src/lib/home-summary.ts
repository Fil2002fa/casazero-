// Riepilogo della card verde "La tua casa, oggi". Nessuna logica di stato nuova:
// "scaduta" e "in corso" vengono da maintenance-status, la finestra di 30 giorni
// (estremo incluso) da maintenance-list (SOON_WINDOW_DAYS, addDaysISO), la stessa
// della lista del costruttore. Le promemoria non entrano mai nei conteggi.
//
// - overdue: scadute live (non promemoria).
// - soon:    datate da oggi a oggi+30, non scadute e non prese in carico.
// - top:     la voce più urgente tra quelle A CARICO DEL RESIDENTE
//            (completion_mode = 'residente'): prima le scadute, poi le in scadenza,
//            a parità la data più vicina. Le voci "in corso" non sono urgenze.
import { addDaysISO, SOON_WINDOW_DAYS } from './maintenance-list'
import {
  isCountable, isInCorso, isOverdueLive, resolveCompletionMode, type LiveStatusItem,
} from './maintenance-status'

export type HomeSummary<T> = { overdue: number; soon: number; top: { item: T; overdue: boolean } | null }

export function summarizeHome<T extends LiveStatusItem>(items: readonly T[], today: string): HomeSummary<T> {
  const soonLimit = addDaysISO(today, SOON_WINDOW_DAYS)
  const overdueItems: T[] = []
  const soonItems: T[] = []
  for (const i of items) {
    if (!isCountable(i) || resolveCompletionMode(i) === 'promemoria' || i.status === 'completata') continue
    if (isOverdueLive(i, today)) overdueItems.push(i)
    else if (!isInCorso(i) && i.next_due_date !== null && i.next_due_date >= today && i.next_due_date <= soonLimit) soonItems.push(i)
  }
  const byDate = (a: T, b: T) => (a.next_due_date ?? '').localeCompare(b.next_due_date ?? '')
  const mine = (i: T) => resolveCompletionMode(i) === 'residente'
  const topOverdue = overdueItems.filter(mine).sort(byDate)[0]
  const topSoon = soonItems.filter(mine).sort(byDate)[0]
  return {
    overdue: overdueItems.length,
    soon: soonItems.length,
    top: topOverdue ? { item: topOverdue, overdue: true } : topSoon ? { item: topSoon, overdue: false } : null,
  }
}

// "In arrivo": le prossime voci del piano dopo quella già in evidenza nella card
// verde. Stesso perimetro dei conteggi (countable, non promemoria, non completate),
// stato per voce con gli stessi predicati di timedState (maintenance-list.ts) e le
// stesse etichette (LIST_STATE_LABELS). L'ordine è quello d'ingresso: le query
// ordinano per next_due_date crescente con le date nulle in fondo.
import { LIST_STATE_LABELS, type ListState } from './maintenance-list'
import { isAwaitingDelivery } from './maintenance-status'

export type UpcomingRow<T> = { item: T; state: ListState; label: string }

export function upcomingItems<T extends LiveStatusItem & { id: string }>(
  items: readonly T[], today: string, excludeId: string | null, limit = 3,
): UpcomingRow<T>[] {
  const soonLimit = addDaysISO(today, SOON_WINDOW_DAYS)
  const rows: UpcomingRow<T>[] = []
  for (const i of items) {
    if (i.id === excludeId) continue
    if (!isCountable(i) || resolveCompletionMode(i) === 'promemoria' || i.status === 'completata') continue
    const state: ListState = isOverdueLive(i, today) ? 'scaduta'
      : isInCorso(i) ? 'in_corso'
      : isAwaitingDelivery(i) ? 'in_attesa_consegna'
      : i.next_due_date !== null && i.next_due_date <= soonLimit ? 'entro_30'
      : 'piu_avanti'
    rows.push({ item: i, state, label: LIST_STATE_LABELS[state] })
    if (rows.length === limit) break
  }
  return rows
}
