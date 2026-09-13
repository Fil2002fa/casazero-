import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { computeResidenceChecklist } from '@/lib/document-checklist'
import { DocumentiClient } from './DocumentiClient'
import type { DocRow, UnitRow } from './DocumentiClient'
import type {
  SupplierProposalCandidate,
  SupplierInstallationRef,
} from '@/lib/document-classification'

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
  const profile = await requireRole(['admin', 'super_admin'], '/admin/manutenzioni')
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

  // Nomi leggibili per "Escluso da {utente}" (028): solo i marked_by
  // realmente presenti tra le attese di questa residenza, non tutti i
  // profili del builder. full_name da profiles (mai email, che non c'è
  // su questa tabella — CLAUDE.md).
  const markedByIds = [...new Set(
    checklist.expectations.map(e => e.markedBy).filter((id): id is string => id !== null)
  )]
  const markedByNames: Record<string, string | null> = {}
  if (markedByIds.length > 0) {
    const { data: markers } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', markedByIds)
    for (const m of markers ?? []) {
      markedByNames[m.id as string] = (m.full_name as string | null) ?? null
    }
  }

  // Anagrafica fornitori per la proposta dalle DiCo: dati e gate, nessuna
  // UI ancora. Le due liste sono gli input di buildSupplierProposal.
  //
  // I fornitori si leggono BUILDER-WIDE, non della sola residenza: l'impresa
  // che ha firmato la DiCo qui può essere stata creata su un'altra residenza
  // dello stesso costruttore (suppliers.residence_id è la residenza di prima
  // creazione, 039), e cercarla solo tra i fornitori di questa residenza
  // darebbe "nessun match" su un fornitore già in anagrafica — proprio il
  // duplicato che la proposta esiste per evitare.
  //
  // I collegamenti invece sono della SOLA residenza: servono a riconoscere un
  // "ha realizzato" già presente QUI, e il vincolo UNIQUE della 039 è
  // (supplier_id, residence_id, sistema). Un collegamento su un'altra
  // residenza non dice nulla su questa.
  //
  // Gate alla fonte, non solo nel componente: l'admin non propone fornitori,
  // quindi non riceve l'anagrafica del costruttore e le due query non partono
  // nemmeno. La capability si lega al builder_id effettivo invece che al solo
  // ruolo: senza builder_id non c'è anagrafica da cercare, e un pannello che
  // dicesse "nessun match" su una lista vuota per un difetto di profilo
  // spingerebbe a creare un doppione.
  const builderId = profile.role === 'super_admin' ? profile.builder_id : null
  const canLinkSuppliers = builderId !== null

  let suppliers: SupplierProposalCandidate[] = []
  let supplierInstallations: SupplierInstallationRef[] = []
  if (builderId !== null) {
    const [{ data: rawSuppliers }, { data: rawInstallations }] = await Promise.all([
      supabase
        .from('suppliers')
        .select('id, name, vat_number')
        .eq('builder_id', builderId)
        .order('name'),
      supabase
        .from('supplier_installations')
        .select('supplier_id, sistema')
        .eq('residence_id', residenceId),
    ])
    suppliers = (rawSuppliers ?? []) as SupplierProposalCandidate[]
    supplierInstallations = (rawInstallations ?? []) as SupplierInstallationRef[]
  }

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
        markedByNames={markedByNames}
        canManageChecklist={profile.role === 'super_admin'}
        canLinkSuppliers={canLinkSuppliers}
        suppliers={suppliers}
        supplierInstallations={supplierInstallations}
      />
    </>
  )
}
