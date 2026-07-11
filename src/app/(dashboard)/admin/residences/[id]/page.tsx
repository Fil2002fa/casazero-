import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ChevronLeft, Wrench, Users, Settings, FileText, BookOpen, AlertTriangle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import {
  overdueLive, isCountable, resolveCompletionMode, resolveObligationType,
  resolveFrequencyMonths, resolveLiveStatus, todayISO,
  LIVE_STATUS_FIELDS, LIVE_STATUS_TEMPLATE_FIELDS,
} from '@/lib/maintenance-status'
import { unitHasNoActiveAccount } from '@/lib/unit-utils'
import type { CompletionMode, ItemActivation, ObligationType } from '@/types/database'
import { AdminBlock, type AdminProfile } from './AdminBlock'
import ResidencePhotoUpload from './ResidencePhotoUpload'
import { UnitsSummaryTable, type UnitSummaryRow } from './UnitsSummaryTable'
import { MaintenancePlanTable, type PlanRow } from './MaintenancePlanTable'

export const metadata: Metadata = { title: 'Residenza' }

type Params = Promise<{ id: string }>

type UnitRow = {
  id: string
  label: string
  floor: number | null
  unit_members: { ended_at: string | null; is_primary: boolean; profiles: { full_name: string | null } | null }[] | null
}

type PlanItemRow = {
  id: string
  unit_id: string | null
  status: string
  next_due_date: string | null
  completion_mode: CompletionMode | null
  obligation_type: ObligationType | null
  frequency_months: number | null
  activation_status: ItemActivation
  maintenance_templates: {
    title: string
    completion_mode: CompletionMode | null
    obligation_type: ObligationType | null
    frequency_months: number | null
    is_active: boolean
  } | null
}

type AdminRow = { profiles: AdminProfile | null } | null

