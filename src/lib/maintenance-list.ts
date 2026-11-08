import type { CompletionMode, ItemActivation, ObligationType } from '@/types/database'
import {
  AWAITING_DELIVERY_LABEL,
  isAwaitingDelivery,
  isCountable,
  isInCorso,
  isOverdueLive,
  resolveCompletionMode,
  resolveFrequencyMonths,
  resolveObligationType,
} from './maintenance-status'
import { MAINTENANCE_STATUS_LABELS } from './maintenance-labels'
import { pluralize } from './pluralize'

// Lista del piano manutenzioni vista costruttore (residences/[id]/manutenzioni,
// tab Attive): UNA riga per voce (template), raggruppata per urgenza. Regola
// pura, senza React e senza query: la lista, le pillole di testa e i filtri
// leggono tutti da qui (verify:maintlist), mai predicati riscritti inline.
//
// Le righe arrivano dalle istanze della residenza (maintenance_items). Lo stato
// di ogni istanza si calcola con gli helper di maintenance-status.ts (scaduta
// live da next_due_date, mai dal campo status); qui si aggiunge solo la
// finestra "entro 30 giorni" e l'aggregazione per voce.
//
// INVARIANTE PROMEMORIA. Un'istanza promemoria non entra mai in un confronto di
// date: il codice la separa PRIMA di toccare status e next_due_date, quindi una
// voce fatta solo di promemoria sta nel gruppo "Consigliate", senza stato,
// prossima e ultima, qualunque cosa dica il DB. In una voce mista (alcune
// unità promemoria, altre no) stato, prossima e ultima vengono solo dalle
// istanze non promemoria.

/** Istanza come la legge la lista: sottoinsieme strutturale di ItemRow. */
export type ListItem = {
  id: string
  template_id: string
  unit_id: string | null
  status: string
  next_due_date: string | null
  completion_mode: CompletionMode | null
  obligation_type: ObligationType | null
  activation_status: ItemActivation
  frequency_months: number | null
  maintenance_templates: {
    title: string
    category: string
    completion_mode: CompletionMode | null
    obligation_type: ObligationType | null
    frequency_months: number | null
    is_active: boolean
  } | null
  units: { label: string } | null
}

/** Completamento, solo in lettura: serve la data per "Ultima". */
export type ListCompletion = { item_id: string; completed_at: string }

export type ListState = 'scaduta' | 'in_corso' | 'entro_30' | 'piu_avanti' | 'in_attesa_consegna'
export type ListGroupKey = ListState | 'consigliate'

/**
 * Ordine dei gruppi, deciso da Filippo: Scadute, Entro 30 giorni, In corso,
 * Più avanti, In attesa di consegna, Consigliate. È anche il rango dello stato
 * peggiore di una voce (una voce sta nel suo gruppo più in alto): una voce con
 * una unità in scadenza e una presa in carico sta in "Entro 30 giorni".
 */
export const LIST_GROUP_ORDER: readonly ListGroupKey[] = [
  'scaduta', 'entro_30', 'in_corso', 'piu_avanti', 'in_attesa_consegna', 'consigliate',
]

/** Estremo incluso: oggi + 30 giorni è ancora "entro 30 giorni", +31 è "più avanti". */
export const SOON_WINDOW_DAYS = 30

export const LIST_GROUP_LABELS: Record<ListGroupKey, string> = {
  scaduta:            'Scadute',
  in_corso:           MAINTENANCE_STATUS_LABELS.in_corso,
  entro_30:           'Entro 30 giorni',
  piu_avanti:         'Più avanti',
  in_attesa_consegna: AWAITING_DELIVERY_LABEL,
  consigliate:        'Consigliate',
}

/** Testo del badge di stato nella riga. Le consigliate non ne hanno (null). */
export const LIST_STATE_LABELS: Record<ListState, string> = {
  scaduta:            MAINTENANCE_STATUS_LABELS.scaduta,
  in_corso:           MAINTENANCE_STATUS_LABELS.in_corso,
  entro_30:           'In scadenza',
  piu_avanti:         MAINTENANCE_STATUS_LABELS.in_attesa,
  in_attesa_consegna: AWAITING_DELIVERY_LABEL,
}

const GROUP_RANK: Record<ListGroupKey, number> =
  Object.fromEntries(LIST_GROUP_ORDER.map((k, i) => [k, i])) as Record<ListGroupKey, number>

const MODE_ORDER: readonly CompletionMode[] = ['amministratore', 'residente', 'promemoria']
const OBLIGATION_ORDER: readonly ObligationType[] = ['A', 'B', 'C']

export type MaintenanceListRow = {
  templateId: string
  title: string
  /** Il "sistema" del mockup: maintenance_templates.category. */
  category: string
  group: ListGroupKey
  /** Tutte le istanze sono sulle parti comuni (unit_id nullo). */
  isCommon: boolean
  /** Unità distinte con un'istanza della voce (0 per le parti comuni). */
  unitCount: number
  /** Valori distinti tra le istanze: più di uno = "valori diversi tra le unità". */
  modes: CompletionMode[]
  obligations: ObligationType[]
  frequencies: number[]
  /** Scadenza minima tra le istanze non promemoria con data, e l'unità che scade per prima. */
  next: { date: string; unitLabel: string | null } | null
  /** Ultima esecuzione massima tra le istanze non promemoria. */
  last: string | null
  /** Istanze non promemoria in attesa di consegna e istanze non promemoria in tutto. */
  awaitingCount: number
  timedCount: number
}

