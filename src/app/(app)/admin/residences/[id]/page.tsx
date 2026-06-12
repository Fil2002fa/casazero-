import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Home, Wrench, Users, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

export const metadata: Metadata = { title: 'Residenza' }

type Params = Promise<{ id: string }>

export default async function ResidenceDetailPage({ params }: { params: Params }) {
  const { id } = await params
  await requireRole(['super_admin'])
  const supabase = await createClient()

  const { data: residence } = await supabase
    .from('residences')
    .select('id, name, address, energy_class, delivery_date')
    .eq('id', id)
    .single()

  if (!residence) notFound()

  const [{ count: unitCount }, { count: scaduteCount }, { count: docCount }] = await Promise.all([
    supabase.from('units').select('id', { count: 'exact', head: true }).eq('residence_id', id),
    supabase.from('maintenance_items').select('id', { count: 'exact', head: true })
      .eq('residence_id', id).eq('status', 'scaduta'),
    supabase.from('documents').select('id', { count: 'exact', head: true }).eq('residence_id', id),
  ])

  const tabs = [
    { href: `/admin/residences/${id}/units`, icon: Users, label: 'Unità e inviti' },
    { href: `/admin/residences/${id}/manutenzioni`, icon: Wrench, label: 'Manutenzioni' },
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
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Unità" value={unitCount ?? 0} icon={<Home className="w-4 h-4" />} />
          <StatCard label="Scadute" value={scaduteCount ?? 0} icon={<Wrench className="w-4 h-4" />} alert={(scaduteCount ?? 0) > 0} />
          <StatCard label="Documenti" value={docCount ?? 0} icon={<Users className="w-4 h-4" />} />
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

function StatCard({ label, value, icon, alert }: { label: string; value: number; icon: React.ReactNode; alert?: boolean }) {
  return (
    <div className={`rounded-xl p-3 text-center border ${alert ? 'bg-semantic-red-bg border-semantic-red/20' : 'bg-surface border-border'}`}>
      <div className={`flex justify-center mb-1 ${alert ? 'text-semantic-red' : 'text-text-secondary'}`}>{icon}</div>
      <p className={`text-xl font-medium ${alert ? 'text-semantic-red' : 'text-text-primary'}`}>{value}</p>
      <p className="text-[10px] text-text-secondary">{label}</p>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className="text-xs font-medium text-text-primary">{value}</span>
    </div>
  )
}
