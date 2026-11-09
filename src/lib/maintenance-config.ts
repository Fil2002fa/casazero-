import type { CompletionMode, ItemActivation, ObligationType } from '@/types/database'
import { isCompletionMode, modeToPriority } from './completion-mode'
import { nextDueFrom } from './maintenance-due'
import {
  isCountable, resolveCompletionMode, resolveFrequencyMonths, resolveObligationType,
} from './maintenance-status'
import { compareLabels } from './maintenance-list'
import { unitNotDelivered } from './unit-utils'

// Configura per voce (3a): regole pure, senza React, senza query e senza
// scritture (verify:maintconfig). Il client manda solo i campi cambiati; le
// righe le legge il server; questo modulo decide cosa si scrive su ciascuna.
//
// INVARIANTE PROMEMORIA. Una riga promemoria non entra mai in un confronto di
// "scaduta" né in una lettura di status: la regola verso promemoria forza
// status = in_attesa perché il cron elabora solo le righe in_attesa.
//
// Decisioni (docs/handoffs/manutenzioni-ui-piano.md, 3a):
// - D1 obbligo: sola lettura, mai scritto, mai accettato dal client.
// - D3 date: verso promemoria si tengono le date future, passate o nulle
//   diventano oggi + frequenza; da promemoria le unità non consegnate senza
//   override tornano senza data (cancello di consegna).
// - D4 righe archiviate: ricevono solo i campi di configurazione.
// - D5 parti comuni: `residente` rifiutato.
// - Il dual-write di `priority` resta (modeToPriority).

export const WARRANTY_MAX_LENGTH = 500
/** Segnaposto del campo misto nel form: non è mai un valore, non si scrive mai. */
export const MIXED_VALUE = '__valori_diversi__'

// ---------------------------------------------------------------------------
// Tipi
// ---------------------------------------------------------------------------

/** Istanza come la legge la configurazione: la riga della voce più i dati per le regole di data. */
export type ConfigItem = {
  id: string
  template_id: string
  unit_id: string | null
  status: string
  next_due_date: string | null
  completion_mode: CompletionMode | null
  obligation_type: ObligationType | null
  activation_status: ItemActivation
  frequency_months: number | null
  warranty_info: string | null
  supplier_id: string | null
  /** maintenance_items.due_basis_override: solo l'override manuale di voce. */
  due_basis_override: string | null
  /** La riga ha almeno un completamento: la sua data la riscrive il trigger. */
  has_completions: boolean
  suppliers?: { id: string; name: string } | null
  maintenance_templates: {
    title: string
    category: string
    completion_mode: CompletionMode | null
    obligation_type: ObligationType | null
    frequency_months: number | null
    is_active: boolean
  } | null
  units: { delivery_date: string | null } | null
}

/** Valore di un campo sulle istanze: uguale ovunque, diverso tra le unità, o nessuna istanza. */
export type Uniform<T> =
  | { kind: 'empty' }
  | { kind: 'uniform'; value: T }
  | { kind: 'mixed'; distinct: number }

export type ConfigRow = {
  templateId: string
  title: string
  category: string
  scope: 'unit' | 'common' | 'mixed'
  /** Istanze del piano attivo (incluse, template attivo). */
  count: number
  mode: Uniform<CompletionMode>
  /** Sola lettura (D1). */
  obligation: Uniform<ObligationType | null>
  frequency: Uniform<number | null>
  supplier: Uniform<string | null>
  /** Nome del fornitore quando è uno solo e uguale ovunque. */
  supplierName: string | null
  warranty: Uniform<string | null>
}

/** I soli campi che il client può chiedere di cambiare. */
export type ConfigChanges = {
  completion_mode?: CompletionMode
  warranty_info?: string | null
  supplier_id?: string | null
}

export type ConfigField = keyof ConfigChanges