// ---------------------------------------------------------------------------
// Date: ISO 'YYYY-MM-DD' in aritmetica UTC, nessun fuso e nessun toLocale*.
// ---------------------------------------------------------------------------

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10)
}

/** Etichette con numero in ordine naturale: "Unità 2" prima di "Unità 10". */
export function compareLabels(a: string, b: string): number {
  return a.localeCompare(b, 'it', { numeric: true })
}

// ---------------------------------------------------------------------------
// Stato di una istanza NON promemoria
// ---------------------------------------------------------------------------

/**
 * Da chiamare solo su istanze countable, non completate e non promemoria
 * (buildMaintenanceList le separa prima). Ordine: scaduta live, in corso
 * (presa in carico), in attesa di consegna (data nulla), poi la finestra di
 * 30 giorni. Una istanza datata che arriva in fondo ha data >= oggi: il passato
 * è già stato preso da isOverdueLive o da isInCorso.
 */
export function timedState(i: ListItem, today: string, soonLimit: string): ListState {
  if (isOverdueLive(i, today)) return 'scaduta'
  if (isInCorso(i)) return 'in_corso'
  if (isAwaitingDelivery(i)) return 'in_attesa_consegna'
  const due = i.next_due_date
  return due !== null && due <= soonLimit ? 'entro_30' : 'piu_avanti'
}

/** Stesso stato della riga di lista, per la griglia unità del pannello di dettaglio. */
export { timedState as itemState }

/** Ultima esecuzione per istanza (completed_at massimo). Solo lettura sui completamenti. */
export function lastCompletionByItem(completions: readonly ListCompletion[]): Map<string, string> {
  const lastByItem = new Map<string, string>()
  for (const c of completions) {
    const cur = lastByItem.get(c.item_id)
    if (cur === undefined || c.completed_at > cur) lastByItem.set(c.item_id, c.completed_at)
  }
  return lastByItem
}

function distinct<T>(values: readonly (T | null)[], order?: readonly T[]): T[] {
  const set = new Set<T>()
  for (const v of values) if (v !== null) set.add(v)
  const out = [...set]
  if (order) return out.sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return out
}

// ---------------------------------------------------------------------------
// Costruzione della lista
// ---------------------------------------------------------------------------

/**
 * Una riga per voce. Contano solo le istanze incluse di template attivi
 * (isCountable); tra le non promemoria si scartano le 'completata'. Le
 * archiviate non entrano: restano nel fascicolo, non nel piano attivo.
 */
export function buildMaintenanceList(
  items: readonly ListItem[],
  completions: readonly ListCompletion[],
  today: string,
): MaintenanceListRow[] {
  const soonLimit = addDaysISO(today, SOON_WINDOW_DAYS)

  const lastByItem = lastCompletionByItem(completions)

  const byTemplate = new Map<string, ListItem[]>()
  for (const i of items) {
    if (!isCountable(i)) continue
    const bucket = byTemplate.get(i.template_id)
    if (bucket) bucket.push(i)
    else byTemplate.set(i.template_id, [i])
  }

  const rows: MaintenanceListRow[] = []
  for (const [templateId, all] of byTemplate) {
    const tpl = all[0].maintenance_templates
    if (!tpl) continue // isCountable lo esclude già: guardia per il tipo

    // Separazione PRIMA di leggere status e data: le promemoria non passano di qui.
    const timed = all.filter(i => resolveCompletionMode(i) !== 'promemoria' && i.status !== 'completata')
    const onlyReminders = all.every(i => resolveCompletionMode(i) === 'promemoria')
    if (timed.length === 0 && !onlyReminders) continue // restano solo istanze completate

    let group: ListGroupKey = 'consigliate'
    let next: MaintenanceListRow['next'] = null
    let last: string | null = null
    let awaitingCount = 0

    if (timed.length > 0) {
      const states = timed.map(i => timedState(i, today, soonLimit))
      group = states.reduce((worst, s) => (GROUP_RANK[s] < GROUP_RANK[worst] ? s : worst), states[0])
      awaitingCount = states.filter(s => s === 'in_attesa_consegna').length

      for (const i of timed) {
        const due = i.next_due_date
        if (due === null) continue
        const label = i.unit_id === null ? null : (i.units?.label ?? null)
        if (
          next === null ||
          due < next.date ||
          (due === next.date && label !== null && next.unitLabel !== null && compareLabels(label, next.unitLabel) < 0)
        ) {
          next = { date: due, unitLabel: label }
        }
      }

      for (const i of timed) {
        const done = lastByItem.get(i.id)
        if (done !== undefined && (last === null || done > last)) last = done
      }
    }

    rows.push({
      templateId,
      title: tpl.title,
      category: tpl.category,
      group,
      isCommon: all.every(i => i.unit_id === null),
      unitCount: new Set(all.map(i => i.unit_id).filter((u): u is string => u !== null)).size,
      modes: distinct(all.map(resolveCompletionMode), MODE_ORDER),
      obligations: distinct(all.map(resolveObligationType), OBLIGATION_ORDER),
      frequencies: distinct(all.map(resolveFrequencyMonths)).sort((a, b) => a - b),
      next,
      last,
      awaitingCount,
      timedCount: timed.length,
    })
  }

  return rows.sort(compareRows)
}