export default async function ResidenceDetailPage({ params }: { params: Params }) {
  const { id } = await params
  await requireRole(['super_admin'], '/admin/manutenzioni')
  const supabase = await createClient()

  const { data: residence } = await supabase
    .from('residences')
    .select('id, name, address, energy_class, photo_url')
    .eq('id', id)
    .single()

  if (!residence) notFound()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const [
    { data: unitsRaw },
    { data: itemsRaw },
    { count: docCount },
    { count: supplierCount },
    { count: completionCount },
    { data: adminRaw },
    { data: adminListRaw },
  ] = await Promise.all([
    supabase.from('units')
      .select('id, label, floor, unit_members!left(ended_at, is_primary, profiles(full_name))')
      .eq('residence_id', id)
      .order('floor', { ascending: true, nullsFirst: false })
      .order('label', { ascending: true }),
    supabase.from('maintenance_items')
      .select(`
        id, unit_id, obligation_type, frequency_months, ${LIVE_STATUS_FIELDS},
        maintenance_templates!inner(title, obligation_type, frequency_months, ${LIVE_STATUS_TEMPLATE_FIELDS})
      `)
      .eq('residence_id', id)
      .neq('status', 'completata')
      .order('next_due_date', { ascending: true, nullsFirst: false }),
    supabase.from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('residence_id', id),
    supabase.from('suppliers')
      .select('id', { count: 'exact', head: true })
      .eq('residence_id', id),
    // Fascicolo: conteggio senza filtro su activation_status (piano ≠ fascicolo).
    supabase.from('completions')
      .select('id', { count: 'exact', head: true })
      .eq('residence_id', id),
    supabase.from('admin_assignments')
      .select('profiles(id, full_name, phone)')
      .eq('residence_id', id)
      .maybeSingle(),
    supabase.from('profiles')
      .select('id, full_name, phone')
      .eq('role', 'admin'),
  ])

  const units = (unitsRaw ?? []) as unknown as UnitRow[]
  const unitCount = units.length
  const unitsSenzaAccount = units.filter(u =>
    unitHasNoActiveAccount((u.unit_members ?? []) as { ended_at: string | null }[])
  ).length

  const unitRows: UnitSummaryRow[] = units.map(u => {
    const activeMembers = (u.unit_members ?? []).filter(m => m.ended_at === null)
    const primary = [...activeMembers].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))[0] ?? null
    return {
      id: u.id,
      label: u.label,
      floor: u.floor,
      residentName: primary?.profiles?.full_name ?? null,
      active: activeMembers.length > 0,
    }
  })

  // Piano attivo: solo item a catalogo attivo e inclusi nella residenza (helper
  // condiviso, stesso filtro auditato usato per i conteggi scadute/in corso).
  const planItems = ((itemsRaw ?? []) as unknown as PlanItemRow[]).filter(isCountable)
  const today = todayISO()
  const overdueCount = overdueLive(planItems, today).length

  const planRows: PlanRow[] = planItems.map(item => ({
    id: item.id,
    title: item.maintenance_templates?.title ?? '—',
    mode: resolveCompletionMode(item),
    obligationType: resolveObligationType(item),
    status: resolveLiveStatus(item, today),
    frequencyMonths: resolveFrequencyMonths(item),
    nextDueDate: item.next_due_date,
  }))

  const adminProfile = (adminRaw as unknown as AdminRow)?.profiles ?? null
  const adminList = (adminListRaw ?? []) as AdminProfile[]

  const porte = [
    { href: `/admin/residences/${id}/units`,        icon: Users,     label: 'Unità e inviti', sub: `${unitCount} unità` },
    { href: `/admin/residences/${id}/manutenzioni`, icon: Wrench,    label: 'Manutenzioni',   sub: null },
    { href: `/admin/residences/${id}/fascicolo`,    icon: BookOpen,  label: 'Fascicolo',      sub: completionCount ? `${completionCount} completamenti` : null },
    { href: `/admin/residences/${id}/documenti`,    icon: FileText,  label: 'Documenti',      sub: docCount ? `${docCount} file` : null },
    { href: `/admin/residences/${id}/fornitori`,    icon: Settings,  label: 'Fornitori',      sub: supplierCount ? `${supplierCount} fornitori` : null },
  ]

  return (
    <div className="max-w-6xl mx-auto px-8 py-8 pb-safe">
      <Link href="/admin/residences" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-offset-2">
        <ChevronLeft className="w-4 h-4" strokeWidth={1.6} />
        Residenze
      </Link>

      {/* Testata */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <ResidencePhotoUpload
          residenceId={id}
          initialPhotoUrl={residence.photo_url}
          title={residence.name}
          subtitle={residence.address}
        />
      </div>

      {/* Gestione — navigazione principale, subito sotto la testata */}
      <nav aria-label="Sezioni residenza" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mt-4">
        {porte.map(porta => (
          <Link
            key={porta.href}
            href={porta.href}
            className="flex items-center gap-3 bg-surface rounded-xl border border-border p-4 hover:bg-background transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-offset-2"
          >
            <div className="w-9 h-9 bg-background rounded-lg flex items-center justify-center text-text-secondary flex-shrink-0">
              <porta.icon className="w-4 h-4" strokeWidth={1.6} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">{porta.label}</p>
              {porta.sub && (
                <p className="text-xs text-text-secondary mt-0.5">{porta.sub}</p>
              )}
            </div>
          </Link>
        ))}
      </nav>

      {/* Numeri chiave — ogni card porta alla superficie che approfondisce il numero */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
        <StatCard label="Unità" value={unitCount} href={`/admin/residences/${id}/units`} />
        <StatCard label="Voci attive" value={planItems.length} href={`/admin/residences/${id}/manutenzioni`} />
        <StatCard label="Scadute" value={overdueCount} danger={overdueCount > 0} href={`/admin/residences/${id}/manutenzioni?filtro=scaduta`} />
        <StatCard label="Completamenti" value={completionCount ?? 0} href={`/admin/residences/${id}/fascicolo`} />
      </div>

      {/* Amministratore */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden mt-8">
        <AdminBlock
          residenceId={id}
          adminProfile={adminProfile}
          availableAdmins={adminList}
          appUrl={appUrl}
        />
      </div>

      {/* Zona attenzione — solo gap di configurazione senza elemento dedicato */}
      {unitsSenzaAccount > 0 && (
        <Link
          href={`/admin/residences/${id}/units?filter=senza_account`}
          className="flex items-center gap-3 bg-semantic-amber-bg border border-semantic-amber/20 rounded-xl p-4 hover:brightness-[0.98] transition-all mt-8 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-offset-2"
        >
          <div className="w-8 h-8 rounded-full bg-semantic-amber/10 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-semantic-amber" strokeWidth={1.6} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-semantic-amber">
              Unità senza account cliente · {unitsSenzaAccount}
            </p>
            <p className="text-xs text-semantic-amber">Inviti non ancora inviati</p>
          </div>
        </Link>
      )}

      {/* Tabella unità */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-text-primary mb-3">Unità</h2>
        {unitRows.length > 0 ? (
          <UnitsSummaryTable residenceId={id} rows={unitRows} />
        ) : (
          <p className="text-sm text-neutral-500 py-6 text-center bg-surface rounded-xl border border-border">
            Nessuna unità configurata.
          </p>
        )}
      </section>

      {/* Piano manutenzioni */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-text-primary mb-3">Piano manutenzioni</h2>
        {planRows.length > 0 ? (
          <MaintenancePlanTable residenceId={id} rows={planRows} />
        ) : (
          <p className="text-sm text-neutral-500 py-6 text-center bg-surface rounded-xl border border-border">
            Nessuna voce nel piano.
          </p>
        )}
      </section>

    </div>
  )
}

function StatCard({ label, value, danger, href }: { label: string; value: number; danger?: boolean; href: string }) {
  return (
    <Link
      href={href}
      className="block bg-surface rounded-xl border border-border p-4 hover:bg-background transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-offset-2"
    >
      <p className="text-[13px] font-medium text-neutral-500">{label}</p>
      <div className="flex items-center gap-2 mt-1">
        <p className="font-serif text-3xl font-semibold text-brand-dark">{value}</p>
        {danger && <span className="w-2 h-2 rounded-full bg-status-overdue" />}
      </div>
    </Link>
  )
}
