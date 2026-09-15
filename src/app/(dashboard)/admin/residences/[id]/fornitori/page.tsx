import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { FornitoriManager } from '@/components/FornitoriManager'
import { normalizeEmbed } from '@/lib/postgrest-embed'
import type { Sistema } from '@/lib/document-classification'

export const metadata: Metadata = { title: 'Fornitori' }

type Params = Promise<{ id: string }>

// Niente categories: il modello legacy non si legge più qui. L'etichetta
// diceva a schermo quello che "Lavori in questa residenza" dice meglio, e i fornitori
// creati dopo la 039 non ne hanno alcuna — le card risultavano disomogenee.
// La colonna resta in DB: è la sorgente storica da cui la 039 fa il backfill.
type SupplierRow = {
  id: string
  name: string
  phone: string | null
  email: string | null
  vat_number: string | null
}

export default async function FornitoriPage({ params }: { params: Params }) {
  const { id: residenceId } = await params
  await requireRole(['super_admin'], '/admin/manutenzioni')
  const supabase = await createClient()

  const { data: residence } = await supabase
    .from('residences')
    .select('id, name')
    .eq('id', residenceId)
    .single()

  if (!residence) notFound()

  // Due fonti, unite. suppliers.residence_id è la residenza di prima
  // creazione (039: "asse storico"), supplier_installations è il
  // collegamento vero — un fornitore creato altrove e collegato qui da
  // /admin/fornitori compare SOLO nella seconda. Leggere solo la prima
  // riproduce il bug diagnosticato (fornitori collegati altrove invisibili
  // qui); leggere solo la seconda ne crea uno peggiore, perché non tutti i
  // fornitori con residence_id = qui hanno necessariamente un collegamento.
  const [{ data: byResidenceId }, { data: installationRows }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('id, name, phone, email, vat_number')
      .eq('residence_id', residenceId),
    supabase
      .from('supplier_installations')
      .select('sistema, source, suppliers(id, name, phone, email, vat_number)')
      .eq('residence_id', residenceId),
  ])

  const suppliersById = new Map<string, SupplierRow>()
  for (const s of byResidenceId ?? []) suppliersById.set(s.id, s)

  const installedSystemsBySupplier = new Map<string, Sistema[]>()
  // Fornitori con almeno un collegamento QUI nato da una dichiarazione di
  // conformità confermata (source = 'documento', scritto solo da
  // confirmSupplierProposal). "Almeno uno", non "tutti": un fornitore può
  // avere su questa residenza un lavoro inserito a mano e uno da DiCo.
  const addedFromDocumentHere = new Set<string>()
  for (const row of installationRows ?? []) {
    const supplier = normalizeEmbed<SupplierRow>(row.suppliers)
    if (!supplier) continue
    suppliersById.set(supplier.id, supplier)
    const list = installedSystemsBySupplier.get(supplier.id) ?? []
    list.push(row.sistema as Sistema)
    installedSystemsBySupplier.set(supplier.id, list)
    if (row.source === 'documento') addedFromDocumentHere.add(supplier.id)
  }

  // Un solo array alimenta sia il contatore sia la lista dentro
  // FornitoriManager (suppliers.length e suppliers.map): l'unione avviene
  // qui, una volta sola, non in due punti che potrebbero divergere.
  const suppliers = [...suppliersById.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(s => ({
      id: s.id,
      name: s.name,
      phone: s.phone,
      email: s.email,
      vatNumber: s.vat_number,
      installedSystemsHere: installedSystemsBySupplier.get(s.id) ?? [],
      addedFromDocumentHere: addedFromDocumentHere.has(s.id),
    }))

  return (
    <>
      <PageHeader
        back={{ href: `/admin/residences/${residenceId}`, label: residence.name }}
        title="Fornitori"
        className="mb-6"
      />

      <FornitoriManager
        scope={{ kind: 'residence', residenceId }}
        suppliers={suppliers}
      />
    </>
  )
}