/** "Parti comuni" o "N unità": una sola frase per la riga della lista e per il pannello. */
export function rowScopeLabel(row: Pick<MaintenanceListRow, 'isCommon' | 'unitCount'>): string {
  return row.isCommon ? 'Parti comuni' : pluralize(row.unitCount, 'unità', 'unità')
}

/** Gruppo, poi scadenza crescente (senza data in coda), poi titolo. */
function compareRows(a: MaintenanceListRow, b: MaintenanceListRow): number {
  const g = GROUP_RANK[a.group] - GROUP_RANK[b.group]
  if (g !== 0) return g
  const da = a.next?.date ?? null
  const db = b.next?.date ?? null
  if (da !== db) {
    if (da === null) return 1
    if (db === null) return -1
    return da < db ? -1 : 1
  }
  return a.title.localeCompare(b.title, 'it')
}

export type MaintenanceListGroup = { key: ListGroupKey; label: string; rows: MaintenanceListRow[] }

/** Solo i gruppi con almeno una riga, nell'ordine di LIST_GROUP_ORDER. */
export function groupRows(rows: readonly MaintenanceListRow[]): MaintenanceListGroup[] {
  return LIST_GROUP_ORDER
    .map(key => ({ key, label: LIST_GROUP_LABELS[key], rows: rows.filter(r => r.group === key) }))
    .filter(g => g.rows.length > 0)
}

// ---------------------------------------------------------------------------
// Filtri
// ---------------------------------------------------------------------------

export type ListFilters = {
  query: string
  unitId: string | null
  /** Solo obblighi di legge (tipo A). */
  lawOnly: boolean
  /** Solo voci che chiude l'amministratore. */
  adminOnly: boolean
}

export const NO_FILTERS: ListFilters = { query: '', unitId: null, lawOnly: false, adminOnly: false }

export function hasActiveFilters(f: ListFilters): boolean {
  return f.query.trim() !== '' || f.unitId !== null || f.lawOnly || f.adminOnly
}

/**
 * Filtro-unità come drill-down, a livello di ISTANZA e prima di costruire la
 * lista, così stato, prossima e ultima di ogni riga parlano di quella unità.
 * Le istanze delle parti comuni restano sempre (stessa regola della vista
 * per unità).
 */
export function itemsForUnit<T extends { unit_id: string | null }>(items: readonly T[], unitId: string | null): T[] {
  return unitId === null ? [...items] : items.filter(i => i.unit_id === unitId || i.unit_id === null)
}

function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Ricerca, "solo obblighi di legge" e "solo dell'amministratore" in AND. Il
 * filtro-unità non è qui: agisce sulle istanze (itemsForUnit). Una voce con
 * valori diversi tra le unità passa il filtro se ALMENO una unità lo soddisfa.
 */
export function filterRows(rows: readonly MaintenanceListRow[], f: ListFilters): MaintenanceListRow[] {
  const q = normalizeText(f.query)
  return rows.filter(r => {
    if (q !== '' && !normalizeText(`${r.title} ${r.category}`).includes(q)) return false
    if (f.lawOnly && !r.obligations.includes('A')) return false
    if (f.adminOnly && !r.modes.includes('amministratore')) return false
    return true
  })
}

// ---------------------------------------------------------------------------
// Pillole di testa: contano VOCI (righe), sulle righe INTERE, mai filtrate da
// ricerca e toggle. "Scadute" non include 'in corso' (presa in carico).
// ---------------------------------------------------------------------------

export type ListSummary = { overdue: number; soon: number }
export type ListPillKind = 'overdue' | 'soon' | 'clear'

/** null senza voci a tempo (solo consigliate o nessuna riga): niente riepilogo. */
export function listSummary(rows: readonly MaintenanceListRow[]): ListSummary | null {
  if (!rows.some(r => r.group !== 'consigliate')) return null
  return {
    overdue: rows.filter(r => r.group === 'scaduta').length,
    soon: rows.filter(r => r.group === 'entro_30').length,
  }
}

export function summaryPills(s: ListSummary | null): { kind: ListPillKind; text: string }[] {
  if (s === null) return []
  const pills: { kind: ListPillKind; text: string }[] = []
  if (s.overdue > 0) pills.push({ kind: 'overdue', text: pluralize(s.overdue, 'voce scaduta', 'voci scadute') })
  if (s.soon > 0) pills.push({ kind: 'soon', text: pluralize(s.soon, 'voce entro 30 giorni', 'voci entro 30 giorni') })
  if (pills.length === 0) pills.push({ kind: 'clear', text: 'Nessuna voce scaduta o in scadenza entro 30 giorni' })
  return pills
}
