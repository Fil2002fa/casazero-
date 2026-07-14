import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { ManutenzioniClient } from './ManutenzioniClient'
import type { ItemRow, CompletionRow, FilterState, AttentionModeFilter } from './ManutenzioniClient'

export const metadata: Metadata = { title: 'Panoramica manutenzioni' }

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ filtro?: string; modalita?: string }>

const VALID_FILTERS = ['scaduta', 'in_corso', 'completate'] as const
const VALID_MODE_FILTERS = ['amministratore', 'residente'] as const

export default async function ResidenceManutenzioniPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id: residenceId } = await params
  const { filtro, modalita } = await searchParams
  const initialFilter: FilterState = VALID_FILTERS.includes(filtro as typeof VALID_FILTERS[number])
    ? (filtro as FilterState)
    : null
  const initialModeFilter: AttentionModeFilter = VALID_MODE_FILTERS.includes(modalita as typeof VALID_MODE_FILTERS[number])
    ? (modalita as AttentionModeFilter)
    : null
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
        id, template_id, status, next_due_date, unit_id, priority, frequency_months, warranty_info, supplier_id,
        completion_mode, obligation_type, activation_status,
        maintenance_templates(title, category, priority, frequency_months, scope, completion_mode, obligation_type, is_active),
        units(label),
        suppliers(id, name)
      `)
      .eq('residence_id', residenceId)
      .order('next_due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('completions')
      .select('id, completed_at, item_id, performed_by_name, notes, attachments(id, file_name, storage_path)')
      .eq('residence_id', residenceId)
      .order('completed_at', { ascending: false }),
    supabase
      .from('suppliers')
      .select('id, name')
      .eq('residence_id', residenceId)
      .order('name'),
  ])

  // Mappa unit_id → nome residente primary attivo (per colpo d'occhio nelle card)
  const unitIds = [...new Set(
    (rawItems ?? []).filter(i => i.unit_id != null).map(i => i.unit_id as string)
  )]
  const unitPrimaryNames: Record<string, string> = {}
  if (unitIds.length > 0) {
    const { data: membersData } = await supabase
      .from('unit_members')
      .select('unit_id, is_primary, profiles(full_name)')
      .in('unit_id', unitIds)
      .is('ended_at', null)
      .order('is_primary', { ascending: false })
    for (const m of (membersData ?? []) as unknown as { unit_id: string; is_primary: boolean; profiles: { full_name: string | null } | null }[]) {
      if (!unitPrimaryNames[m.unit_id]) {
        const name = m.profiles?.full_name
        if (name) unitPrimaryNames[m.unit_id] = name
      }
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
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
        residenceName={residence.name}
        items={(rawItems ?? []) as unknown as ItemRow[]}
        completions={(rawCompletions ?? []) as unknown as CompletionRow[]}
        suppliers={(suppliers ?? []) as { id: string; name: string }[]}
        unitPrimaryNames={unitPrimaryNames}
        initialFilter={initialFilter}
        initialModeFilter={initialModeFilter}
      />
    </>
  )
}
