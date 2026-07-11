import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ChevronLeft, Wrench, Users, Settings, FileText, BookOpen, AlertTriangle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import {
  overdueLive, isCountable, resolveCompletionMode, formatRelativeDue, todayISO,
  LIVE_STATUS_FIELDS, LIVE_STATUS_TEMPLATE_FIELDS,
} from '@/lib/maintenance-status'
import { unitHasNoActiveAccount } from '@/lib/unit-utils'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import { pluralize } from '@/lib/pluralize'
import type { CompletionMode, ItemActivation } from '@/types/database'
import { AdminBlock, type AdminProfile } from './AdminBlock'
import ResidencePhotoUpload from './ResidencePhotoUpload'
import { UnitsSummaryTable, type UnitSummaryRow } from './UnitsSummaryTable'

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
  activation_status: ItemActivation
  units: { label: string } | null
  maintenance_templates: {
    title: string
    completion_mode: CompletionMode | null
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
        id, unit_id, ${LIVE_STATUS_FIELDS}, units(label),
        maintenance_templates!inner(title, ${LIVE_STATUS_TEMPLATE_FIELDS})
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
  // Unica chiamata a overdueLive: la stat card e il riepilogo leggono lo stesso
  // array. La query ordina già per next_due_date ascendente → i più in ritardo prima.
  const overdueItems = overdueLive(planItems, today)
  const overdueCount = overdueItems.length

  // Prossime scadenze: stessa planItems, nessuna query/conteggio nuovo. Escluse le
  // promemoria per costruzione (solo mode residente/amministratore, mai "scaduta"
  // su quelle voci) e le voci già mostrate nel blocco ritardi (niente doppioni).
  // planItems arriva già ordinata per next_due_date ascendente dalla query.
  const overdueIds = new Set(overdueItems.map(i => i.id))
  const upcomingItems = planItems
    .filter(item => {
      const mode = resolveCompletionMode(item)
      return (mode === 'residente' || mode === 'amministratore')
        && !overdueIds.has(item.id)
        && item.next_due_date !== null
    })
    .slice(0, 5)

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
    // pb-safe evitato di proposito: è unlayered in globals.css, quindi sovrascrive
    // sempre il padding-bottom di py-*/pb-* invece di sommarcisi (azzerato su desktop).
    <div className="max-w-6xl mx-auto px-8 pt-8 pb-12">
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

      {/* Piano manutenzioni — riepilogo: solo interventi in ritardo (max 5).
          La lista completa per categoria vive nella pagina Manutenzioni dedicata. */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold text-text-primary">Piano manutenzioni</h2>
          {overdueCount > 0 && (
            <p className="text-sm font-medium text-status-overdue">
              {pluralize(overdueCount, 'intervento in ritardo', 'interventi in ritardo')}
            </p>
          )}
        </div>
        {overdueCount > 0 ? (
          <div className="bg-surface rounded-xl border border-border divide-y divide-border">
            {overdueItems.slice(0, 5).map(item => (
              <PlanSummaryRow
                key={item.id}
                title={item.maintenance_templates?.title ?? '—'}
                unitLabel={item.unit_id === null ? 'Condominio' : item.units ? formatUnitLabel(item.units.label) : '—'}
                dateLabel={item.next_due_date ? `scaduta il ${formatDate(item.next_due_date)}` : null}
                dateClassName="text-status-overdue"
              />
            ))}
          </div>
        ) : (
          <div className="bg-brand-light rounded-xl p-4 flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-medium flex-shrink-0" />
            <p className="text-sm text-brand-dark">Nessun intervento in ritardo.</p>
          </div>
        )}
        {overdueCount > 5 && (
          <p className="text-xs text-text-secondary mt-2">
            …e {pluralize(overdueCount - 5, 'altro intervento', 'altri interventi')} in ritardo
          </p>
        )}

        {/* Prossime scadenze: solo mode residente/amministratore, mai promemoria
            (garanzia strutturale "promemoria non è mai scaduta" — nessuna data di
            confronto su quelle voci). Voci già nel blocco ritardi escluse a monte. */}
        {upcomingItems.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-text-primary mb-3">Prossime scadenze</h3>
            <div className="bg-surface rounded-xl border border-border divide-y divide-border">
              {upcomingItems.map(item => (
                <PlanSummaryRow
                  key={item.id}
                  title={item.maintenance_templates?.title ?? '—'}
                  unitLabel={item.unit_id === null ? 'Condominio' : item.units ? formatUnitLabel(item.units.label) : '—'}
                  dateLabel={formatRelativeDue(item.next_due_date!, today)}
                  dateClassName="text-text-secondary"
                />
              ))}
            </div>
          </div>
        )}

        <Link
          href={overdueCount > 0
            ? `/admin/residences/${id}/manutenzioni?filtro=scaduta`
            : `/admin/residences/${id}/manutenzioni`}
          className="inline-flex items-center justify-center h-11 md:h-9 px-4 mt-3 text-sm font-medium text-neutral-900 bg-surface border border-border rounded-lg hover:bg-background transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-offset-2"
        >
          Vedi tutte le manutenzioni
        </Link>
      </section>

    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function PlanSummaryRow({ title, unitLabel, dateLabel, dateClassName }: {
  title: string
  unitLabel: string
  dateLabel: string | null
  dateClassName: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{title}</p>
        <p className="text-xs text-text-secondary mt-0.5">{unitLabel}</p>
      </div>
      {dateLabel && (
        <p className={`text-xs flex-shrink-0 tabular-nums ${dateClassName}`}>{dateLabel}</p>
      )}
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
