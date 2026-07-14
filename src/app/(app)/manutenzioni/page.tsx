import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import {
  isCountable, isOverdueLive, resolveCompletionMode, resolveFrequencyMonths,
  resolveObligationType, resolveLiveStatus, todayISO,
  type LiveStatusItem,
} from '@/lib/maintenance-status'
import { ManutenzioniList, type ListItem } from './ManutenzioniList'
import type { ObligationType } from '@/types/database'

export const metadata: Metadata = { title: 'Manutenzioni' }

type ItemRow = LiveStatusItem & {
  id: string
  unit_id: string | null
  residence_id: string
  frequency_months: number | null
  obligation_type: ObligationType | null
  maintenance_templates: (LiveStatusItem['maintenance_templates'] & {
    title: string
    category: string
    scope: string
    frequency_months: number
    obligation_type: ObligationType | null
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
        id, status, next_due_date, unit_id, residence_id, completion_mode, activation_status, frequency_months, obligation_type,
        maintenance_templates!inner(title, category, completion_mode, is_active, scope, frequency_months, obligation_type)
      `)
      .neq('status', 'completata')
      .eq('activation_status', 'inclusa')
      .order('next_due_date', { ascending: true, nullsFirst: false }),
  ])

  if (!membership) {
    return (
      <div className="p-4 space-y-4">
        <h1 className="font-serif text-[22px] font-semibold text-text-primary">Manutenzioni</h1>
        <div className="bg-surface rounded-xl border border-border p-4 text-center">
          <p className="text-base text-text-secondary">
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

  const toListItem = (i: ItemRow): ListItem => ({
    id: i.id,
    title: i.maintenance_templates?.title ?? '—',
    category: i.maintenance_templates?.category ?? '',
    obligationType: resolveObligationType(i),
    frequencyMonths: resolveFrequencyMonths(i),
    status: resolveLiveStatus(i, today),
    mode: resolveCompletionMode(i),
    unitId: i.unit_id,
    residenceId: i.residence_id,
  })

  // Tre sezioni, stato live — garanzia strutturale: le promemoria non
  // condividono mai bucket con voci a data (invariante "mai scadenza su promemoria").
  const daFare = items.filter(i => isOverdueLive(i, today)).map(toListItem)
  const consigli = items.filter(i => resolveCompletionMode(i) === 'promemoria').map(toListItem)
  const inProgramma = items
    .filter(i => resolveCompletionMode(i) !== 'promemoria' && !isOverdueLive(i, today))
    .map(toListItem)

  return (
    <div className="p-4 space-y-6 pb-safe">
      <header>
        <p className="text-sm text-text-secondary">
          {unit?.residences?.name ?? 'La tua residenza'} · {unit?.label ?? ''}
        </p>
        <h1 className="font-serif text-[22px] font-semibold text-text-primary mt-1">Manutenzioni</h1>
      </header>

      <ManutenzioniList
        daFare={daFare}
        inProgramma={inProgramma}
        consigli={consigli}
        residenceName={unit?.residences?.name ?? 'La tua residenza'}
        unitLabel={unit?.label ?? ''}
      />
    </div>
  )
}
