import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ChevronLeft, Wrench, Users, Settings, FileText,
  AlertCircle, AlertTriangle, CheckCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import {
  overdueLive, resolveCompletionMode, todayISO,
  LIVE_STATUS_FIELDS, LIVE_STATUS_TEMPLATE_FIELDS,
  type LiveStatusItem,
} from '@/lib/maintenance-status'
import { unitHasNoActiveAccount } from '@/lib/unit-utils'
import { AdminBlock, type AdminProfile } from './AdminBlock'

export const metadata: Metadata = { title: 'Residenza' }

type Params = Promise<{ id: string }>

export default async function ResidenceDetailPage({ params }: { params: Params }) {
  const { id } = await params
  await requireRole(['super_admin'], '/admin/manutenzioni')
  const supabase = await createClient()

  const { data: residence } = await supabase
    .from('residences')
    .select('id, name, address, energy_class')
    .eq('id', id)
    .single()

  if (!residence) notFound()

  type UnitRow = { id: string; unit_members: { ended_at: string | null }[] | null }
  type AdminRow = { profiles: AdminProfile | null } | null

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const [
    { data: unitsRaw },
    { data: itemsRaw },
    { count: docCount },
    { count: supplierCount },
    { data: adminRaw },
    { data: adminListRaw },
  ] = await Promise.all([
    supabase.from('units')
      .select('id, unit_members!left(ended_at)')
      .eq('residence_id', id),
    supabase.from('maintenance_items')
      .select(`unit_id, ${LIVE_STATUS_FIELDS}, maintenance_templates!inner(${LIVE_STATUS_TEMPLATE_FIELDS})`)
      .eq('residence_id', id)
      .neq('status', 'completata'),
    supabase.from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('residence_id', id),
    supabase.from('suppliers')
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

  type ItemRow = LiveStatusItem & { unit_id: string | null }
  const overdue = overdueLive((itemsRaw ?? []) as unknown as ItemRow[], todayISO())
  const n3Scadute = overdue.filter(i => resolveCompletionMode(i) === 'amministratore').length
  const n2ScaduteUnits = new Set(
    overdue
      .filter(i => resolveCompletionMode(i) === 'residente' && i.unit_id != null)
      .map(i => i.unit_id as string)
  ).size

  const adminProfile = (adminRaw as unknown as AdminRow)?.profiles ?? null
  const adminList = (adminListRaw ?? []) as AdminProfile[]

  const porte = [
    { href: `/admin/residences/${id}/units`,        icon: Users,     label: 'Unità e inviti', sub: `${unitCount} unità` },
    { href: `/admin/residences/${id}/manutenzioni`, icon: Wrench,    label: 'Manutenzioni',   sub: null },
    { href: `/admin/residences/${id}/documenti`,    icon: FileText,  label: 'Documenti',      sub: docCount ? `${docCount} file` : null },
    { href: `/admin/residences/${id}/fornitori`,    icon: Settings,  label: 'Fornitori',      sub: supplierCount ? `${supplierCount} fornitori` : null },
  ]

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* header */}
      <div className="bg-surface border-b border-border px-4 py-4 sticky top-0 z-10">
        <Link href="/admin/residences" className="text-text-secondary p-1 -ml-1 rounded-lg inline-block">
          <ChevronLeft className="w-5 h-5" strokeWidth={1.6} />
        </Link>
      </div>

      <div className="p-4 space-y-4">
        {/* Zona 1 — Identità + Amministratore */}
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="bg-[#04342C] px-4 py-5">
            <h2 className="text-base font-medium text-white">{residence.name}</h2>
            {residence.address && (
              <p className="text-xs text-[#9FE1CB] mt-0.5">{residence.address}</p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              {residence.energy_class && (
                <span className="text-[11px] font-medium bg-white/10 text-[#E1F5EE] px-2.5 py-1 rounded-full">
                  Classe {residence.energy_class}
                </span>
              )}
              <span className="text-[11px] font-medium bg-white/10 text-[#E1F5EE] px-2.5 py-1 rounded-full">
                {unitCount} unità
              </span>
            </div>
          </div>

          <AdminBlock
            residenceId={id}
            adminProfile={adminProfile}
            availableAdmins={adminList}
            appUrl={appUrl}
          />
        </div>

        {/* Zona 2 — Richiede attenzione */}
        <div className="space-y-2">
          {n3Scadute > 0 && (
            <AttenzioneCard
              color="red"
              icon={<AlertCircle className="w-4 h-4 text-[#A32D2D]" strokeWidth={1.6} />}
              title={`N3 in ritardo · ${n3Scadute} ${n3Scadute === 1 ? 'voce' : 'voci'}`}
              sub="Sollecita l'amministratore"
            />
          )}
          {n2ScaduteUnits > 0 && (
            <AttenzioneCard
              color="red"
              icon={<AlertCircle className="w-4 h-4 text-[#A32D2D]" strokeWidth={1.6} />}
              title={`N2 in ritardo · ${n2ScaduteUnits} unità`}
              sub="Clienti coinvolti"
            />
          )}
          {n3Scadute === 0 && n2ScaduteUnits === 0 && (
            <div className="bg-surface rounded-xl border border-border px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#E1F5EE] flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-4 h-4 text-[#0F6E56]" strokeWidth={1.6} />
              </div>
              <div>
                <p className="text-sm font-medium text-[#0F6E56]">In regola</p>
                <p className="text-xs text-text-secondary">Nessun ritardo in corso</p>
              </div>
            </div>
          )}
          {unitsSenzaAccount > 0 && (
            <AttenzioneCard
              color="amber"
              icon={<AlertTriangle className="w-4 h-4 text-[#854F0B]" strokeWidth={1.6} />}
              title={`Unità senza account cliente · ${unitsSenzaAccount}`}
              sub="Inviti non ancora inviati"
              href={`/admin/residences/${id}/units?filter=senza_account`}
            />
          )}
        </div>

        {/* Zona 3 — Gestione */}
        <div className="space-y-2">
          {porte.map(porta => (
            <Link
              key={porta.href}
              href={porta.href}
              className="flex items-center gap-3 bg-surface rounded-xl border border-border p-4 active:scale-[0.99] transition-transform"
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
              <ChevronLeft className="w-4 h-4 text-text-secondary flex-shrink-0 rotate-180" strokeWidth={1.6} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function AttenzioneCard({
  color,
  icon,
  title,
  sub,
  href,
}: {
  color: 'red' | 'amber'
  icon: React.ReactNode
  title: string
  sub: string
  href?: string
}) {
  const s = color === 'red'
    ? { wrap: 'bg-[#FCEBEB] border-[#A32D2D]/20', iconBg: 'bg-[#A32D2D]/10', title: 'text-[#A32D2D]', sub: 'text-[#A32D2D]/70' }
    : { wrap: 'bg-[#FAEEDA] border-[#854F0B]/20', iconBg: 'bg-[#854F0B]/10', title: 'text-[#854F0B]', sub: 'text-[#854F0B]/70' }

  const className = `rounded-xl border px-4 py-3 flex items-center gap-3 ${s.wrap}`
  const inner = (
    <>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${s.iconBg}`}>
        {icon}
      </div>
      <div>
        <p className={`text-sm font-medium ${s.title}`}>{title}</p>
        <p className={`text-xs ${s.sub}`}>{sub}</p>
      </div>
    </>
  )

  if (href) return <Link href={href} className={className}>{inner}</Link>
  return <div className={className}>{inner}</div>
}
