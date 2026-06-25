import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Home, Wrench, Users, Settings, FileText } from 'lucide-react'
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
    .select('id, name, address, energy_class, delivery_date')
    .eq('id', id)
    .single()

  if (!residence) notFound()

  const [{ count: unitCount }, { data: scaduteData }, { count: inCorsoCount }, { count: docCount }] =
    await Promise.all([
      supabase.from('units').select('id', { count: 'exact', head: true }).eq('residence_id', id),
      supabase.from('maintenance_items')
        .select('id, priority, maintenance_templates!inner(priority)')
        .eq('residence_id', id).eq('status', 'scaduta'),
      supabase.from('maintenance_items').select('id', { count: 'exact', head: true })
        .eq('residence_id', id).eq('status', 'in_corso'),
      supabase.from('documents').select('id', { count: 'exact', head: true }).eq('residence_id', id),
    ])

  const scadute = (scaduteData ?? []) as unknown as ScaduteRow[]
  const n2Scadute = scadute.filter(i => effPriority(i) === 'N2').length
  const n3Scadute = scadute.filter(i => effPriority(i) === 'N3').length

  const tabs = [
    { href: `/admin/residences/${id}/units`, icon: Users, label: 'Unità e inviti' },
    { href: `/admin/residences/${id}/manutenzioni`, icon: Wrench, label: 'Manutenzioni' },
    { href: `/admin/residences/${id}/documenti`, icon: FileText, label: 'Documenti' },
    { href: `/admin/residences/${id}/fornitori`, icon: Settings, label: 'Fornitori' },
  ]

  return (
    <div className="min-h-screen bg-background pb-24">
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
        {/* Stats */}
        <div className="grid grid-cols-5 gap-3">
          <StatCard label="Unità"        value={unitCount ?? 0}    icon={<Home className="w-4 h-4" />} href={`/admin/residences/${id}/units`} />
          <StatCard label="A tuo carico" value={n2Scadute}         icon={<Wrench className="w-4 h-4" />} alert={n2Scadute > 0} />
          <StatCard label="Condominiali" value={n3Scadute}         icon={<Wrench className="w-4 h-4" />} alert={n3Scadute > 0} />
          <StatCard label="In corso"     value={inCorsoCount ?? 0} icon={<Wrench className="w-4 h-4" />} />
          <StatCard label="Documenti"    value={docCount ?? 0}     icon={<FileText className="w-4 h-4" />} href={`/admin/residences/${id}/documenti`} />
        </div>

        {/* Dettagli */}
        <div className="bg-surface rounded-xl border border-border p-4 space-y-2">
          {residence.energy_class && (
            <Detail label="Classe energetica" value={residence.energy_class} />
          )}
          {residence.delivery_date && (
            <Detail label="Data consegna" value={new Date(residence.delivery_date).toLocaleDateString('it-IT', {
              day: 'numeric', month: 'long', year: 'numeric',
            })} />
          )}
        </div>

        {/* Tab navigation */}
        <div className="space-y-2">
          {tabs.map(tab => (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex items-center gap-3 bg-surface rounded-xl border border-border p-4 active:scale-[0.99] transition-transform"
            >
              <div className="w-9 h-9 bg-background rounded-lg flex items-center justify-center text-text-secondary">
                <tab.icon className="w-4 h-4" strokeWidth={1.6} />
              </div>
              <span className="text-sm font-medium text-text-primary">{tab.label}</span>
              <ChevronLeft className="w-4 h-4 text-text-secondary ml-auto rotate-180" strokeWidth={1.6} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon, alert, href }: { label: string; value: number; icon: React.ReactNode; alert?: boolean; href?: string }) {
  const inner = (
    <div className={`rounded-xl p-3 text-center border transition-colors ${alert ? 'bg-semantic-red-bg border-semantic-red/20' : 'bg-surface border-border'} ${href ? 'hover:border-brand-medium cursor-pointer' : ''}`}>
      <div className={`flex justify-center mb-1 ${alert ? 'text-semantic-red' : 'text-text-secondary'}`}>{icon}</div>
      <p className={`text-xl font-medium ${alert ? 'text-semantic-red' : 'text-text-primary'}`}>{value}</p>
      <p className="text-[10px] text-text-secondary">{label}</p>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className="text-xs font-medium text-text-primary">{value}</span>
    </div>
  )
}
