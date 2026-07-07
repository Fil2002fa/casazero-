import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { MaintenanceCard } from '@/components/MaintenanceCard'
import { N3AdminActions } from '@/components/N3AdminActions'
import type { MaintenancePriority, MaintenanceStatus, CompletionMode, ItemActivation } from '@/types/database'
import { isOverdueLive, isInCorso, resolveCompletionMode } from '@/lib/maintenance-status'

export const metadata: Metadata = { title: 'Manutenzioni — Amministratore' }

type SearchParams = Promise<{ filter?: string }>

type StatFilter = 'scadute' | 'in_corso' | 'pianificate'

type ItemRow = {
  id: string
  status: MaintenanceStatus
  next_due_date: string | null
  unit_id: string | null
  residence_id: string
  priority: MaintenancePriority | null
  completion_mode: CompletionMode | null
  activation_status: ItemActivation
  maintenance_templates: {
    title: string
    category: string
    priority: MaintenancePriority
    scope: string
    completion_mode: CompletionMode | null
    is_active: boolean
  } | null
  residences: { name: string } | null
}

export default async function AdminManutenzioniPage({ searchParams }: { searchParams: SearchParams }) {
  const { filter } = await searchParams
  const activeFilter: StatFilter | null =
    filter === 'scadute' || filter === 'in_corso' || filter === 'pianificate' ? filter : null

  await requireRole(['admin'])
  const supabase = await createClient()

  // Tutti gli item di ambito condominio accessibili (RLS filtra per residenze assegnate)
  const { data: rawItems } = await supabase
    .from('maintenance_items')
    .select(`
      id, status, next_due_date, unit_id, residence_id, priority,
      completion_mode, activation_status,
      maintenance_templates(title, category, priority, scope, completion_mode, is_active),
      residences(name)
    `)
    .is('unit_id', null)
    .in('status', ['scaduta', 'in_corso', 'in_attesa'])
    .eq('activation_status', 'inclusa')
    .order('next_due_date', { ascending: true, nullsFirst: false })

  const items = (rawItems ?? []) as unknown as ItemRow[]

  // Filtra per modalità amministratore (asse canonico, non più priorità legacy)
  const adminItems = items.filter(i => resolveCompletionMode(i) === 'amministratore')

  // Stato live: il cron non gira in locale, quindi 'scaduta' va calcolato da
  // next_due_date (helper condiviso), non letto dal campo status salvato —
  // altrimenti gli item scaduti da tempo restano bloccati in "Pianificate".
  const scadute  = adminItems.filter(i => isOverdueLive(i))
  const inCorso  = adminItems.filter(i => isInCorso(i))
  const upcoming = adminItems.filter(i => !isOverdueLive(i) && !isInCorso(i))

  return (
    <div className="p-6 space-y-6 pb-safe">
      <header>
        <p className="text-xs text-text-secondary uppercase tracking-wide">Amministratore</p>
        <h1 className="text-xl font-medium text-text-primary mt-1">Manutenzioni condominiali</h1>
      </header>

      {/* Contatori — cliccabili per filtrare la lista sotto; toggle se già attivi */}
      <div className="grid grid-cols-3 gap-3">
        <Link href={statHref('scadute', activeFilter)} className="block">
          <Stat label="Scadute" value={scadute.length} color="text-semantic-red" bg="bg-semantic-red-bg" active={activeFilter === 'scadute'} />
        </Link>
        <Link href={statHref('in_corso', activeFilter)} className="block">
          <Stat label="In corso" value={inCorso.length} color="text-semantic-amber" bg="bg-semantic-amber-bg" active={activeFilter === 'in_corso'} />
        </Link>
        <Link href={statHref('pianificate', activeFilter)} className="block">
          <Stat label="Pianificate" value={upcoming.length} color="text-text-secondary" bg="bg-background" active={activeFilter === 'pianificate'} />
        </Link>
      </div>

      {/* Scadute */}
      {(!activeFilter || activeFilter === 'scadute') && scadute.length > 0 && (
        <Section title="Da prendere in carico" accent="red">
          {scadute.map(item => (
            <ItemCard key={item.id} item={item} />
          ))}
        </Section>
      )}

      {/* In corso */}
      {(!activeFilter || activeFilter === 'in_corso') && inCorso.length > 0 && (
        <Section title="In corso" accent="amber">
          {inCorso.map(item => (
            <ItemCard key={item.id} item={item} />
          ))}
        </Section>
      )}

      {/* Prossime */}
      {(!activeFilter || activeFilter === 'pianificate') && upcoming.length > 0 && (
        <Section title="Pianificate">
          {upcoming.map(item => (
            <MaintenanceCard
              key={item.id}
              id={item.id}
              title={item.maintenance_templates?.title ?? '—'}
              category={item.maintenance_templates?.category ?? ''}
              priority="N3"
              status={item.status}
              nextDueDate={item.next_due_date}
              scope="condominium"
              href={`/admin/manutenzioni/${item.id}`}
            />
          ))}
        </Section>
      )}

      {adminItems.length === 0 && (
        <div className="bg-brand-light rounded-xl p-6 text-center">
          <p className="text-sm text-brand-dark font-medium">Nessuna manutenzione attiva</p>
          <p className="text-xs text-brand-medium mt-1">Tutte le residenze sono in regola.</p>
        </div>
      )}
    </div>
  )
}

