import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { PageHeader } from '@/components/PageHeader'
import { FilterCounters } from '@/components/FilterCounters'
import { ManutenzioniTable, type ActivityRow } from './ManutenzioniTable'
import type { MaintenanceStatus, CompletionMode, ItemActivation, ObligationType } from '@/types/database'
import {
  isAdminActivity, activityBucket, compareActivityUrgency, resolveObligationType,
  formatRelativeDue, todayISO, type ActivityBucket,
} from '@/lib/maintenance-status'

export const metadata: Metadata = { title: 'Attività — Amministratore' }

type SearchParams = Promise<{ filter?: string }>

const BUCKETS: ActivityBucket[] = ['in_ritardo', 'in_corso', 'in_arrivo']

function isBucket(v: string | undefined): v is ActivityBucket {
  return v !== undefined && (BUCKETS as string[]).includes(v)
}

type ItemRow = {
  id: string
  status: MaintenanceStatus
  next_due_date: string | null
  unit_id: string | null
  residence_id: string
  completion_mode: CompletionMode | null
  obligation_type: ObligationType | null
  activation_status: ItemActivation
  maintenance_templates: {
    title: string
    category: string
    scope: string
    completion_mode: CompletionMode | null
    obligation_type: ObligationType | null
    is_active: boolean
  } | null
  residences: { name: string } | null
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

/**
 * Testo della colonna scadenza, deciso dal bucket e mai dal campo status
 * salvato. Le voci in arrivo senza data non hanno testo.
 */
function dueLabel(bucket: ActivityBucket, nextDueDate: string | null, today: string): string | null {
  if (nextDueDate === null) return null
  switch (bucket) {
    case 'in_ritardo': return `scaduta il ${formatDate(nextDueDate)}`
    case 'in_corso':   return `presa in carico · scaduta il ${formatDate(nextDueDate)}`
    case 'in_arrivo':  return formatRelativeDue(nextDueDate, today)
  }
}

/** Riga tabella dallo stesso ItemRow letto per i contatori: il bucket è l'unico stato della riga. */
function toRow(item: ItemRow, today: string): ActivityRow {
  const bucket = activityBucket(item, today)
  return {
    id: item.id,
    // Pagina cross-residenza: la residenza è l'informazione principale della riga.
    residenceName: item.residences?.name ?? '—',
    title: item.maintenance_templates?.title ?? '—',
    obligationType: resolveObligationType(item),
    bucket,
    dueLabel: dueLabel(bucket, item.next_due_date, today),
  }
}

export default async function AdminManutenzioniPage({ searchParams }: { searchParams: SearchParams }) {
  const { filter } = await searchParams
  const activeFilter: ActivityBucket | null = isBucket(filter) ? filter : null

  await requireRole(['admin'])
  const supabase = await createClient()
  const today = todayISO()

  // Pagina "Attività": lista trasversale delle voci a carico dell'amministratore
  // su tutte le residenze che segue. L'elenco delle residenze sta in
  // /admin/residences; il contatto del costruttore non è più qui.
  // Tutti gli item di ambito condominio accessibili (RLS filtra per residenze
  // assegnate). In SQL si scarta solo ciò che non può mai essere un'attività
  // (completata, non inclusa nel piano); lo stato si deriva in JS dagli helper,
  // perché il campo status lo avanza solo il cron, che non gira in locale.
  const { data: rawItems } = await supabase
    .from('maintenance_items')
    .select(`
      id, status, next_due_date, unit_id, residence_id,
      completion_mode, obligation_type, activation_status,
      maintenance_templates(title, category, scope, completion_mode, obligation_type, is_active),
      residences(name)
    `)
    .is('unit_id', null)
    .neq('status', 'completata')
    .eq('activation_status', 'inclusa')

  const items = (rawItems ?? []) as unknown as ItemRow[]

  // Un solo array, filtrato e ordinato per urgenza con gli helper condivisi.
  // Contatori e lista leggono entrambi `rows`: non possono divergere.
  const rows = items
    .filter(isAdminActivity)
    .sort((a, b) => compareActivityUrgency(a, b, today))
    .map(i => toRow(i, today))

  const counts: Record<ActivityBucket, number> = { in_ritardo: 0, in_corso: 0, in_arrivo: 0 }
  for (const r of rows) counts[r.bucket] += 1

  const visibleRows = activeFilter ? rows.filter(r => r.bucket === activeFilter) : rows

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attività"
        description="Interventi a tuo carico su tutte le residenze che segui."
      />

      {/* Contatori — stessa partizione della lista; cliccabili per filtrarla, toggle se già attivi */}
      <FilterCounters
        label="Filtra le attività per stato"
        items={[
          { key: 'in_ritardo', label: 'In ritardo', value: counts.in_ritardo, tone: 'overdue',    active: activeFilter === 'in_ritardo', href: statHref('in_ritardo', activeFilter) },
          { key: 'in_corso',   label: 'In corso',   value: counts.in_corso,   tone: 'inprogress', active: activeFilter === 'in_corso',   href: statHref('in_corso', activeFilter) },
          { key: 'in_arrivo',  label: 'In arrivo',  value: counts.in_arrivo,  tone: 'neutral',    active: activeFilter === 'in_arrivo',  href: statHref('in_arrivo', activeFilter) },
        ]}
      />

      {visibleRows.length > 0 && <ManutenzioniTable rows={visibleRows} />}

      {rows.length === 0 ? (
        <div className="bg-brand-light rounded-xl p-6 text-center">
          <p className="text-sm text-brand-dark font-medium">Nessuna attività aperta</p>
          <p className="text-xs text-brand-medium mt-1">Tutte le residenze sono in regola.</p>
        </div>
      ) : activeFilter !== null && visibleRows.length === 0 && (
        <p className="text-sm text-text-secondary text-center py-6">
          {EMPTY_FILTER_LABELS[activeFilter]}
        </p>
      )}
    </div>
  )
}

const EMPTY_FILTER_LABELS: Record<ActivityBucket, string> = {
  in_ritardo: 'Nessuna attività in ritardo.',
  in_corso:   'Nessuna attività in corso.',
  in_arrivo:  'Nessuna attività in arrivo.',
}

function statHref(bucket: ActivityBucket, activeFilter: ActivityBucket | null): string {
  return activeFilter === bucket ? '/admin/manutenzioni' : `/admin/manutenzioni?filter=${bucket}`
}
