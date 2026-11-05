/**
 * Scheda "Scadenze" dell'Excel di residenza: una riga per voce di
 * manutenzione del piano attivo. Modulo puro (celle tipizzate di
 * xlsx-helpers), verificato da scripts/verify-residence-export.mjs.
 *
 * Perimetro: solo voci conteggiabili (activation_status 'inclusa' e template
 * attivo, isCountable). Archiviate ed escluse restano fuori: Piano ≠
 * fascicolo, e i completamenti stanno nel fascicolo.
 *
 * INVARIANTE PROMEMORIA: una voce a modalità promemoria non è mai "scaduta".
 * La cella Stato dice sempre "Consigliata · ogni X mesi", la cella Prossima
 * scadenza resta vuota, e `status` e le date non vengono nemmeno guardati
 * per quel ramo. Stato "Scaduta" si calcola live da next_due_date
 * (isOverdueLive), mai dal campo status salvato.
 *
 * Il fornitore è un dato interno del costruttore: la colonna esiste solo se
 * il chiamante la chiede (`includeSupplier`), cioè per il super_admin.
 *
 * Import relativi tra moduli di lib: vedi document-rows.ts.
 */
import type { CompletionMode, ItemActivation, ObligationType } from '@/types/database'
import { formatFrequency } from './formatFrequency'
import { formatUnitLabel } from './formatUnitLabel'
import { MAINTENANCE_STATUS_LABELS, MODE_LABELS, OBLIGATION_LABELS } from './maintenance-labels'
import {
  AWAITING_DELIVERY_LABEL,
  isAwaitingDelivery,
  isCountable,
  resolveCompletionMode,
  resolveFrequencyMonths,
  resolveLiveStatus,
  resolveObligationType,
  todayISO,
} from './maintenance-status'
import { normalizeEmbed } from './postgrest-embed'
import { dateCell, textCell, type ExportCell } from './xlsx-helpers'

export type DeadlineItem = {
  unit_id: string | null
  status: string
  next_due_date: string | null
  completion_mode: CompletionMode | null
  obligation_type: ObligationType | null
  frequency_months: number | null
  activation_status: ItemActivation
  maintenance_templates: {
    title: string
    category: string | null
    frequency_months: number | null
    completion_mode: CompletionMode | null
    obligation_type: ObligationType | null
    is_active: boolean
  } | null
  unitLabel: string | null
  supplierName: string | null
}

/** Riga come la restituisce PostgREST: gli embed to-one possono essere oggetto o array. */
export type RawDeadlineItem = Omit<DeadlineItem, 'maintenance_templates' | 'unitLabel' | 'supplierName'> & {
  maintenance_templates: unknown
  units: unknown
  suppliers?: unknown
}

export function toDeadlineItem(raw: RawDeadlineItem): DeadlineItem {
  const units = normalizeEmbed<{ label?: unknown }>(raw.units)
  const supplier = normalizeEmbed<{ name?: unknown }>(raw.suppliers)
  return {
    unit_id: raw.unit_id,
    status: raw.status,
    next_due_date: raw.next_due_date,
    completion_mode: raw.completion_mode,
    obligation_type: raw.obligation_type,
    frequency_months: raw.frequency_months,
    activation_status: raw.activation_status,
    maintenance_templates: normalizeEmbed<NonNullable<DeadlineItem['maintenance_templates']>>(raw.maintenance_templates),
    unitLabel: typeof units?.label === 'string' ? units.label : null,
    supplierName: typeof supplier?.name === 'string' ? supplier.name : null,
  }
}

const BASE_HEADERS = [
  'Unità',
  'Manutenzione',
  'Categoria',
  'Modalità',
  'Tipo',
  'Frequenza',
  'Prossima scadenza',
  'Stato',
] as const

export function deadlineExportHeaders(includeSupplier: boolean): string[] {
  return includeSupplier ? [...BASE_HEADERS, 'Fornitore'] : [...BASE_HEADERS]
}

// Soggetto della riga: si decide su unit_id (colonna della voce), mai sulla
// sola etichetta, che un embed nascosto dalla RLS lascerebbe vuota.
function subject(item: DeadlineItem): string {
  if (item.unit_id === null) return 'Parti comuni'
  return item.unitLabel ? formatUnitLabel(item.unitLabel) : 'Unità sconosciuta'
}

function statusText(item: DeadlineItem, mode: CompletionMode | null, freq: number | null, today: string): string {
  // Promemoria: ramo che non legge status né date.
  if (mode === 'promemoria') return freq === null ? 'Consigliata' : `Consigliata · ${formatFrequency(freq)}`
  if (item.status === 'completata') return MAINTENANCE_STATUS_LABELS.completata
  const live = resolveLiveStatus(item, today)
  if (live === 'in_attesa' && isAwaitingDelivery(item)) return AWAITING_DELIVERY_LABEL
  return MAINTENANCE_STATUS_LABELS[live]
}

export function deadlineExportRow(item: DeadlineItem, opts: { today: string; includeSupplier: boolean }): ExportCell[] {
  const mode = resolveCompletionMode(item)
  const obligation = resolveObligationType({ obligation_type: item.obligation_type, maintenance_templates: item.maintenance_templates })
  const freq = resolveFrequencyMonths({ frequency_months: item.frequency_months, maintenance_templates: item.maintenance_templates })
  const row: ExportCell[] = [
    textCell(subject(item)),
    textCell(item.maintenance_templates?.title ?? null),
    textCell(item.maintenance_templates?.category ?? null),
    textCell(mode ? MODE_LABELS[mode] : null),
    textCell(obligation ? OBLIGATION_LABELS[obligation] : null),
    textCell(freq === null ? null : formatFrequency(freq)),
    // Promemoria: mai una data.
    mode === 'promemoria' ? null : dateCell(item.next_due_date),
    textCell(statusText(item, mode, freq, opts.today)),
  ]
  if (opts.includeSupplier) row.push(textCell(item.supplierName))
  return row
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'it', { numeric: true, sensitivity: 'base' })
}

/**
 * Righe nell'ordine della consegna: parti comuni, poi le unità in ordine
 * naturale di etichetta, e dentro ogni gruppo per titolo. Solo voci del piano
 * attivo (isCountable).
 */
export function deadlineExportRows(
  items: DeadlineItem[],
  opts: { today?: string; includeSupplier: boolean },
): ExportCell[][] {
  const today = opts.today ?? todayISO()
  return items
    .filter(isCountable)
    .map(item => ({ item, group: item.unit_id === null ? 0 : 1, label: subject(item), title: item.maintenance_templates?.title ?? '' }))
    .sort((a, b) => a.group - b.group || compareText(a.label, b.label) || compareText(a.title, b.title))
    .map(({ item }) => deadlineExportRow(item, { today, includeSupplier: opts.includeSupplier }))
}
