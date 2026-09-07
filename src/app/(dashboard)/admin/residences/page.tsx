import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { buttonVariants } from '@/components/ui/Button'
import { ResidencesTable, type ResidenceRow } from './ResidencesTable'
import { ResidencesEmptyState, ResidencesEmptyStateAdmin } from './ResidencesEmptyState'

export const metadata: Metadata = { title: 'Residenze' }

export default async function ResidencesPage() {
  const profile = await requireRole(['admin', 'super_admin'], '/admin/manutenzioni')

  // Ramo admin: stesso oggetto guardato da un altro angolo — niente creazione,
  // niente colonna Amministratore, vuoto suo. Stesso trattamento del ramo
  // admin della pagina residenza singola ([id]/page.tsx).
  if (profile.role === 'admin') return <AdminResidencesView />

  const supabase = await createClient()

  const { data: residences } = await supabase
    .from('residences')
    .select('id, name, address')
    .order('name')

  type AdminRow = { profiles: { full_name: string | null } | null } | null

  const rows: ResidenceRow[] = await Promise.all(
    (residences ?? []).map(async (r) => {
      const [{ count: unitCount }, { data: adminRaw }] = await Promise.all([
        supabase.from('units').select('id', { count: 'exact', head: true }).eq('residence_id', r.id),
        supabase.from('admin_assignments')
          .select('profiles(full_name)')
          .eq('residence_id', r.id)
          .maybeSingle(),
      ])

      const admin = adminRaw as unknown as AdminRow

      return {
        id: r.id,
        name: r.name,
        address: r.address,
        unitCount: unitCount ?? 0,
        adminName: admin?.profiles?.full_name ?? null,
      }
    })
  )

  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-semibold text-text-primary">Residenze</h1>
        <Link href="/admin/residences/new" className={buttonVariants('primary', 'default', 'gap-2')}>
          <Plus className="w-4 h-4" strokeWidth={2} />
          Nuova residenza
        </Link>
      </header>

      <div className="mt-12">
        {rows.length === 0 ? <ResidencesEmptyState /> : <ResidencesTable rows={rows} showAdminColumn />}
      </div>
    </>
  )
}

// Elenco per l'amministratore: le residenze che segue, come porta d'ingresso
// alle sotto-pagine. Lo scoping è tutto della RLS (czero_can_access_residence
// via client scoped-utente): nessuna query su admin_assignments qui, che
// sarebbe una seconda fonte di verità sull'appartenenza.
async function AdminResidencesView() {
  const supabase = await createClient()

  const { data: residences } = await supabase
    .from('residences')
    .select('id, name, address')
    .order('name')

  // Niente admin_assignments nel fan-out: la colonna Amministratore non
  // esiste in questa vista, quindi il dato non serve e non si interroga.
  const rows: ResidenceRow[] = await Promise.all(
    (residences ?? []).map(async (r) => {
      const { count: unitCount } = await supabase
        .from('units')
        .select('id', { count: 'exact', head: true })
        .eq('residence_id', r.id)

      return {
        id: r.id,
        name: r.name,
        address: r.address,
        unitCount: unitCount ?? 0,
      }
    })
  )

  return (
    <>
      <header>
        <h1 className="font-serif text-3xl font-semibold text-text-primary">Residenze</h1>
      </header>

      <div className="mt-12">
        {rows.length === 0
          ? <ResidencesEmptyStateAdmin />
          : <ResidencesTable rows={rows} showAdminColumn={false} />}
      </div>
    </>
  )
}
