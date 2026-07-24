import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { computeResidenceChecklist } from '@/lib/document-checklist'
import { DocumentiClient } from './DocumentiClient'
import type { DocRow, UnitRow } from './DocumentiClient'

export const metadata: Metadata = { title: 'Documenti residenza' }

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ onboarding?: string }>

export default async function ResidenceDocumentiPage({
  params, searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const { id: residenceId } = await params
  const { onboarding } = await searchParams
  const isOnboarding = onboarding === '1'
  await requireRole(['super_admin'], '/admin/manutenzioni')
  const supabase = await createClient()

  const { data: residence } = await supabase
    .from('residences')
    .select('id, name')
    .eq('id', residenceId)
    .single()

  if (!residence) notFound()

  const [{ data: rawDocs }, { data: rawUnits }, checklist] = await Promise.all([
    supabase
      .from('documents')
      .select('id, title, category, file_name, storage_path, file_date, unit_id, created_at, classification_status, doc_type, sistema, classification_confidence, extracted_metadata')
      .eq('residence_id', residenceId)
      .order('created_at', { ascending: false }),
    supabase
      .from('units')
      .select('id, label')
      .eq('residence_id', residenceId)
      .order('label'),
    computeResidenceChecklist(supabase, residenceId),
  ])

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
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

      {/* Solo informativo: nessun gate, la pagina funziona identica senza ?onboarding=1 */}
      {isOnboarding && (
        <div className="bg-brand-light rounded-xl p-4 flex items-center gap-3 mb-5">
          <p className="text-sm text-brand-dark flex-1 min-w-0">
            Residenza creata. Puoi caricare ora i documenti di consegna, oppure farlo in
            qualsiasi momento da questa pagina.
          </p>
          <Link
            href={`/admin/residences/${residenceId}`}
            className="flex-shrink-0 text-sm font-medium text-brand-medium hover:underline"
          >
            Salta per ora
          </Link>
        </div>
      )}

      <DocumentiClient
        residenceId={residenceId}
        docs={(rawDocs ?? []) as DocRow[]}
        units={(rawUnits ?? []) as UnitRow[]}
        checklist={checklist}
      />
    </>
  )
}