/** Stato del form: un valore per campo, oppure il segnaposto MIXED_VALUE. */
export type ConfigDraft = {
  completion_mode: CompletionMode | typeof MIXED_VALUE | null
  warranty_info: string | null | typeof MIXED_VALUE
  supplier_id: string | null | typeof MIXED_VALUE
}

export type PlannedFields = {
  completion_mode?: CompletionMode
  /** Dual-write legacy, derivata dalla modalità: mai dal client. */
  priority?: string
  status?: 'in_attesa'
  next_due_date?: string | null
  supplier_id?: string | null
  warranty_info?: string | null
}

export type PlannedRow = { id: string; fields: PlannedFields }

export type ConfigPlanSummary = {
  /** Istanze della voce nel piano. */
  rows: number
  /** Righe su cui si scrive qualcosa. */
  touched: number
  /** Righe incluse che cambiano modalità. */
  modeChanged: number
  /** Righe incluse che diventano promemoria. */
  toPromemoria: number
  /** Righe verso promemoria a cui la data viene riportata a oggi + frequenza. */
  datesReset: number
  /** Righe da promemoria che tornano senza data: unità non consegnata. */
  backToAwaitingDelivery: number
  /** Righe da promemoria che restano con una data già passata. */
  overdueNow: number
  /** Si scrivono date o status: serve il passo di conferma con l'anteprima. */
  needsConfirm: boolean
}

export type ConfigPlan = { rows: PlannedRow[]; summary: ConfigPlanSummary }

export type ConfigErrorCode =
  | 'input_non_valido'
  | 'campo_non_ammesso'
  | 'nessuna_modifica'
  | 'modalita_non_valida'
  | 'residente_su_parti_comuni'
  | 'garanzia_non_valida'
  | 'garanzia_troppo_lunga'
  | 'fornitore_non_valido'

export type ConfigValidation =
  | { ok: true; changes: ConfigChanges }
  | { ok: false; code: ConfigErrorCode; message: string }

// ---------------------------------------------------------------------------
// Valori uniformi e righe del tab
// ---------------------------------------------------------------------------

/** Uguale ovunque (anche null), diverso tra le unità, oppure nessun valore. Mai uniformato in automatico. */
export function uniformValue<T>(values: readonly T[]): Uniform<T> {
  if (values.length === 0) return { kind: 'empty' }
  const distinct = new Set<T>(values)
  if (distinct.size === 1) return { kind: 'uniform', value: values[0] }
  return { kind: 'mixed', distinct: distinct.size }
}

function cleanText(s: string | null | undefined): string | null {
  const t = s?.trim() ?? ''
  return t === '' ? null : t
}

/** Una riga per voce del piano attivo: incluse, di template attivi. Le archiviate non entrano nei valori. */
export function buildConfigRows(items: readonly ConfigItem[]): ConfigRow[] {
  const byTemplate = new Map<string, ConfigItem[]>()
  for (const i of items) {
    if (!isCountable(i)) continue
    if (!byTemplate.has(i.template_id)) byTemplate.set(i.template_id, [])
    byTemplate.get(i.template_id)!.push(i)
  }

  const rows: ConfigRow[] = []
  for (const [templateId, instances] of byTemplate) {
    const tpl = instances[0].maintenance_templates
    const withUnit = instances.filter(i => i.unit_id !== null).length
    const supplier = uniformValue(instances.map(i => i.supplier_id))
    const supplierName = supplier.kind === 'uniform' && supplier.value !== null
      ? instances.find(i => i.supplier_id === supplier.value)?.suppliers?.name ?? null
      : null
    rows.push({
      templateId,
      title: tpl?.title ?? 'Senza titolo',
      category: tpl?.category ?? 'Altro',
      scope: withUnit === 0 ? 'common' : withUnit === instances.length ? 'unit' : 'mixed',
      count: instances.length,
      mode: uniformValue(instances.map(resolveCompletionMode).filter((m): m is CompletionMode => m !== null)),
      obligation: uniformValue(instances.map(i => resolveObligationType(i))),
      frequency: uniformValue(instances.map(i => resolveFrequencyMonths(i))),
      supplier,
      supplierName,
      warranty: uniformValue(instances.map(i => cleanText(i.warranty_info))),
    })
  }
  return rows.sort((a, b) => compareLabels(a.category, b.category) || compareLabels(a.title, b.title))
}

