// ============================================================
// CasaZero — aritmetica delle scadenze di manutenzione.
// Fonte unica: nessun calcolo di scadenza inline, da nessuna superficie.
// ------------------------------------------------------------
// PERCHE' ESISTE: la stessa operazione "data base + frequenza in mesi" era
// scritta in tre modi diversi — `interval` Postgres nelle RPC di creazione e
// nel trigger czero_recalc_due (003_m2.sql), e `setMonth()` JS in tre punti
// applicativi (fornitori/actions.ts due volte, addMonths locale nel cron).
// Le due aritmetiche NON coincidono sui giorni di fine mese:
//
//   31 gen + 1 mese  →  28 feb   con `interval` Postgres (clamp)
//   31 gen + 1 mese  →   3 mar   con setMonth() JS      (rollover)
//
// Il DB è la fonte di verità di una scadenza (il trigger la riscrive a ogni
// completamento), quindi questo modulo adotta la semantica Postgres: clamp
// all'ultimo giorno del mese di arrivo. Gli unici punti che restavano sul
// rollover scrivevano date che il trigger avrebbe poi corretto da sé — una
// divergenza invisibile al type-check e visibile solo a schermo, mesi dopo.
//
// NON fa aritmetica di fuso: una scadenza è una data di calendario, non un
// istante. La data base arriva già come ISO 'YYYY-MM-DD' (colonna DATE,
// campo <input type="date">, o todayISO() in maintenance-status.ts).
// ============================================================

/** Giorni del mese indicato (monthIndex 0-based), calcolati in UTC. */
function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

const pad = (n: number): string => String(n).padStart(2, '0')

/**
 * Prossima scadenza = data base + frequenza in mesi, con la stessa semantica
 * di `date + interval 'N months'` in Postgres: se il giorno non esiste nel
 * mese di arrivo si usa l'ultimo giorno di quel mese (31 gen + 1 = 28 feb),
 * mai il rollover al mese successivo di setMonth() JS (che darebbe 3 mar).
 *
 * `baseISO` è una data ISO 'YYYY-MM-DD'; un eventuale orario viene ignorato
 * (il giorno di calendario è già quello che si vuole: vedi todayISO()).
 * `frequencyMonths` è un intero, anche 0 (stessa data) o negativo.
 *
 * Lancia su input malformato invece di scrivere una data sbagliata: una
 * scadenza silenziosamente errata non si distingue da una corretta, e questo
 * valore finisce su una colonna che decide notifiche e stato "scaduta".
 */
export function nextDueFrom(baseISO: string, frequencyMonths: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(baseISO)
  if (!m) {
    throw new Error(`nextDueFrom: data base non ISO 'YYYY-MM-DD': ${JSON.stringify(baseISO)}`)
  }
  if (!Number.isSafeInteger(frequencyMonths)) {
    throw new Error(`nextDueFrom: frequenza non intera: ${JSON.stringify(frequencyMonths)}`)
  }

  const year = Number(m[1])
  const month = Number(m[2]) // 1-based, come nella stringa
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month - 1)) {
    throw new Error(`nextDueFrom: data base inesistente nel calendario: ${baseISO}`)
  }

  // Mesi assoluti dall'anno zero: evita i casi limite di un ciclo su +/- 12.
  const totalMonths = (year * 12) + (month - 1) + frequencyMonths
  const targetYear = Math.floor(totalMonths / 12)
  const targetMonthIndex = totalMonths - (targetYear * 12) // sempre 0..11
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonthIndex))

  return `${String(targetYear).padStart(4, '0')}-${pad(targetMonthIndex + 1)}-${pad(targetDay)}`
}
