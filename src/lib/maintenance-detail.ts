import type { CompletionMode, ObligationType } from '@/types/database'
import { formatFrequency } from './formatFrequency'
import { formatRegisteredBy } from './formatRegisteredBy'
import { formatUnitLabel } from './formatUnitLabel'
import {
  addDaysISO, buildMaintenanceList, compareLabels, itemState, lastCompletionByItem, SOON_WINDOW_DAYS,
  type ListItem, type ListState, type MaintenanceListRow,
} from './maintenance-list'
import {
  DUE_RULE_LABELS, MODE_ACTOR_PHRASES, OBLIGATION_LABELS, type DueRule,
} from './maintenance-labels'
import {
  isCountable, resolveCompletionMode, resolveFrequencyMonths, resolveObligationType,
} from './maintenance-status'
import { pluralize } from './pluralize'

// Pannello di dettaglio di una VOCE (template) nella vista costruttore: regola
// pura, senza React e senza query (verify:maintdetail). Riusa la riga della
// lista (buildMaintenanceList) per stato, prossima e ultima, così il pannello
// non ricalcola mai un valore che la lista già mostra.
//
// INVARIANTE PROMEMORIA. Un'istanza promemoria non entra mai in un confronto di
// date né in una lettura di status: nella griglia unità ha stato, prossima e
// ultima nulli, qualunque cosa dica il DB (la separazione avviene prima di
// chiamare itemState).
//
// PIANO ≠ FASCICOLO. Le istanze archiviate non entrano nei valori del piano
// (stato, regola, garanzia, fornitore, griglia unità), ma i loro completamenti
// restano nello storico. `completions` è solo in lettura.

export const HISTORY_CAP = 20
export const COMMON_AREAS_LABEL = 'Parti comuni'
export const NO_WARRANTY_TEXT = 'Non indicata'

export type DetailSupplier = { id: string; name: string; phone: string | null; email: string | null }

/** Istanza come la legge il pannello: la riga della lista più garanzia e fornitore. */
export type DetailItem = ListItem & {
  warranty_info: string | null
  suppliers: { id: string; name: string; phone?: string | null; email?: string | null } | null
}

/** Completamento, solo in lettura. Le note e i link di download non entrano nel pannello. */
export type DetailCompletion = {
  id: string
  item_id: string
  completed_at: string
  performed_by_name: string | null
  attachments: readonly { id: string }[]
}

export type BreakdownEntry = { label: string; count: number; text: string }

/**
 * Valore di un campo sulle istanze della voce: uguale ovunque (`text`, null =
 * nessun dato) oppure diverso tra le unità (`entries`, per conteggio
 * decrescente). Il campo non viene mai uniformato in automatico.
 */
export type Field = { mixed: false; text: string | null } | { mixed: true; entries: BreakdownEntry[] }

export type UnitDetailRow = {
  itemId: string
  unitId: string
  label: string
  /** null per le promemoria: nessuno stato letto. */
  state: ListState | 'completata' | null
  next: string | null
  last: string | null
  /** L'unità del filtro-unità attivo. */
  highlighted: boolean
}

export type SupplierSection =
  | { kind: 'none' }
  | { kind: 'single'; supplier: DetailSupplier }
  | { kind: 'per_unit'; entries: { unitLabel: string; supplier: DetailSupplier | null }[] }

export type HistoryEntry = {
  id: string
  completedAt: string
  /** Etichetta dell'unità o "Parti comuni". */
  scope: string
  registeredBy: string
  attachmentCount: number
}

export type VoceDetail = {
  templateId: string
  title: string
  category: string
  /** La stessa riga della lista, sulla voce intera. */
  row: MaintenanceListRow
  closer: Field
  rule: Field
  obligation: Field
  frequency: Field
  warranty: Field
  /** null per le voci condominiali: niente sezione Unità. */
  units: UnitDetailRow[] | null
  /** null senza permesso (admin): la sezione "Chi chiamare" non esiste. */
  suppliers: SupplierSection | null
  history: { entries: HistoryEntry[]; total: number; hidden: number }
}

export type DetailOptions = {
  /** Filtro-unità della lista: evidenzia la sua riga, il pannello resta sulla voce intera. */
  highlightUnitId: string | null
  /** Solo il super_admin vede i fornitori. */
  showSuppliers: boolean
}

// ---------------------------------------------------------------------------

function ruleOf(mode: CompletionMode): DueRule {
  return mode === 'promemoria' ? 'date_fisse' : 'dall_ultima'
}

function cleanText(s: string | null | undefined): string | null {
  const t = s?.trim() ?? ''
  return t === '' ? null : t
}

/**
 * Conteggio per valore, ordine: più unità prima, poi ordine del chiamante.
 * Un solo valore distinto = uguale ovunque; nessun valore = nessun dato.
 */
function summarize<T>(
  values: readonly T[],
  label: (v: T) => string,
  compare: (a: T, b: T) => number,
): Field {
  const counts = new Map<T, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  if (counts.size === 0) return { mixed: false, text: null }
  if (counts.size === 1) return { mixed: false, text: label([...counts.keys()][0]) }
  const entries = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || compare(a[0], b[0]))
    .map(([v, count]) => ({ label: label(v), count, text: `${label(v)}: ${pluralize(count, 'unità', 'unità')}` }))
  return { mixed: true, entries }
}

