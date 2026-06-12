import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'
import { MaintenanceCard } from '@/components/MaintenanceCard'
import type { MaintenancePriority, MaintenanceStatus } from '@/types/database'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Manutenzioni' }

type ItemRow = {
  id: string
  status: MaintenanceStatus
  next_due_date: string | null
  unit_id: string | null
  residence_id: string
  priority: MaintenancePriority | null
  maintenance_templates: {
    title: string
    category: string
    priority: MaintenancePriority
    scope: string
  } | null
}

export default async function ManutenzioniPage() {
  const profile = await requireProfile()

  // Admin e super_admin vedono la vista amministratore
  if (profile.role === 'admin' || profile.role === 'super_admin') {
    redirect('/admin/manutenzioni')
  }

  const supabase = await createClient()

  // Cerca l'unità attiva del client
  const { data: membership } = await supabase
    .from('unit_members')
    .select('unit_id, units(residence_id, label, residences(name))')
    .eq('profile_id', profile.id)
    .is('ended_at', null)
    .maybeSingle()

  if (!membership) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-xl font-medium text-text-primary">Manutenzioni</h1>
        <div className="bg-surface rounded-xl border border-border p-6 text-center">
          <p className="text-sm text-text-secondary">
            Non sei ancora associato a nessuna unità. Contatta il costruttore.
          </p>
        </div>
      </div>
    )
  }

  const unit = membership.units as unknown as { residence_id: string; label: string; residences: { name: string } | null } | null

  const { data: rawItems } = await supabase
    .from('maintenance_items')
    .select(`
      id, status, next_due_date, unit_id, residence_id, priority,
      maintenance_templates(title, category, priority, scope)
    `)
    .neq('status', 'completata')
    .order('next_due_date', { ascending: true, nullsFirst: false })

  const items = (rawItems ?? []) as unknown as ItemRow[]

  // Raggruppa per sezione
  const urgenti   = items.filter(i => i.status === 'scaduta' && effPriority(i) !== 'N1')
  const inCorso   = items.filter(i => i.status === 'in_corso')
  const consigliate = items.filter(i => effPriority(i) === 'N1')
  const prossime  = items.filter(
    i => i.status === 'in_attesa' && effPriority(i) !== 'N1' && i.next_due_date
  )

  return (
    <div className="p-6 space-y-6 pb-safe">
      <header>
        <p className="text-xs text-text-secondary uppercase tracking-wide">
          {unit?.residences?.name ?? 'La tua residenza'} · {unit?.label ?? ''}
        </p>
        <h1 className="text-xl font-medium text-text-primary mt-1">Manutenzioni</h1>
      </header>

      {urgenti.length === 0 && inCorso.length === 0 && (
        <div className="bg-brand-light rounded-xl p-4">
          <p className="text-sm text-brand-dark font-medium">Tutto in ordine</p>
          <p className="text-xs text-brand-medium mt-0.5">Nessuna manutenzione scaduta.</p>
        </div>
      )}

      <Section title="Da completare" count={urgenti.length} accent="red">
        {urgenti.map(i => (
          <MaintenanceCard
            key={i.id}
            id={i.id}
            title={i.maintenance_templates?.title ?? '—'}
            category={i.maintenance_templates?.category ?? ''}
            priority={effPriority(i)}
            status={i.status}
            nextDueDate={i.next_due_date}
            scope={(i.maintenance_templates?.scope ?? 'unit') as 'unit' | 'condominium'}
          />
        ))}
      </Section>

      <Section title="In corso" count={inCorso.length} accent="amber">
        {inCorso.map(i => (
          <MaintenanceCard
            key={i.id}
            id={i.id}
            title={i.maintenance_templates?.title ?? '—'}
            category={i.maintenance_templates?.category ?? ''}
            priority={effPriority(i)}
            status={i.status}
            nextDueDate={i.next_due_date}
            scope={(i.maintenance_templates?.scope ?? 'condominium') as 'unit' | 'condominium'}
          />
        ))}
      </Section>

      <Section title="Prossime scadenze" count={prossime.length}>
        {prossime.map(i => (
          <MaintenanceCard
            key={i.id}
            id={i.id}
            title={i.maintenance_templates?.title ?? '—'}
            category={i.maintenance_templates?.category ?? ''}
            priority={effPriority(i)}
            status={i.status}
            nextDueDate={i.next_due_date}
            scope={(i.maintenance_templates?.scope ?? 'unit') as 'unit' | 'condominium'}
          />
        ))}
      </Section>

      <Section title="Consigliate" count={consigliate.length} accent="blue">
        {consigliate.map(i => (
          <MaintenanceCard
            key={i.id}
            id={i.id}
            title={i.maintenance_templates?.title ?? '—'}
            category={i.maintenance_templates?.category ?? ''}
            priority="N1"
            status={i.status}
            nextDueDate={i.next_due_date}
            scope={(i.maintenance_templates?.scope ?? 'unit') as 'unit' | 'condominium'}
          />
        ))}
      </Section>
    </div>
  )
}

function effPriority(item: ItemRow): MaintenancePriority {
  return item.priority ?? item.maintenance_templates?.priority ?? 'N2'
}

function Section({
  title,
  count,
  accent,
  children,
}: {
  title: string
  count: number
  accent?: 'red' | 'amber' | 'blue'
  children: React.ReactNode
}) {
  if (count === 0) return null
  const accentClass = accent === 'red' ? 'text-semantic-red' : accent === 'amber' ? 'text-semantic-amber' : accent === 'blue' ? 'text-semantic-blue' : 'text-text-primary'
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className={`text-sm font-medium ${accentClass}`}>{title}</h2>
        <span className="text-xs text-text-secondary">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}
