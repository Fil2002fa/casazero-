import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, Home, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { effPriority, ScaduteRow } from '@/lib/residence-stats'

export const metadata: Metadata = { title: 'Residenze' }

type ResidenceRow = {
  id: string
  name: string
  address: string | null
  energy_class: string | null
  delivery_date: string | null
  _count: { units: number; n2_scadute: number; n3_scadute: number; in_corso: number }
}

export default async function ResidencesPage() {
  await requireRole(['super_admin'], '/admin/manutenzioni')
  const supabase = await createClient()

  const { data: residences } = await supabase
    .from('residences')
    .select('id, name, address, energy_class, delivery_date')
    .order('name')

  const rows: ResidenceRow[] = await Promise.all(
    (residences ?? []).map(async (r) => {
      const [{ count: unitCount }, { data: scaduteData }, { count: inCorsoCount }] =
        await Promise.all([
          supabase.from('units').select('id', { count: 'exact', head: true }).eq('residence_id', r.id),
          // Fetch scadute con join template per calcolare priorità effettiva (item.priority può essere null)
          supabase.from('maintenance_items')
            .select('id, priority, maintenance_templates!inner(priority)')
            .eq('residence_id', r.id)
            .eq('status', 'scaduta'),
          supabase.from('maintenance_items').select('id', { count: 'exact', head: true })
            .eq('residence_id', r.id).eq('status', 'in_corso'),
        ])

      const scadute = (scaduteData ?? []) as unknown as ScaduteRow[]
      const n2Scadute = scadute.filter(i => effPriority(i) === 'N2').length
      const n3Scadute = scadute.filter(i => effPriority(i) === 'N3').length

      return {
        ...r,
        _count: {
          units: unitCount ?? 0,
          n2_scadute: n2Scadute,
          n3_scadute: n3Scadute,
          in_corso: inCorsoCount ?? 0,
        },
      }
    })
  )

  return (
    <div className="p-6 space-y-6 pb-safe">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium text-text-primary">Residenze</h1>
          <p className="text-xs text-text-secondary mt-0.5">{rows.length} residenz{rows.length === 1 ? 'a' : 'e'}</p>
        </div>
        <Link
          href="/admin/residences/new"
          className="flex items-center gap-1.5 px-3 py-2 bg-brand-dark text-white rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
          Nuova
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-8 text-center space-y-3">
          <Home className="w-10 h-10 text-text-secondary mx-auto" strokeWidth={1.2} />
          <p className="text-sm text-text-secondary">Nessuna residenza. Creane una per iniziare.</p>
          <Link href="/admin/residences/new" className="inline-block px-5 py-2.5 bg-brand-dark text-white rounded-lg text-sm font-medium">
            Crea prima residenza
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => {
            const totalScadute = r._count.n2_scadute + r._count.n3_scadute
            return (
              <Link
                key={r.id}
                href={`/admin/residences/${r.id}`}
                className="block bg-surface rounded-xl border border-border p-4 active:scale-[0.99] transition-transform"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-medium text-text-primary truncate">{r.name}</h2>
                    {r.address && <p className="text-xs text-text-secondary mt-0.5 truncate">{r.address}</p>}
                  </div>
                  {totalScadute > 0 && (
                    <div className="flex items-center gap-1 text-semantic-red flex-shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.8} />
                      <span className="text-xs font-medium">{totalScadute}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-3 mt-3">
                  <Stat label="Unità" value={r._count.units} />
                  <Stat label="A tuo carico" value={r._count.n2_scadute} alert={r._count.n2_scadute > 0} />
                  <Stat label="Condominiali" value={r._count.n3_scadute} alert={r._count.n3_scadute > 0} />
                  <Stat label="In corso" value={r._count.in_corso} />
                  {r.energy_class && <Stat label="Classe" value={r.energy_class} />}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div className="text-center">
      <p className={`text-sm font-medium ${alert ? 'text-semantic-red' : 'text-text-primary'}`}>{value}</p>
      <p className="text-[10px] text-text-secondary">{label}</p>
    </div>
  )
}
