import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { ManutenzioniClient } from './ManutenzioniClient'
import type { ItemRow, CompletionRow } from './ManutenzioniClient'

export const metadata: Metadata = { title: 'Panoramica manutenzioni' }

type Params = Promise<{ id: string }>

export default async function ResidenceManutenzioniPage({ params }: { params: Params }) {
  const { id: residenceId } = await params
  await requireRole(['super_admin'], '/admin/manutenzioni')
  const supabase = await createClient()

  const { data: residence } = await supabase
    .from('residences')
    .select('id, name')
    .eq('id', residenceId)
    .single()

  if (!residence) notFound()

  const [{ data: rawItems }, { data: rawCompletions }, { data: suppliers }] = await Promise.all([
    supabase
      .from('maintenance_items')
      .select(`
        id, status, next_due_date, unit_id, priority, frequency_months, warranty_info, supplier_id,
        maintenance_templates(title, category, priority, frequency_months, scope),
        units(label),
        suppliers(id, name)
      `)
      .eq('residence_id', residenceId)
      .order('next_due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('completions')
      .select('id, completed_at, item_id, performed_by_name')
      .eq('residence_id', residenceId)
      .order('completed_at', { ascending: false }),
    supabase
      .from('suppliers')
      .select('id, name')
      .eq('residence_id', residenceId)
      .order('name'),
  ])

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="bg-surface border-b border-border px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href={`/admin/residences/${residenceId}`} className="text-text-secondary p-1 -ml-1 rounded-lg">
          <ChevronLeft className="w-5 h-5" strokeWidth={1.6} />
        </Link>
        <div className="flex-1">
          <h1 className="text-base font-medium text-text-primary">Manutenzioni</h1>
          <p className="text-xs text-text-secondary">{residence.name}</p>
        </div>
      </div>

      <ManutenzioniClient
        residenceId={residenceId}
        items={(rawItems ?? []) as unknown as ItemRow[]}
        completions={(rawCompletions ?? []) as unknown as CompletionRow[]}
        suppliers={(suppliers ?? []) as { id: string; name: string }[]}
      />
    </div>
  )
}