function ItemCard({ item }: { item: ItemRow }) {
  const formattedDue = item.next_due_date
    ? new Date(item.next_due_date).toLocaleDateString('it-IT', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : null

  // Stato live, non quello salvato: vedi nota cron in AdminManutenzioniPage.
  const overdueNow: boolean = isOverdueLive(item)
  const effectiveStatus: MaintenanceStatus = overdueNow ? 'scaduta' : item.status

  const borderColor = effectiveStatus === 'scaduta'
    ? 'border-l-semantic-red'
    : effectiveStatus === 'in_corso'
    ? 'border-l-semantic-amber'
    : 'border-l-transparent'

  return (
    <div className={`bg-surface rounded-xl border border-border border-l-4 ${borderColor} overflow-hidden`}>
      <Link href={`/admin/manutenzioni/${item.id}`} className="block p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-text-secondary">{item.maintenance_templates?.category}</p>
            <p className="text-sm font-medium text-text-primary">{item.maintenance_templates?.title ?? '—'}</p>
            {item.residences?.name && (
              <p className="text-xs text-text-secondary mt-0.5">{item.residences.name}</p>
            )}
            {formattedDue && (
              <p className={`text-xs mt-1 font-medium ${
                effectiveStatus === 'scaduta' ? 'text-semantic-red' : 'text-text-secondary'
              }`}>
                {effectiveStatus === 'scaduta' ? 'Scaduta il ' : 'Scadenza: '}{formattedDue}
              </p>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-text-secondary flex-shrink-0 mt-0.5" strokeWidth={1.6} />
        </div>
      </Link>
      <div className="px-4 pb-4">
        <N3AdminActions
          itemId={item.id}
          residenceId={item.residence_id}
          status={effectiveStatus}
        />
      </div>
    </div>
  )
}

function statHref(filterValue: StatFilter, activeFilter: StatFilter | null): string {
  return activeFilter === filterValue ? '/admin/manutenzioni' : `/admin/manutenzioni?filter=${filterValue}`
}

function Stat({
  label, value, color, bg, active,
}: {
  label: string; value: number; color: string; bg: string; active: boolean
}) {
  return (
    <div className={`${bg} rounded-xl p-3 text-center ${active ? 'ring-2 ring-brand-dark' : ''}`}>
      <p className={`text-2xl font-medium ${color}`}>{value}</p>
      <p className="text-xs text-text-secondary mt-0.5">{label}</p>
    </div>
  )
}

function Section({
  title,
  accent,
  children,
}: {
  title: string
  accent?: 'red' | 'amber'
  children: React.ReactNode
}) {
  const color = accent === 'red' ? 'text-semantic-red' : accent === 'amber' ? 'text-semantic-amber' : 'text-text-primary'
  return (
    <section className="space-y-2">
      <h2 className={`text-sm font-medium ${color}`}>{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