// ---------------------------------------------------------------------------
// Cambiamenti: solo i campi toccati
// ---------------------------------------------------------------------------

function fieldChanged<T>(current: Uniform<T>, draft: T | typeof MIXED_VALUE, same: (a: T, b: T) => boolean): boolean {
  if (draft === MIXED_VALUE) return false // segnaposto intatto: campo non toccato
  if (current.kind !== 'uniform') return true // misto o vuoto: qualunque scelta vera è un cambio
  return !same(current.value, draft as T)
}

/**
 * Solo i campi che l'utente ha davvero cambiato. Il segnaposto "valori
 * diversi" non entra mai nei cambiamenti; un campo misto lasciato com'è non
 * tocca nessuna riga. Nessun cambio = oggetto vuoto (Salva disabilitato).
 */
export function buildConfigChanges(current: ConfigRow, draft: ConfigDraft): ConfigChanges {
  const changes: ConfigChanges = {}
  if (draft.completion_mode !== MIXED_VALUE && draft.completion_mode !== null
    && fieldChanged(current.mode, draft.completion_mode, (a, b) => a === b)) {
    changes.completion_mode = draft.completion_mode
  }
  if (fieldChanged(current.supplier, draft.supplier_id, (a, b) => a === b)) {
    changes.supplier_id = draft.supplier_id as string | null
  }
  if (draft.warranty_info === MIXED_VALUE) return changes
  const warranty = cleanText(draft.warranty_info)
  if (fieldChanged(current.warranty, warranty, (a, b) => a === b)) {
    changes.warranty_info = warranty
  }
  return changes
}

// ---------------------------------------------------------------------------
// Validazione lato server: whitelist scritta a mano, mai uno spread
// ---------------------------------------------------------------------------

export type ValidationContext = {
  /** La voce ha almeno una riga di parti comuni (unit_id nullo): `residente` rifiutato (D5). */
  hasCommonAreaRows: boolean
  /** Fornitori ammessi: quelli dello stesso builder della residenza, letti dal server. */
  allowedSupplierIds: ReadonlySet<string>
}

const ALLOWED_FIELDS: readonly ConfigField[] = ['completion_mode', 'warranty_info', 'supplier_id']

function fail(code: ConfigErrorCode, message: string): ConfigValidation {
  return { ok: false, code, message }
}

/**
 * Ricostruisce i cambiamenti a mano dal payload ricevuto. Qualunque chiave
 * fuori whitelist (status, next_due_date, obligation_type, frequency_months,
 * priority, activation_status, due_basis_override, ...) è un errore, non
 * viene ignorata in silenzio.
 */
export function validateConfigChanges(raw: unknown, ctx: ValidationContext): ConfigValidation {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fail('input_non_valido', 'Richiesta non valida.')
  }
  const input = raw as Record<string, unknown>
  const present = Object.keys(input).filter(k => input[k] !== undefined)
  for (const k of present) {
    if (!(ALLOWED_FIELDS as readonly string[]).includes(k)) {
      return fail('campo_non_ammesso', `Il campo ${k} non si può modificare da qui.`)
    }
  }

  const out: ConfigChanges = {}

  if (present.includes('completion_mode')) {
    const m = input.completion_mode
    if (!isCompletionMode(m)) return fail('modalita_non_valida', 'Modalità non valida.')
    if (m === 'residente' && ctx.hasCommonAreaRows) {
      return fail('residente_su_parti_comuni', 'Le parti comuni non possono essere chiuse dal residente.')
    }
    out.completion_mode = m
  }

  if (present.includes('warranty_info')) {
    const w = input.warranty_info
    if (w !== null && typeof w !== 'string') return fail('garanzia_non_valida', 'Info garanzia non valida.')
    const clean = cleanText(w)
    if (clean !== null && clean.length > WARRANTY_MAX_LENGTH) {
      return fail('garanzia_troppo_lunga', `Info garanzia: massimo ${WARRANTY_MAX_LENGTH} caratteri.`)
    }
    out.warranty_info = clean
  }

  if (present.includes('supplier_id')) {
    const s = input.supplier_id
    if (s !== null && (typeof s !== 'string' || !ctx.allowedSupplierIds.has(s))) {
      return fail('fornitore_non_valido', 'Fornitore non valido per questa residenza.')
    }
    out.supplier_id = s as string | null
  }

  if (Object.keys(out).length === 0) return fail('nessuna_modifica', 'Nessuna modifica da salvare.')
  return { ok: true, changes: out }
}

