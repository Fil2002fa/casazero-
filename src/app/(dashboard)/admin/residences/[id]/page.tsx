import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ChevronLeft, Wrench, Users, Settings, FileText,
  AlertCircle, AlertTriangle, CheckCircle, Phone, UserCheck,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { effPriority, ScaduteRow } from '@/lib/residence-stats'

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
  type AdminRow = { profiles: { full_name: string | null } | null } | null

  const [
    { data: unitsRaw },
    { data: scaduteData },
    { count: docCount },
    { count: supplierCount },
    { data: adminRaw },
  ] = await Promise.all([
    supabase.from('units')
      .select('id, unit_members!left(ended_at)')
      .eq('residence_id', id),
    supabase.from('maintenance_items')
      .select('id, priority, unit_id, maintenance_templates!inner(priority)')
      .eq('residence_id', id)
      .eq('status', 'scaduta'),
    supabase.from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('residence_id', id),
    supabase.from('suppliers')
      .select('id', { count: 'exact', head: true })
      .eq('residence_id', id),
    supabase.from('admin_assignments')
      .select('profiles(full_name)')
      .eq('residence_id', id)
      .maybeSingle(),
  ])

  const units = (unitsRaw ?? []) as unknown as UnitRow[]
  const unitCount = units.length
  const unitsSenzaAccount = units.filter(u => {
    const ms = u.unit_members
    return !ms || ms.length === 0 || !ms.some(m => m.ended_at === null)
  }).length

  const scadute = (scaduteData ?? []) as unknown as ScaduteRow[]
  const n3Scadute = scadute.filter(i => effPriority(i) === 'N3').length
  const n2ScaduteUnits = new Set(
    scadute
      .filter(i => effPriority(i) === 'N2' && i.unit_id != null)
      .map(i => i.unit_id as string)
  ).size

  const adminProfile = (adminRaw as unknown as AdminRow)?.profiles
  const noAdmin = !adminProfile

  const hasRitardi = n3Scadute > 0 || n2ScaduteUnits > 0
  const hasBuchi = noAdmin || unitsSenzaAccount > 0
  const inRegola = !hasRitardi && !hasBuchi

  const porte = [
    { href: `/admin/residences/${id}/units`,        icon: Users,     label: 'Unità e inviti', meta: String(unitCount) },
    { href: `/admin/residences/${id}/manutenzioni`, icon: Wrench,    label: 'Manutenzioni',   meta: null },
    { href: `/admin/residences/${id}/documenti`,    icon: FileText,  label: 'Documenti',      meta: docCount ? String(docCount) : null },
    { href: `/admin/residences/${id}/fornitori`,    icon: Settings,  label: 'Fornitori',      meta: supplierCount ? String(supplierCount) : null },
  ]

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* header */}
      <div className="bg-surface border-b border-border px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/admin/residences" className="text-text-secondary p-1 -ml-1 rounded-lg">
          <ChevronLeft className="w-5 h-5" strokeWidth={1.6} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-medium text-text-primary truncate">{residence.name}</h1>
          {residence.address && (
            <p className="text-xs text-text-secondary truncate">{residence.address}</p>
          )}
        </div>
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

          {adminProfile && (
            <div className="px-4 py-3 flex items-center gap-3 border-t border-border">
              <div className="w-8 h-8 rounded-full bg-[#E1F5EE] flex items-center justify-center flex-shrink-0">
                <UserCheck className="w-4 h-4 text-[#0F6E56]" strokeWidth={1.6} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">
                  {adminProfile.full_name ?? 'Amministratore'}
                </p>
                <p className="text-xs text-text-secondary">Amministratore di condominio</p>
              </div>
              <div
                role="button"
                tabIndex={0}
                className="flex items-center gap-1.5 text-xs font-medium text-[#0F6E56] border border-[#9FE1CB] rounded-lg px-3 py-1.5 cursor-pointer"
              >
                <Phone className="w-3 h-3" strokeWidth={1.6} />
                Contatta
              </div>
            </div>
          )}
        </div>

        {/* Zona 2 — Richiede attenzione */}
        {inRegola ? (
          <div className="bg-surface rounded-xl border border-border px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#E1F5EE] flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-4 h-4 text-[#0F6E56]" strokeWidth={1.6} />
            </div>
            <div>
              <p className="text-sm font-medium text-[#0F6E56]">In regola</p>
              <p className="text-xs text-text-secondary">Nessun ritardo né buco di configurazione</p>
            </div>
          </div>
        ) : (
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
            {noAdmin && (
              <AttenzioneCard
                color="amber"
                icon={<AlertTriangle className="w-4 h-4 text-[#854F0B]" strokeWidth={1.6} />}
                title="Amministratore non assegnato"
                sub="Configurazione incompleta"
              />
            )}
            {unitsSenzaAccount > 0 && (
              <AttenzioneCard
                color="amber"
                icon={<AlertTriangle className="w-4 h-4 text-[#854F0B]" strokeWidth={1.6} />}
                title={`Unità senza account cliente · ${unitsSenzaAccount}`}
                sub="Inviti non ancora inviati"
              />
            )}
          </div>
        )}

        {/* Zona 3 — Gestione */}
        <div className="space-y-2">
          {porte.map(porta => (
            <Link
              key={porta.href}
              href={porta.href}
              className="flex items-center gap-3 bg-surface rounded-xl border border-border p-4 active:scale-[0.99] transition-transform"
            >
              <div className="w-9 h-9 bg-background rounded-lg flex items-center justify-center text-text-secondary">
                <porta.icon className="w-4 h-4" strokeWidth={1.6} />
              </div>
              <span className="text-sm font-medium text-text-primary flex-1">{porta.label}</span>
              {porta.meta && (
                <span className="text-xs text-text-secondary mr-1">{porta.meta}</span>
              )}
              <ChevronLeft className="w-4 h-4 text-text-secondary rotate-180" strokeWidth={1.6} />
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
}: {
  color: 'red' | 'amber'
  icon: React.ReactNode
  title: string
  sub: string
}) {
  const s = color === 'red'
    ? { wrap: 'bg-[#FCEBEB] border-[#A32D2D]/20', iconBg: 'bg-[#A32D2D]/10', title: 'text-[#A32D2D]', sub: 'text-[#A32D2D]/70' }
    : { wrap: 'bg-[#FAEEDA] border-[#854F0B]/20', iconBg: 'bg-[#854F0B]/10', title: 'text-[#854F0B]', sub: 'text-[#854F0B]/70' }

  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${s.wrap}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${s.iconBg}`}>
        {icon}
      </div>
      <div>
        <p className={`text-sm font-medium ${s.title}`}>{title}</p>
        <p className={`text-xs ${s.sub}`}>{sub}</p>
      </div>
    </div>
  )
}
