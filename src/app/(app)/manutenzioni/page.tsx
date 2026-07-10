import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'
import { MaintenanceCard } from '@/components/MaintenanceCard'
import { redirect } from 'next/navigation'
import {
  isCountable, isOverdueLive, isInCorso, resolveCompletionMode, resolveFrequencyMonths,
  resolveLiveStatus, modeToPriority, todayISO,
  type LiveStatusItem,
} from '@/lib/maintenance-status'

export const metadata: Metadata = { title: 'Manutenzioni' }

type ItemRow = LiveStatusItem & {
  id: string
  unit_id: string | null
  residence_id: string
  frequency_months: number | null
  maintenance_templates: (LiveStatusItem['maintenance_templates'] & {
    title: string
    category: string
    scope: string
    frequency_months: number
  }) | null
}

export default async function ManutenzioniPage() {
  const profile = await requireProfile()

  if (profile.role === 'super_admin') redirect('/admin/residences')
  if (profile.role === 'admin') redirect('/admin/manutenzioni')

  const supabase = await createClient()

  // In parallelo: la query items è scopata da RLS, non dipende dalla membership
  const [{ data: membership }, { data: rawItems }] = await Promise.all([
    supabase
      .from('unit_members')
      .select('unit_id, units(residence_id, label, residences(name))')
      .eq('profile_id', profile.id)
      .is('ended_at', null)
      .maybeSingle(),
    supabase
      .from('maintenance_items')
      .select(`
        id, status, next_due_date, unit_id, residence_id, completion_mode, activation_status, frequency_months,
        maintenance_templates!inner(title, category, completion_mode, is_active, scope, frequency_months)
      `)
      .neq('status', 'completata')
      .eq('activation_status', 'inclusa')
      .order('next_due_date', { ascending: true, nullsFirst: false }),
  ])

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

  // Solo voci a catalogo attivo e incluse nella residenza (isCountable) entrano
  // in un bucket: stesso invariante del Fascicolo/PDF, mai raw status/priority.
  const items = ((rawItems ?? []) as unknown as ItemRow[]).filter(isCountable)
  const today = todayISO()

  // Raggruppa per sezione — stato live, mai il campo status/priority salvato
  const urgenti      = items.filter(i => isOverdueLive(i, today))
  const inCorso       = items.filter(i => isInCorso(i))
  const consigliate  = items.filter(i => resolveCompletionMode(i) === 'promemoria')
  const prossime     = items.filter(i =>
    resolveLiveStatus(i, today) === 'in_attesa' &&
    resolveCompletionMode(i) !== 'promemoria' &&
    i.next_due_date
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
            priority={modeToPriority(resolveCompletionMode(i))}
            status={resolveLiveStatus(i, today)}
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
            priority={modeToPriority(resolveCompletionMode(i))}
            status={resolveLiveStatus(i, today)}
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
            priority={modeToPriority(resolveCompletionMode(i))}
            status={resolveLiveStatus(i, today)}
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
            status={resolveLiveStatus(i, today)}
            nextDueDate={i.next_due_date}
            frequencyMonths={resolveFrequencyMonths(i)}
            scope={(i.maintenance_templates?.scope ?? 'unit') as 'unit' | 'condominium'}
          />
        ))}
      </Section>
    </div>
  )
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
