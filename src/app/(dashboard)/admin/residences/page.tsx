import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, Home, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

export const metadata: Metadata = { title: 'Residenze' }

type ResidenceRow = {
  id: string
  name: string
  address: string | null
  energy_class: string | null
  delivery_date: string | null
  _count: { units: number; scadute: number; in_corso: number }
}

export default async function ResidencesPage() {
  await requireRole(['super_admin'])
  const supabase = await createClient()

  const { data: residences } = await supabase
    .from('residences')
    .select('id, name, address, energy_class, delivery_date')
    .order('name')

  // Per ogni residenza conta unità e manutenzioni urgenti
  const rows: ResidenceRow[] = await Promise.all(
    (residences ?? []).map(async (r) => {
      const [{ count: unitCount }, { count: scaduteCount }, { count: inCorsoCount }] =
        await Promise.all([
          supabase.from('units').select('id', { count: 'exact', head: true }).eq('residence_id', r.id),
          supabase.from('maintenance_items').select('id', { count: 'exact', head: true })
            .eq('residence_id', r.id).eq('status', 'scaduta'),
          supabase.from('maintenance_items').select('id', { count: 'exact', head: true })
            .eq('residence_id', r.id).eq('status', 'in_corso'),
        ])
      return {
        ...r,
        _count: { units: unitCount ?? 0, scadute: scaduteCount ?? 0, in_corso: inCorsoCount ?? 0 },
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

      {/* Links admin globali */}
      <div className="flex gap-2">
        <Link href="/admin/settings" className="px-3 py-1.5 text-xs border border-border rounded-full text-text-secondary bg-surface">
          Impostazioni white-label
        </Link>
        <Link href="/admin/manutenzioni" className="px-3 py-1.5 text-xs border border-border rounded-full text-text-secondary bg-surface">
          Vista N3
        </Link>
      </div>

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
          {rows.map(r => (
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
                {r._count.scadute > 0 && (
                  <div className="flex items-center gap-1 text-semantic-red flex-shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.8} />
                    <span className="text-xs font-medium">{r._count.scadute}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-3">
                <Stat label="Unità" value={r._count.units} />
                <Stat label="Scadute" value={r._count.scadute} alert={r._count.scadute > 0} />
                <Stat label="In corso" value={r._count.in_corso} />
                {r.energy_class && <Stat label="Classe" value={r.energy_class} />}
              </div>
            </Link>
          ))}
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
