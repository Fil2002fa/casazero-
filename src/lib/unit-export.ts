/**
 * Scheda "Riepilogo unità" dell'Excel di residenza: una riga per unità.
 * Modulo puro (celle tipizzate di xlsx-helpers), verificato da
 * scripts/verify-residence-export.mjs.
 *
 * Fonti, tutte già caricate dalla route: anagrafica e membri (query units),
 * voci del piano (le stesse della scheda Scadenze) e documenti (gli stessi
 * della scheda Documenti). I documenti attesi per unità e i loro dati chiave
 * vengono da unitDocumentRows (unit-documents.ts): un solo calcolo per la
 * scheda e per il quadro in pagina.
 *
 * Mancano per scelta, perché non esistono nello schema: "scala" e
 * "proprietario". Il residente è l'account attivo primario.
 *
 * "Prossima scadenza" = la data più vicina tra le voci aperte della sola
 * unità (piano attivo, non completate) che non siano promemoria: una
 * promemoria non ha mai una data (invariante), quindi non entra qui.
 * "Voci scadute" usa isOverdueLive (live, mai dal campo status).
 *
 * Import relativi tra moduli di lib: vedi document-rows.ts.
 */
import { formatDateIT } from './formatDate'
import { formatUnitLabel } from './formatUnitLabel'
import type { DeadlineItem } from './deadline-export'
import { isCountable, isOverdueLive, resolveCompletionMode, todayISO } from './maintenance-status'
import { UNIT_EXPECTATIONS, unitDocumentRows, type KeyDatum, type UnitDocState } from './unit-documents'
import { unitHasNoActiveAccount, unitNotDelivered } from './unit-utils'
import type { DocRow } from './document-rows'
import { normalizeEmbed } from './postgrest-embed'
import { dateCell, numberCell, textCell, type ExportCell } from './xlsx-helpers'

export type UnitExportMember = {
  ended_at: string | null
  is_primary: boolean
  full_name: string | null
}

export type UnitExportUnit = {
  id: string
  label: string
  floor: number | null
  delivery_date: string | null
  members: UnitExportMember[]
}

/** Riga di `units` come la restituisce PostgREST (membri con profilo, embed oggetto o array). */
export type RawUnitExportUnit = {
  id: string
  label: string
  floor: number | null
  delivery_date: string | null
  unit_members: unknown
}

export function toUnitExportUnit(raw: RawUnitExportUnit): UnitExportUnit {
  const members = Array.isArray(raw.unit_members) ? raw.unit_members : []
  return {
    id: raw.id,
    label: raw.label,
    floor: raw.floor,
    delivery_date: raw.delivery_date,
    members: members.map((m: { ended_at?: unknown; is_primary?: unknown; profiles?: unknown }) => {
      const profile = normalizeEmbed<{ full_name?: unknown }>(m.profiles)
      return {
        ended_at: typeof m.ended_at === 'string' ? m.ended_at : null,
        is_primary: m.is_primary === true,
        full_name: typeof profile?.full_name === 'string' && profile.full_name !== '' ? profile.full_name : null,
      }
    }),
  }
}

const BASE_HEADERS = [
  'Unità',
  'Piano',
  'Consegna',
  'Residente',
  'Documenti assegnati',
  'Documenti da verificare',
  'Voci attive',
  'Voci scadute',
  'Prossima scadenza',
] as const

// Per ogni documento atteso: lo stato e i dati chiave (due colonne).
export function unitExportHeaders(): string[] {
  return [
    ...BASE_HEADERS,
    ...UNIT_EXPECTATIONS.flatMap(e => [e.label, `${e.label} (dati)`]),
  ]
}

const STATE_LABELS: Record<UnitDocState, string> = {
  presente: 'Presente',
  da_verificare: 'Da verificare',
  mancante: 'Mancante',
}

export const NO_ACCOUNT_LABEL = 'Nessun account'
export const NOT_DELIVERED_LABEL = 'Non consegnata'

function residentText(members: UnitExportMember[]): string {
  if (unitHasNoActiveAccount(members)) return NO_ACCOUNT_LABEL
  const active = members.filter(m => m.ended_at === null)
  // Il primario per primo; senza nome l'account esiste comunque.
  const ordered = [...active].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
  return ordered.find(m => m.full_name)?.full_name ?? 'Account attivo'
}

function keyDataText(keyData: KeyDatum[]): string | null {
  if (keyData.length === 0) return null
  return keyData
    .map(k => `${k.label}: ${k.kind === 'date' ? formatDateIT(k.value) : k.value}`)
    .join(' · ')
}

function compareLabels(a: string, b: string): number {
  return a.localeCompare(b, 'it', { numeric: true, sensitivity: 'base' })
}

export function unitExportRows(
  units: UnitExportUnit[],
  items: DeadlineItem[],
  docs: DocRow[],
  opts: { today?: string } = {},
): ExportCell[][] {
  const today = opts.today ?? todayISO()
  const sorted = [...units].sort((a, b) => compareLabels(a.label, b.label))
  const docRows = new Map(
    unitDocumentRows(docs, sorted.map(u => ({ id: u.id, label: u.label }))).map(r => [r.unit.id, r]),
  )

  const itemsByUnit = new Map<string, DeadlineItem[]>()
  for (const item of items) {
    if (item.unit_id === null || !isCountable(item)) continue
    const list = itemsByUnit.get(item.unit_id)
    if (list) list.push(item)
    else itemsByUnit.set(item.unit_id, [item])
  }

  return sorted.map(unit => {
    const unitItems = itemsByUnit.get(unit.id) ?? []
    const overdue = unitItems.filter(i => isOverdueLive(i, today)).length
    const nextDue = unitItems
      .filter(i => i.status !== 'completata' && resolveCompletionMode(i) !== 'promemoria' && i.next_due_date !== null)
      .map(i => i.next_due_date as string)
      .sort()[0] ?? null
    const docRow = docRows.get(unit.id)

    return [
      textCell(formatUnitLabel(unit.label)),
      numberCell(unit.floor),
      unitNotDelivered(unit.delivery_date) ? textCell(NOT_DELIVERED_LABEL) : dateCell(unit.delivery_date),
      textCell(residentText(unit.members)),
      numberCell(docRow?.documentCount ?? 0),
      numberCell(docRow?.toVerifyCount ?? 0),
      numberCell(unitItems.length),
      numberCell(overdue),
      dateCell(nextDue),
      ...(docRow?.cells ?? []).flatMap(cell => [
        textCell(STATE_LABELS[cell.state]),
        textCell(keyDataText(cell.keyData)),
      ]),
    ]
  })
}