const byNumber = (a: number, b: number) => a - b
function byOrder<T>(order: readonly T[]) {
  return (a: T, b: T) => order.indexOf(a) - order.indexOf(b)
}
const MODES: readonly CompletionMode[] = ['amministratore', 'residente', 'promemoria']
const RULES: readonly DueRule[] = ['dall_ultima', 'date_fisse']
const OBLIGATIONS: readonly ObligationType[] = ['A', 'B', 'C']

function cleanSupplier(s: NonNullable<DetailItem['suppliers']>): DetailSupplier {
  return { id: s.id, name: s.name, phone: cleanText(s.phone), email: cleanText(s.email) }
}

function supplierSection(instances: readonly DetailItem[]): SupplierSection {
  const withSupplier = instances.filter(i => i.suppliers !== null)
  if (withSupplier.length === 0) return { kind: 'none' }
  const first = withSupplier[0].suppliers!
  const allSame = withSupplier.length === instances.length && withSupplier.every(i => i.suppliers!.id === first.id)
  if (allSame) return { kind: 'single', supplier: cleanSupplier(first) }
  const entries = instances
    .map(i => ({
      unitLabel: i.unit_id === null ? COMMON_AREAS_LABEL : formatUnitLabel(i.units?.label ?? '—'),
      supplier: i.suppliers === null ? null : cleanSupplier(i.suppliers),
    }))
    .sort((a, b) => compareLabels(a.unitLabel, b.unitLabel))
  return { kind: 'per_unit', entries }
}

// ---------------------------------------------------------------------------

/**
 * Dettaglio di una voce, oppure null se la voce non ha righe nel piano attivo
 * (tutte archiviate, template non attivo, id sconosciuto). `items` può
 * contenere tutta la residenza, archiviate comprese: serve allo storico.
 */
export function buildVoceDetail(
  templateId: string,
  items: readonly DetailItem[],
  completions: readonly DetailCompletion[],
  today: string,
  options: DetailOptions,
): VoceDetail | null {
  const ofTemplate = items.filter(i => i.template_id === templateId)
  const row = buildMaintenanceList(ofTemplate, completions, today)[0]
  if (!row) return null

  // Piano attivo: istanze incluse di template attivi.
  const instances = ofTemplate.filter(isCountable)

  const modes = instances.map(resolveCompletionMode).filter((m): m is CompletionMode => m !== null)
  const closer = summarize(modes, m => MODE_ACTOR_PHRASES[m], byOrder(MODES))
  const rule = summarize(modes.map(ruleOf), r => DUE_RULE_LABELS[r], byOrder(RULES))
  const obligation = summarize(
    instances.map(resolveObligationType).filter((o): o is ObligationType => o !== null),
    o => OBLIGATION_LABELS[o],
    byOrder(OBLIGATIONS),
  )
  const frequency = summarize(
    instances.map(resolveFrequencyMonths).filter((f): f is number => f !== null),
    formatFrequency,
    byNumber,
  )
  const warranty = summarize<string | null>(
    instances.map(i => cleanText(i.warranty_info)),
    w => w ?? NO_WARRANTY_TEXT,
    (a, b) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b, 'it')),
  )

  let units: UnitDetailRow[] | null = null
  if (!row.isCommon) {
    const soonLimit = addDaysISO(today, SOON_WINDOW_DAYS)
    const lastByItem = lastCompletionByItem(completions)
    units = instances
      .filter(i => i.unit_id !== null)
      .map(i => {
        // Separazione PRIMA di leggere stato e data: una promemoria non passa di qui.
        const reminder = resolveCompletionMode(i) === 'promemoria'
        const completed = !reminder && i.status === 'completata'
        return {
          itemId: i.id,
          unitId: i.unit_id as string,
          label: formatUnitLabel(i.units?.label ?? '—'),
          state: reminder ? null : completed ? 'completata' as const : itemState(i, today, soonLimit),
          next: reminder || completed ? null : i.next_due_date,
          last: reminder ? null : (lastByItem.get(i.id) ?? null),
          highlighted: options.highlightUnitId !== null && i.unit_id === options.highlightUnitId,
        }
      })
      .sort((a, b) => compareLabels(a.label, b.label) || (a.itemId < b.itemId ? -1 : 1))
  }

  // Storico: tutte le istanze della voce, archiviate comprese (piano ≠ fascicolo).
  const itemById = new Map(ofTemplate.map(i => [i.id, i]))
  const all: HistoryEntry[] = []
  for (const c of completions) {
    const item = itemById.get(c.item_id)
    if (!item) continue
    all.push({
      id: c.id,
      completedAt: c.completed_at,
      scope: item.unit_id === null ? COMMON_AREAS_LABEL : formatUnitLabel(item.units?.label ?? '—'),
      registeredBy: formatRegisteredBy(
        c.performed_by_name,
        item.completion_mode,
        item.maintenance_templates?.completion_mode ?? null,
      ),
      attachmentCount: c.attachments.length,
    })
  }
  all.sort((a, b) => (a.completedAt === b.completedAt ? (a.id < b.id ? -1 : 1) : a.completedAt < b.completedAt ? 1 : -1))

  return {
    templateId,
    title: row.title,
    category: row.category,
    row,
    closer, rule, obligation, frequency, warranty,
    units,
    suppliers: options.showSuppliers ? supplierSection(instances) : null,
    history: { entries: all.slice(0, HISTORY_CAP), total: all.length, hidden: Math.max(0, all.length - HISTORY_CAP) },
  }
}
