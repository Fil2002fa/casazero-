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
 * Valida una data ISO 'YYYY-MM-DD' e la restituisce scomposta. Un eventuale
 * orario viene scartato: una scadenza e una data di calendario, non un
 * istante. Valida anche il calendario (31 feb e 29 feb non bisestile sono
 * rifiutati), cosi `nextDueFrom` e `resolveDueBasis` non hanno due idee
 * diverse di cosa sia una data accettabile. `label` dice al chiamante QUALE
 * valore era malformato: senza, un errore su una cascata a quattro livelli
 * non dice da quale colonna arriva il dato sbagliato.
 */
function parseISODate(value: string, label: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(value)
  if (!m) {
    throw new Error(`${label}: data non ISO 'YYYY-MM-DD': ${JSON.stringify(value)}`)
  }
  const year = Number(m[1])
  const month = Number(m[2]) // 1-based, come nella stringa
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month - 1)) {
    throw new Error(`${label}: data inesistente nel calendario: ${value}`)
  }
  return { year, month, day }
}

/** La stessa data ridotta al giorno di calendario, orario scartato. */
function isoDay(value: string, label: string): string {
  const { year, month, day } = parseISODate(value, label)
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`
}

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
  if (!Number.isSafeInteger(frequencyMonths)) {
    throw new Error(`nextDueFrom: frequenza non intera: ${JSON.stringify(frequencyMonths)}`)
  }
  const { year, month, day } = parseISODate(baseISO, 'nextDueFrom: data base')

  // Mesi assoluti dall'anno zero: evita i casi limite di un ciclo su +/- 12.
  const totalMonths = (year * 12) + (month - 1) + frequencyMonths
  const targetYear = Math.floor(totalMonths / 12)
  const targetMonthIndex = totalMonths - (targetYear * 12) // sempre 0..11
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonthIndex))

  return `${String(targetYear).padStart(4, '0')}-${pad(targetMonthIndex + 1)}-${pad(targetDay)}`
}

// ---------------------------------------------------------------------------
// Cascata della data di consegna
// ---------------------------------------------------------------------------
// La base di una scadenza si risolve risalendo i livelli, e l'ordine NON e lo
// stesso nei due ambiti:
//
//   voce di unita        override voce > [unita consegnata: categoria > unita] > NULL
//   voce di parti comuni override voce > categoria > residenza > NULL
//
// e questa funzione e l'UNICO posto dove quell'ordine e scritto in TypeScript.
// La base risolta non si salva da nessuna parte (vincolo del 24/10): esiste
// solo il tempo di un calcolo. Salvarla significherebbe tenerla sincronizzata
// a ogni cambio di data di unita o di categoria, cioe la classe di bug che la
// cascata chiude. Le RPC di creazione riproducono la stessa precedenza in SQL
// (044): quando si cambia qui, va cambiata anche quella.
//
// LA DATA DELL'UNITA E UN CANCELLO, NON UN LIVELLO DI FALLBACK (precisazione
// del 24/10). Se l'unita non ha data di consegna, il piano di quell'unita non
// parte: il risultato e null e nessun livello piu generico puo farlo partire,
// nemmeno una data di categoria. Un'unita invenduta deve restare ferma anche
// quando il costruttore fissa una data per la categoria "Termico" di tutta la
// residenza: quella data riguarda le unita consegnate, non le altre.
//
// Di conseguenza la categoria sta SOPRA la data dell'unita ma SOTTO il
// cancello: su un'unita consegnata una data di categoria la scavalca, su una
// non consegnata non viene nemmeno letta.
//
// L'unica eccezione e l'override di voce, che e un atto manuale e deliberato
// su quella singola voce: quello vince anche prima della consegna.
//
// Il livello 'residenza' appartiene alle parti comuni ("Le voci di parti
// comuni restano sulla data della residenza", decisione del 24/10). Ricadere
// sulla residenza per una voce di unita rimetterebbe in piedi il difetto di
// partenza: un'unita invenduta con le scadenze di una consegnata il giorno
// della fine lavori. Per questo il tipo non espone nemmeno `residenceDate`
// sul ramo 'unit' — quel ritorno non e scrivibile per sbaglio.
//
// LA CASCATA GOVERNA SOLO LA PRIMA SCADENZA. Dal primo completamento in poi la
// data la riscrive il trigger czero_recalc_due da completed_at
// (003_m2.sql:22-27): il fascicolo prende il posto del modello, e per questo
// il ricalcolo su cambio data salta ogni voce che ha gia un completamento.

/** Livello della cascata che ha fornito la data base. */
export type DueBasisLevel = 'voce' | 'categoria' | 'unita' | 'residenza'

export type DueBasis = {
  /** Data base ISO 'YYYY-MM-DD', o null se nessun livello ne ha una. */
  date: string | null
  /** Quale livello l'ha fornita; null quando `date` e null. */
  level: DueBasisLevel | null
}

type DueBasisCommon = {
  /** maintenance_items.due_basis_override: SOLO l'override manuale di voce. */
  itemOverride: string | null
  /** residence_category_dates.delivery_date per la categoria di questa voce. */
  categoryDate: string | null
}

/**
 * L'ambito e discriminante, non un flag: una voce di parti comuni non ha una
 * data di unita e una voce di unita non deve poter vedere quella della
 * residenza. Il tipo lo impone, cosi l'invariante non dipende da chi chiama.
 */
export type DueBasisInput =
  // unitDate null = unita non consegnata: e il cancello, non un livello.
  | (DueBasisCommon & { scope: 'unit'; unitDate: string | null })
  | (DueBasisCommon & { scope: 'condominium'; residenceDate: string | null })

/**
 * Data base di una voce, risalendo la cascata. Restituisce anche il livello,
 * perche le superfici devono poter dire da dove viene la data ("dalla data
 * dell'unita", "override di voce") e l'anteprima della modale deve mostrarlo
 * prima di confermare.
 *
 * Le date malformate lanciano (vedi parseISODate): una base sbagliata
 * produrrebbe una scadenza sbagliata indistinguibile da una giusta. Una
 * stringa vuota NON equivale a null: chi scrive normalizza a null prima di
 * salvare, qui un '' e un dato corrotto e va detto.
 */
export function resolveDueBasis(input: DueBasisInput): DueBasis {
  // L'override di voce e un atto manuale e deliberato su quella singola voce:
  // vince sempre, anche su un'unita non consegnata. E l'unico modo di far
  // partire una voce prima della consegna.
  if (input.itemOverride !== null) {
    return { date: isoDay(input.itemOverride, 'due_basis_override'), level: 'voce' }
  }

  if (input.scope === 'unit') {
    // CANCELLO, non livello di fallback: senza data di consegna il piano
    // dell'unita non parte, e nessun livello piu generico puo farlo partire.
    // La data di categoria non viene nemmeno letta.
    if (input.unitDate === null) return { date: null, level: null }
    if (input.categoryDate !== null) {
      return {
        date: isoDay(input.categoryDate, 'residence_category_dates.delivery_date'),
        level: 'categoria',
      }
    }
    return { date: isoDay(input.unitDate, 'units.delivery_date'), level: 'unita' }
  }

  // Parti comuni: catena piena, la residenza e il loro livello di consegna.
  if (input.categoryDate !== null) {
    return {
      date: isoDay(input.categoryDate, 'residence_category_dates.delivery_date'),
      level: 'categoria',
    }
  }
  return input.residenceDate === null
    ? { date: null, level: null }
    : { date: isoDay(input.residenceDate, 'residences.delivery_date'), level: 'residenza' }
}
