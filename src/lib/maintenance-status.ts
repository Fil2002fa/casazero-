import type { CompletionMode, ItemActivation } from '@/types/database'

// Fonte di verità per lo stato live delle manutenzioni.
//
// "Scaduta" si calcola SEMPRE da next_due_date confrontata con oggi, mai dal
// campo `status` salvato: quello lo avanza solo il cron (che non gira in locale
// e in produzione lascia buchi tra un run e l'altro). `status` resta legittimo
// solo per gli stati espliciti del ciclo amministratore ('in_corso') e per il
// cron notifiche.
//
// Invarianti:
// - una voce promemoria non è MAI scaduta; la modalità si risolve
//   item.completion_mode ?? template.completion_mode (join), mai da priority
// - contano solo template attivi a catalogo (is_active) e item inclusi
//   nella residenza (activation_status = 'inclusa')

export type LiveStatusItem = {
  status: string
  next_due_date: string | null
  completion_mode: CompletionMode | null
  activation_status: ItemActivation
  maintenance_templates: {
    completion_mode: CompletionMode | null
    is_active: boolean
  } | null
}

// Campi minimi da selezionare per usare l'helper: comporre come
// `${LIVE_STATUS_FIELDS}, maintenance_templates!inner(${LIVE_STATUS_TEMPLATE_FIELDS})`
export const LIVE_STATUS_FIELDS =
  'status, next_due_date, completion_mode, activation_status'
export const LIVE_STATUS_TEMPLATE_FIELDS = 'completion_mode, is_active'

export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

export function resolveCompletionMode(i: LiveStatusItem): CompletionMode | null {
  return i.completion_mode ?? i.maintenance_templates?.completion_mode ?? null
}

/** Voce conteggiabile: template attivo a catalogo e item incluso nella residenza. */
export function isCountable(i: LiveStatusItem): boolean {
  return i.activation_status === 'inclusa' && i.maintenance_templates?.is_active === true
}

/**
 * Scaduta live. 'in_corso' è un bucket separato (presa in carico), non scaduta.
 * Le date sono stringhe ISO (YYYY-MM-DD): il confronto lessicografico è corretto.
 */
export function isOverdueLive(i: LiveStatusItem, today: string = todayISO()): boolean {
  return (
    isCountable(i) &&
    resolveCompletionMode(i) !== 'promemoria' &&
    i.status !== 'completata' &&
    i.status !== 'in_corso' &&
    i.next_due_date !== null &&
    i.next_due_date < today
  )
}

export function isInCorso(i: LiveStatusItem): boolean {
  return isCountable(i) && i.status === 'in_corso'
}

export function overdueLive<T extends LiveStatusItem>(
  items: T[],
  today: string = todayISO()
): T[] {
  return items.filter(i => isOverdueLive(i, today))
}

export type LiveCounts = {
  scadute: number
  scaduteResidente: number
  scaduteAmministratore: number
  inCorso: number
}

export function countLive(items: LiveStatusItem[], today: string = todayISO()): LiveCounts {
  const overdue = overdueLive(items, today)
  return {
    scadute: overdue.length,
    scaduteResidente: overdue.filter(i => resolveCompletionMode(i) === 'residente').length,
    scaduteAmministratore: overdue.filter(i => resolveCompletionMode(i) === 'amministratore').length,
    inCorso: items.filter(i => isInCorso(i)).length,
  }
}
