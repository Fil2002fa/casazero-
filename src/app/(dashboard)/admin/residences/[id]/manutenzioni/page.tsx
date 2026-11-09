import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { ManutenzioniClient } from './ManutenzioniClient'
import type { ItemRow, CompletionRow } from './ManutenzioniClient'
import { normalizeEmbed } from '@/lib/postgrest-embed'
import { todayISO } from '@/lib/maintenance-status'

export const metadata: Metadata = { title: 'Panoramica manutenzioni' }

type Params = Promise<{ id: string }>

export default async function ResidenceManutenzioniPage({ params }: { params: Params }) {
  const { id: residenceId } = await params
  const profile = await requireRole(['admin', 'super_admin'], '/admin/manutenzioni')
  const supabase = await createClient()

  const { data: residence } = await supabase
    .from('residences')
    .select('id, name')
    .eq('id', residenceId)
    .single()

  if (!residence) notFound()

  const [{ data: rawItems }, { data: rawCompletions }, { data: byResidenceId }, { data: installedRows }] = await Promise.all([
    supabase
      .from('maintenance_items')
      .select(`
        id, template_id, status, next_due_date, unit_id, priority, frequency_months, warranty_info, supplier_id,
        completion_mode, obligation_type, activation_status,
        maintenance_templates(title, category, priority, frequency_months, scope, completion_mode, obligation_type, is_active),
        units(label, delivery_date),
        suppliers(id, name, phone, email)
      `)
      .eq('residence_id', residenceId)
      .order('next_due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('completions')
      .select('id, completed_at, item_id, performed_by_name, notes, attachments(id, file_name, storage_path)')
      .eq('residence_id', residenceId)
      .order('completed_at', { ascending: false }),
    // Due fonti, unite (stesso bug/fix di residences/[id]/fornitori/page.tsx):
    // suppliers.residence_id è la residenza di prima creazione, non il
    // collegamento vero. Un fornitore collegato qui da /admin/fornitori senza
    // essere stato creato qui deve poter comparire in questo dropdown.
    supabase
      .from('suppliers')
      .select('id, name')
      .eq('residence_id', residenceId),
    supabase
      .from('supplier_installations')
      .select('suppliers(id, name)')
      .eq('residence_id', residenceId),
  ])

  const suppliersById = new Map<string, { id: string; name: string }>()
  for (const s of byResidenceId ?? []) suppliersById.set(s.id, s)
  for (const row of installedRows ?? []) {
    const supplier = normalizeEmbed<{ id: string; name: string }>(row.suppliers)
    if (supplier) suppliersById.set(supplier.id, supplier)
  }
  const suppliers = [...suppliersById.values()].sort((a, b) => a.name.localeCompare(b.name))

  // Fornitore: dato interno del costruttore, mai all'amministratore. La RLS
  // (038) è la barriera reale; qui si spoglia anche lato applicativo per non
  // far dipendere la UI dal solo embed silenziosamente vuoto.
  const isSuperAdmin = profile.role === 'super_admin'
  const visibleItems = isSuperAdmin
    ? (rawItems ?? [])
    : (rawItems ?? []).map(i => ({ ...i, suppliers: null }))
  const visibleSuppliers = isSuperAdmin ? suppliers : []

  return (
    <>
      <PageHeader
        back={{ href: `/admin/residences/${residenceId}`, label: residence.name }}
        title="Manutenzioni"
        className="mb-6"
      />

      <ManutenzioniClient
        residenceId={residenceId}
        residenceName={residence.name}
        items={visibleItems as unknown as ItemRow[]}
        completions={(rawCompletions ?? []) as unknown as CompletionRow[]}
        suppliers={visibleSuppliers as { id: string; name: string }[]}
        canManagePlan={profile.role === 'super_admin'}
        today={todayISO()}
      />
    </>
  )
}
