/**
 * Helper di LETTURA del feed attività: raggruppamento per giorno e resa di
 * data e ora. Gemello di lettura di `activity-log.ts`, che è la scrittura.
 *
 * Estratti da `admin/attivita/page.tsx`, dove erano funzioni locali non
 * esportate: la pagina di portafoglio e quella di residenza devono raggruppare
 * e formattare allo stesso modo, e due copie della stessa regola di
 * presentazione sono la bug class dei calcoli duplicati (CLAUDE.md).
 *
 * Qui non entra nessuna nozione di `activity_events`: questi helper lavorano su
 * qualunque cosa abbia un istante. La forma dell'evento NON è un contratto di
 * questo modulo.
 */

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** "Oggi" · "Ieri" · "3 settembre 2026". Il confronto è a giorni di calendario. */
export function dayLabel(date: Date, now: Date): string {
  const diffDays = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000)
  if (diffDays === 0) return 'Oggi'
  if (diffDays === 1) return 'Ieri'
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

export type DayGroup<T> = { label: string; events: T[] }

/**
 * Raggruppa in fasce di giorno consecutive.
 *
 * Il vincolo è su `{ at: Date }` e non sulla forma dell'evento: portare qui la
 * firma su un tipo con i testi già formattati significherebbe portare in
 * `src/lib/` proprio il contratto che il registro vieta.
 *
 * PRECONDIZIONE: `events` già ordinato per `at` decrescente. Accorpa solo run
 * CONSECUTIVI con la stessa etichetta — su un array non ordinato produce più
 * gruppi con lo stesso titolo invece di riordinarli.
 */
export function groupByDay<T extends { at: Date }>(events: T[], now: Date): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  for (const event of events) {
    const label = dayLabel(event.at, now)
    const current = groups[groups.length - 1]
    if (current && current.label === label) {
      current.events.push(event)
    } else {
      groups.push({ label, events: [event] })
    }
  }
  return groups
}
