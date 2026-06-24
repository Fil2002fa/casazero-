import Link from 'next/link'
import { FolderOpen, BookOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'
import { MaintenanceCard } from '@/components/MaintenanceCard'
import type { MaintenancePriority, MaintenanceStatus } from '@/types/database'
import { formatUnitLabel } from '@/lib/formatUnitLabel'

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

export default async function HomePage() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: membership } = await supabase
    .from('unit_members')
    .select('unit_id, units(id, label, residence_id, residences(name, photo_url))')
    .eq('profile_id', profile.id)
    .is('ended_at', null)
    .maybeSingle()

  const unit = membership?.units as unknown as {
    id: string; label: string; residence_id: string
    residences: { name: string; photo_url: string | null } | null
  } | null

  // Conteggio scadenze urgenti (status scaduta o in_corso)
  const { count: urgentCount } = await supabase
    .from('maintenance_items')
    .select('id', { count: 'exact', head: true })
    .in('status', ['scaduta', 'in_corso'])

  // Prime 3 card urgenti per la home
  const { data: rawUrgent } = await supabase
    .from('maintenance_items')
    .select(`
      id, status, next_due_date, unit_id, residence_id, priority,
      maintenance_templates(title, category, priority, scope)
    `)
    .in('status', ['scaduta', 'in_corso'])
    .order('next_due_date', { ascending: true, nullsFirst: false })
    .limit(3)

  const urgentItems = (rawUrgent ?? []) as unknown as ItemRow[]

  const residenceName = unit?.residences?.name ?? 'La tua residenza'
  const photoUrl      = unit?.residences?.photo_url ?? null

  return (
    <div className="p-6 space-y-6 pb-safe">
      {/* Header residenza */}
      <header>
        <p className="text-xs text-text-secondary uppercase tracking-wide">{residenceName}</p>
        <h1 className="text-xl font-medium text-text-primary mt-1">
          Ciao, {profile.full_name?.split(' ')[0] ?? 'benvenuto'}
        </h1>
      </header>

      {/* Card residenza */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="h-36 bg-background flex items-center justify-center">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={residenceName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-text-secondary text-sm">{residenceName}</span>
          )}
        </div>
        <div className="px-4 py-3">
          <p className="text-sm font-medium text-text-primary">{residenceName}</p>
          {unit && (
            <p className="text-xs text-text-secondary mt-0.5">{formatUnitLabel(unit.label)}</p>
          )}
        </div>
      </div>

      {/* Banner scadenze */}
      {(urgentCount ?? 0) > 0 ? (
        <Link href="/manutenzioni">
          <div className="bg-semantic-red-bg border border-semantic-red/20 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-semantic-red">
                {urgentCount} {urgentCount === 1 ? 'scadenza richiede' : 'scadenze richiedono'} attenzione
              </p>
              <p className="text-xs text-semantic-red/70 mt-0.5">Tocca per vedere tutte</p>
            </div>
            <span className="text-2xl font-medium text-semantic-red">{urgentCount}</span>
          </div>
        </Link>
      ) : (
        <div className="bg-brand-light rounded-xl px-4 py-3">
          <p className="text-sm font-medium text-brand-dark">Tutto in ordine</p>
          <p className="text-xs text-brand-medium mt-0.5">Nessuna manutenzione in scadenza</p>
        </div>
      )}

      {/* Prime card urgenti */}
      {urgentItems.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-primary">Da completare</h2>
            <Link href="/manutenzioni" className="text-xs text-brand-medium">Vedi tutte</Link>
          </div>
          <div className="space-y-2">
            {urgentItems.map(i => (
              <MaintenanceCard
                key={i.id}
                id={i.id}
                title={i.maintenance_templates?.title ?? '—'}
                category={i.maintenance_templates?.category ?? ''}
                priority={(i.priority ?? i.maintenance_templates?.priority ?? 'N2') as MaintenancePriority}
                status={i.status}
                nextDueDate={i.next_due_date}
                scope={(i.maintenance_templates?.scope ?? 'unit') as 'unit' | 'condominium'}
              />
            ))}
          </div>
        </section>
      )}

      {/* Accessi rapidi */}
      <section className="grid grid-cols-2 gap-3">
        <Link href="/documenti">
          <div className="bg-surface rounded-xl border border-border p-4 flex items-center gap-3 h-20 active:scale-[0.98] transition-transform">
            <FolderOpen className="w-5 h-5 text-semantic-blue" strokeWidth={1.6} />
            <span className="text-sm font-medium text-text-primary">Documenti</span>
          </div>
        </Link>
        <Link href="/fascicolo">
          <div className="bg-surface rounded-xl border border-border p-4 flex items-center gap-3 h-20 active:scale-[0.98] transition-transform">
            <BookOpen className="w-5 h-5 text-brand-medium" strokeWidth={1.6} />
            <span className="text-sm font-medium text-text-primary">Fascicolo</span>
          </div>
        </Link>
      </section>
    </div>
  )
}
