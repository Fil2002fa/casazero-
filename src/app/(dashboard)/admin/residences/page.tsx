import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { buttonVariants } from '@/components/ui/Button'
import { ResidencesTable, type ResidenceRow } from './ResidencesTable'
import { ResidencesEmptyState } from './ResidencesEmptyState'

export const metadata: Metadata = { title: 'Residenze' }

export default async function ResidencesPage() {
  const profile = await requireRole(['admin', 'super_admin'], '/admin/manutenzioni')

  // Una sola vista per i due ruoli: cambia ciò che il costruttore può fare
  // (creare, vedere chi amministra), non la pagina. Lo scoping delle residenze
  // è tutto della RLS (czero_can_access_residence via client scoped-utente):
  // il costruttore vede le sue, l'amministratore quelle che segue.
  const canManage = profile.role === 'super_admin'

  const supabase = await createClient()

  const { data: residences } = await supabase
    .from('residences')
    .select('id, name, address')
    .order('name')

  type AdminRow = { profiles: { full_name: string | null } | null } | null

  const rows: ResidenceRow[] = await Promise.all(
    (residences ?? []).map(async (r) => {
      // admin_assignments solo per il costruttore: la colonna Amministratore non
      // esiste per l'amministratore (sarebbe il suo nome su ogni riga), e per
      // lui interrogarla sarebbe una seconda fonte di verità sull'appartenenza.
      const [{ count: unitCount }, adminRes] = await Promise.all([
        supabase.from('units').select('id', { count: 'exact', head: true }).eq('residence_id', r.id),
        canManage
          ? supabase.from('admin_assignments')
              .select('profiles(full_name)')
              .eq('residence_id', r.id)
              .maybeSingle()
          : null,
      ])

      const admin = (adminRes?.data ?? null) as unknown as AdminRow

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
        {canManage && (
          <Link href="/admin/residences/new" className={buttonVariants('primary', 'default', 'gap-2')}>
            <Plus className="w-4 h-4" strokeWidth={2} />
            Nuova residenza
          </Link>
        )}
      </header>

      <div className="mt-12">
        {rows.length === 0
          ? <ResidencesEmptyState canCreate={canManage} />
          : <ResidencesTable rows={rows} showAdminColumn={canManage} />}
      </div>
    </>
  )
}