// ---------------------------------------------------------------------------
// Piano di scrittura: per riga, i campi, la priority derivata, date e status
// ---------------------------------------------------------------------------

/**
 * Cosa si scrive su ciascuna istanza della voce. `rows` è tutta la voce,
 * archiviate comprese (D4): le archiviate ricevono solo i campi di
 * configurazione. Una riga senza nulla da scrivere non compare nel piano.
 * Funzione pura: lancia se una frequenza non è intera (nextDueFrom), mai una
 * data sbagliata scritta in silenzio.
 */
export function planConfigWrite(rows: readonly ConfigItem[], changes: ConfigChanges, today: string): ConfigPlan {
  const summary: ConfigPlanSummary = {
    rows: rows.filter(isCountable).length,
    touched: 0, modeChanged: 0, toPromemoria: 0, datesReset: 0,
    backToAwaitingDelivery: 0, overdueNow: 0, needsConfirm: false,
  }
  const planned: PlannedRow[] = []

  for (const row of rows) {
    const fields: PlannedFields = {}
    const included = row.activation_status === 'inclusa'

    if (changes.supplier_id !== undefined && changes.supplier_id !== row.supplier_id) {
      fields.supplier_id = changes.supplier_id
    }
    if (changes.warranty_info !== undefined && changes.warranty_info !== cleanText(row.warranty_info)) {
      fields.warranty_info = changes.warranty_info
    }

    const prev = resolveCompletionMode(row)
    const next = changes.completion_mode
    if (next !== undefined && next !== prev) {
      fields.completion_mode = next
      fields.priority = modeToPriority(next) as string

      if (included) {
        summary.modeChanged++
        if (next === 'promemoria') {
          // Il cron elabora solo le righe in_attesa: uno stato diverso resterebbe muto.
          summary.toPromemoria++
          if (row.status !== 'in_attesa') fields.status = 'in_attesa'
          const keep = row.next_due_date !== null && row.next_due_date >= today
          if (!keep) {
            const freq = resolveFrequencyMonths(row)
            if (freq) {
              fields.next_due_date = nextDueFrom(today, freq)
              summary.datesReset++
            }
          }
        } else if (prev === 'promemoria') {
          // Da promemoria: lo status resta; la data resta, salvo il cancello di consegna.
          const gated =
            row.unit_id !== null &&
            unitNotDelivered(row.units?.delivery_date ?? null) &&
            row.due_basis_override === null &&
            !row.has_completions
          if (gated) {
            if (row.next_due_date !== null) {
              fields.next_due_date = null
              summary.backToAwaitingDelivery++
            }
          } else if (row.next_due_date !== null && row.next_due_date < today) {
            summary.overdueNow++
          }
        }
        // residente <-> amministratore: data e status non si toccano.
      }
    }

    if (Object.keys(fields).length === 0) continue
    planned.push({ id: row.id, fields })
    summary.touched++
    if (fields.status !== undefined || fields.next_due_date !== undefined) summary.needsConfirm = true
  }

  return { rows: planned, summary }
}
