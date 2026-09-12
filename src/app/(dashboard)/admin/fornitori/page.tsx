import type { Metadata } from 'next'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { FornitoriManager } from '@/components/FornitoriManager'
import type { Sistema } from '@/lib/document-classification'

export const metadata: Metadata = { title: 'Fornitori — CasaZero' }

/**
 * L'embed to-one di PostgREST può arrivare come oggetto o come array di uno,
 * a seconda di come deduce la relazione (stessa bug class di
 * residences/[id]/attivita/page.tsx:25-38): il client qui non è tipizzato,
 * quindi il compilatore non discrimina il caso. Assumere solo l'oggetto
 * darebbe "—" in silenzio per ogni riga se PostgREST tornasse un array.
 */
function embeddedResidenceName(residences: unknown): string {
  const row = Array.isArray(residences) ? residences[0] : residences
  if (row !== null && typeof row === 'object' && 'name' in row) {
    const name = (row as { name: unknown }).name
    if (typeof name === 'string') return name
  }
  return '—'
}

export default async function FornitoriBuilderPage() {
  const profile = await requireRole(['super_admin'])
  const builderId = profile.builder_id!
  const supabase = await createClient()

  const { data: residences } = await supabase
    .from('residences')
    .select('id, name')
    .eq('builder_id', builderId)
    .order('name')

  const { data: suppliersRaw } = await supabase
    .from('suppliers')
    .select('id, name, phone, email, vat_number')
    .eq('builder_id', builderId)
    .order('name')

  const supplierIds = (suppliersRaw ?? []).map(s => s.id)

  const { data: installationsRaw } = supplierIds.length > 0
    ? await supabase
        .from('supplier_installations')
        .select('supplier_id, sistema, residences(name)')
        .in('supplier_id', supplierIds)
    : { data: [] as { supplier_id: string; sistema: string; residences: unknown }[] }

  const installationsBySupplier = new Map<string, { sistema: Sistema; residenceName: string }[]>()
  for (const row of installationsRaw ?? []) {
    const list = installationsBySupplier.get(row.supplier_id) ?? []
    list.push({ sistema: row.sistema as Sistema, residenceName: embeddedResidenceName(row.residences) })
    installationsBySupplier.set(row.supplier_id, list)
  }

  const suppliers = (suppliersRaw ?? []).map(s => ({
    id: s.id,
    name: s.name,
    phone: s.phone,
    email: s.email,
    vatNumber: s.vat_number,
    installations: installationsBySupplier.get(s.id) ?? [],
  }))

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-medium text-text-primary">Fornitori</h1>
        <p className="text-xs text-text-secondary mt-0.5">Anagrafica del costruttore</p>
      </header>

      <FornitoriManager
        scope={{ kind: 'builder', builderId, residences: residences ?? [] }}
        suppliers={suppliers}
      />
    </div>
  )
}
