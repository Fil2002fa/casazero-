import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { FileDown } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { computeResidenceChecklist } from '@/lib/document-checklist'
import { PG_INVALID_TEXT_REPRESENTATION } from '@/lib/document-access'
import { todayISO } from '@/lib/maintenance-status'
import { loadResidenceDocumentRows } from '@/lib/document-rows.server'
import { correctionAuthorIds } from '@/lib/document-rows'
import { DocumentiClient } from './DocumentiClient'
import type {
  SupplierProposalCandidate,
  SupplierInstallationRef,
} from '@/lib/document-classification'

export const metadata: Metadata = { title: 'Documenti residenza' }

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ onboarding?: string }>

// Guasto tecnico nel caricamento: NON è "nessun documento" e NON è "residenza
// inesistente". Mostra un avviso con Riprova invece dello stato vuoto, che
// direbbe il falso (e offrirebbe di caricare documenti su una lista che non si
// è riusciti a leggere). Il dettaglio è già nel log del server.
function DocumentiLoadError({ residenceId, residenceName }: { residenceId: string; residenceName: string | null }) {
  return (
    <>
      <PageHeader
        back={{ href: `/admin/residences/${residenceId}`, label: residenceName ?? 'Residenza' }}
        title="Documenti"
        className="mb-6"
      />
      <div
        role="alert"
        className="bg-neutral-600/7 border border-neutral-600/20 rounded-xl px-4 py-3 text-sm text-neutral-600 flex items-center gap-3"
      >
        <p className="flex-1 min-w-0">
          Impossibile caricare i documenti per un problema tecnico. Riprova tra poco.
        </p>
        <a
          href={`/admin/residences/${residenceId}/documenti`}
          className="flex-shrink-0 px-3 py-2 border border-brand-medium rounded-lg text-xs font-medium text-brand-dark"
        >
          Riprova
        </a>
      </div>
    </>
  )
}

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

  // maybeSingle: "nessuna residenza" è un esito di dominio (data null, error
  // null; anche un id non UUID, 22P02), un errore di rete o di RLS no.
  const { data: residence, error: residenceError } = await supabase
    .from('residences')
    .select('id, name')
    .eq('id', residenceId)
    .maybeSingle()

  if (residenceError && residenceError.code !== PG_INVALID_TEXT_REPRESENTATION) {
    console.error('[documenti] lettura residenza fallita', { residenceId, code: residenceError.code, message: residenceError.message })
    return <DocumentiLoadError residenceId={residenceId} residenceName={null} />
  }
  if (!residence) notFound()

  // Documenti + unità dal loader condiviso con l'export Excel (client di
  // sessione, perimetro RLS). Un errore tecnico è già nel log del server e
  // qui non diventa una lista vuota: si mostra l'avviso con Riprova.
  const [{ docs, units, error: loadError }, checklist] = await Promise.all([
    loadResidenceDocumentRows(supabase, residenceId),
    computeResidenceChecklist(supabase, residenceId),
  ])
  if (loadError) return <DocumentiLoadError residenceId={residenceId} residenceName={residence.name} />

  // Nomi leggibili per "Escluso da {utente}" (028): solo i marked_by
  // realmente presenti tra le attese di questa residenza, non tutti i
  // profili del builder. full_name da profiles (mai email, che non c'è
  // su questa tabella — CLAUDE.md).
  const markedByIds = checklist.available
    ? [...new Set(
        checklist.expectations.map(e => e.markedBy).filter((id): id is string => id !== null)
      )]
    : []
  const markedByNames: Record<string, string | null> = {}
  if (markedByIds.length > 0) {
    const { data: markers, error: markersError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', markedByIds)
    if (markersError) {
      console.error('[documenti] lettura nomi di chi ha escluso le voci fallita', markersError)
    }
    for (const m of markers ?? []) {
      markedByNames[m.id as string] = (m.full_name as string | null) ?? null
    }
  }

  // Nomi di chi ha corretto a mano i dati estratti (048): solo gli autori delle
  // correzioni in vigore, stesso schema di markedByNames. Un errore tecnico
  // non rompe la pagina: l'etichetta "Modificato a mano" esce senza il nome.
  const correctedByIds = correctionAuthorIds(docs)
  const correctedByNames: Record<string, string | null> = {}
  if (correctedByIds.length > 0) {
    const { data: authors, error: authorsError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', correctedByIds)
    if (authorsError) {
      console.error('[documenti] lettura autori delle correzioni fallita', authorsError)
    }
    for (const a of authors ?? []) {
      correctedByNames[a.id as string] = (a.full_name as string | null) ?? null
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

  let suppliers: SupplierProposalCandidate[] = []
  let supplierInstallations: SupplierInstallationRef[] = []
  // Lettura dell'anagrafica fallita (guasto tecnico, non "anagrafica vuota"):
  // la proposta si sospende invece di girare su liste vuote, che darebbero
  // "nessun match" e spingerebbero a creare un doppione di un fornitore che
  // esiste. Stesso gate dell'admin (canLinkSuppliers false ⇒ supplierContext
  // null), più un banner con Riprova.
  let supplierDataUnavailable = false
  if (builderId !== null) {
    const [
      { data: rawSuppliers, error: suppliersError },
      { data: rawInstallations, error: installationsError },
    ] = await Promise.all([
      supabase
        .from('suppliers')
        .select('id, name, vat_number')
        .eq('builder_id', builderId)
        .order('name'),
      supabase
        .from('supplier_installations')
        // source_document_id: solo per l'avviso di disallineamento in DocCard
        // (impresa del documento vs fornitore collegato da quel documento).
        .select('supplier_id, sistema, source_document_id')
        .eq('residence_id', residenceId),
    ])
    const supplierFailures = [
      { table: 'suppliers', error: suppliersError },
      { table: 'supplier_installations', error: installationsError },
    ].filter(f => f.error)
    if (supplierFailures.length > 0) {
      console.error('[documenti] lettura anagrafica fornitori fallita, proposta fornitore sospesa', {
        residenceId,
        failures: supplierFailures.map(f => ({ table: f.table, code: f.error?.code, message: f.error?.message })),
      })
      supplierDataUnavailable = true
    } else {
      suppliers = (rawSuppliers ?? []) as SupplierProposalCandidate[]
      supplierInstallations = (rawInstallations ?? []) as SupplierInstallationRef[]
    }
  }
  const canLinkSuppliers = builderId !== null && !supplierDataUnavailable

  return (
    <>
      <PageHeader
        back={{ href: `/admin/residences/${residenceId}`, label: residence.name }}
        title="Documenti"
        actions={docs.length > 0 && (
          // Stesso link per super_admin e admin: il gate è nella route
          // (authorizeResidenceActor). Stile del download della pagina Fascicolo.
          <a
            href={`/api/documenti-xlsx?residenceId=${residenceId}`}
            download
            className="flex items-center gap-1.5 px-3 py-2 border border-brand-medium rounded-lg text-xs font-medium text-brand-dark flex-shrink-0"
          >
            <FileDown className="w-3.5 h-3.5" strokeWidth={1.8} />
            Esporta Excel
          </a>
        )}
        className="mb-6"
      />

      {/* Solo informativo: nessun gate, la pagina funziona identica senza ?onboarding=1 */}
      {isOnboarding && (
        <div className="bg-brand-light rounded-xl p-4 flex items-center gap-3 mb-6">
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
        docs={docs}
        units={units}
        checklist={checklist}
        today={todayISO()}
        markedByNames={markedByNames}
        correctedByNames={correctedByNames}
        canManageChecklist={profile.role === 'super_admin'}
        canLinkSuppliers={canLinkSuppliers}
        supplierDataUnavailable={supplierDataUnavailable}
        residenceName={residence.name}
        suppliers={suppliers}
        supplierInstallations={supplierInstallations}
      />
    </>
  )
}
