import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { DocumentiClient } from './DocumentiClient'
import type { DocRow, UnitRow } from './DocumentiClient'

export const metadata: Metadata = { title: 'Documenti residenza' }

type Params = Promise<{ id: string }>

export default async function ResidenceDocumentiPage({ params }: { params: Params }) {
  const { id: residenceId } = await params
  await requireRole(['super_admin'], '/admin/manutenzioni')
  const supabase = await createClient()

  const { data: residence } = await supabase
    .from('residences')
    .select('id, name')
    .eq('id', residenceId)
    .single()

  if (!residence) notFound()

  const [{ data: rawDocs }, { data: rawUnits }] = await Promise.all([
    supabase
      .from('documents')
      .select('id, title, category, file_name, storage_path, file_date, unit_id, created_at')
      .eq('residence_id', residenceId)
      .order('created_at', { ascending: false }),
    supabase
      .from('units')
      .select('id, label')
      .eq('residence_id', residenceId)
      .order('label'),
  ])

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="bg-surface border-b border-border px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link
          href={`/admin/residences/${residenceId}`}
          className="text-text-secondary p-1 -ml-1 rounded-lg"
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={1.6} />
        </Link>
        <div className="flex-1">
          <h1 className="text-base font-medium text-text-primary">Documenti</h1>
          <p className="text-xs text-text-secondary">{residence.name}</p>
        </div>
      </div>

      <DocumentiClient
        residenceId={residenceId}
        docs={(rawDocs ?? []) as DocRow[]}
        units={(rawUnits ?? []) as UnitRow[]}
      />
    </div>
  )
}
