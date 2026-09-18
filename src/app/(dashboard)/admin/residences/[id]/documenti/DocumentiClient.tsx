'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Download, Upload, X, Loader2, CheckCircle2, AlertCircle, Clock, Sparkles, ChevronDown, FileSearch } from 'lucide-react'
import type { DocumentCategory } from '@/types/database'
import { createUploadUrl, confirmDocument, confirmClassification, setChecklistException, clearChecklistException, confirmSupplierProposal } from './actions'
import type { SupplierProposalExpectation } from './actions'
import { ALLOWED_DOCUMENT_MIME, MAX_DOCUMENT_SIZE } from '@/lib/document-upload'
import { pluralize } from '@/lib/pluralize'
import { formatDateIT } from '@/lib/formatDate'
import { DateField } from '@/components/DateField'
import {
  DOC_TYPES,
  DOC_TYPE_LABELS,
  SISTEMI,
  SISTEMA_LABELS,
  buildSupplierProposal,
  supplierVatNumberToWrite,
  type DocType,
  type Sistema,
  type ClassificationStatus,
  type SupplierProposalCandidate,
  type SupplierInstallationRef,
  type SupplierProposal,
} from '@/lib/document-classification'
import type { ChecklistResult, ChecklistExpectation } from '@/lib/document-checklist'
import {
  AMBITI,
  AMBITO_LABELS,
  isExtractableDocType,
  isTypedDocType,
  needsExtraction,
  extractionIsCurrent,
  validityEntries,
  validityFormula,
  type Ambito,
  type DocumentExtractionRow,
  type GaranziaFields,
  type ApeFields,
  type PolizzaFields,
} from '@/lib/document-extraction'
import { createClient } from '@/lib/supabase/client'

// Sottoinsieme letto di extracted_metadata (jsonb): la proposta AI completa,
// oppure una nota di skip. Tutti i campi opzionali — si legge in difesa.
// È il VERBALE della proposta AI (immutabile): doc_type/sistema qui sono
// ciò che ha detto la macchina, MAI la correzione umana (che vive nelle
// colonne documents.doc_type / documents.sistema).
type ClassificationMetadata = {
  doc_type?: DocType
  sistema?: Sistema | null
  confidence?: number
  motivazione?: string
  unita_riferimento?: string | null
  skipped_reason?: string
  nota?: string
  // Impresa installatrice, valorizzata da route.ts SOLO per
  // dich_conformita_dm37 e azzerata per ogni altro doc_type. La P.IVA arriva
  // qui già normalizzata a sole cifre; la ragione sociale no, e può essere
  // stringa vuota. Restano parte del verbale: la conferma umana della
  // proposta fornitore non li riscrive mai.
  ragione_sociale_installatore?: string | null
  partita_iva_installatore?: string | null
}

export type DocRow = {
  id: string
  title: string
  category: DocumentCategory
  file_name: string
  storage_path: string
  file_date: string | null
  unit_id: string | null
  created_at: string
  classification_status: ClassificationStatus
  doc_type: DocType | null
  sistema: Sistema | null
  classification_confidence: number | null
  extracted_metadata: ClassificationMetadata | null
  // Estrazione dati (040, seconda chiamata AI): null = mai estratto. Vale
  // solo se for_doc_type coincide con doc_type (extractionIsCurrent): dopo
  // una riclassificazione umana la riga resta ma il documento torna "da
  // estrarre". Distinta da extracted_metadata, che è il verbale della
  // classificazione.
  extraction: DocumentExtractionRow | null
}

export type UnitRow = {
  id: string
  label: string
}

const CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: 'proprieta',      label: 'Proprietà' },
  { value: 'tecnici',        label: 'Tecnici' },
  { value: 'energetici',     label: 'Energetici' },
  { value: 'conformita',     label: 'Conformità' },
  { value: 'amministrativi', label: 'Amministrativi' },
]

const CAT_LABELS: Record<DocumentCategory, string> = {
  proprieta:      'Proprietà',
  tecnici:        'Tecnici',
  energetici:     'Energetici',
  conformita:     'Conformità',
  amministrativi: 'Amministrativi',
}

// --- upload client-direct: un task indipendente per file selezionato ---
type TaskStatus = 'in_coda' | 'in_caricamento' | 'fatto' | 'errore'

type FileTask = {
  id: string
  file: File
  status: TaskStatus
  error?: string
}

function makeTaskId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
}

type UploadContext = {
  residenceId: string
  unitId: string | null
  category: DocumentCategory
  fileDate: string | null
}

// Esito di un singolo file: lo status pilota l'icona di TaskRow, documentId
// (solo su 'fatto') e' quanto serve all'auto-classificazione per sapere
// ESATTAMENTE quali righe classificare, senza indovinarle da un refresh.
type FileTaskResult = { status: TaskStatus; documentId?: string }

// Genera URL → carica direttamente su Supabase (bypassa il bodySizeLimit
// di Next.js) → conferma. Ogni file è indipendente: il fallimento di uno
// non blocca né tocca lo stato degli altri, ciascuno aggiorna solo la
// propria riga in `tasks` via updateTask.
async function runFileTask(
  task: FileTask,
  ctx: UploadContext,
  updateTask: (id: string, patch: Partial<FileTask>) => void
): Promise<FileTaskResult> {
  const { file } = task
  updateTask(task.id, { status: 'in_caricamento' })

  if (!ALLOWED_DOCUMENT_MIME.has(file.type)) {
    updateTask(task.id, { status: 'errore', error: 'Tipo file non supportato (PDF, immagini, Word)' })
    return { status: 'errore' }
  }
  if (file.size > MAX_DOCUMENT_SIZE) {
    updateTask(task.id, { status: 'errore', error: 'File troppo grande (max 50 MB)' })
    return { status: 'errore' }
  }

  const urlResult = await createUploadUrl(ctx.residenceId, ctx.category, file.name, file.type)
  if ('error' in urlResult) {
    updateTask(task.id, { status: 'errore', error: urlResult.error })
    return { status: 'errore' }
  }

  const browserSupabase = createClient()
  const { error: uploadError } = await browserSupabase.storage
    .from('documents')
    .uploadToSignedUrl(urlResult.path, urlResult.token, file)

  if (uploadError) {
    updateTask(task.id, { status: 'errore', error: `Errore upload: ${uploadError.message}` })
    return { status: 'errore' }
  }

  const title = file.name.replace(/\.[^/.]+$/, '') || file.name
  const confirmResult = await confirmDocument({
    residenceId: ctx.residenceId,
    unitId: ctx.unitId,
    category: ctx.category,
    title,
    storagePath: urlResult.path,
    fileName: file.name,
    fileDate: ctx.fileDate,
  })

  if ('error' in confirmResult) {
    updateTask(task.id, { status: 'errore', error: confirmResult.error })
    return { status: 'errore' }
  }

  updateTask(task.id, { status: 'fatto' })
  return { status: 'fatto', documentId: confirmResult.id }
}

interface Props {
  residenceId: string
  docs: DocRow[]
  units: UnitRow[]
  checklist: ChecklistResult
  // 'YYYY-MM-DD' calcolato sul server (todayISO): il blocco Scadenze decide
  // "scaduta" confrontando date, e una data letta nel client durante il
  // render darebbe testo diverso tra server e browser a cavallo della
  // mezzanotte — mismatch di hydration. Arriva come prop, una volta.
  today: string
  // id profilo → full_name (028), solo i marcatori realmente presenti tra
  // le eccezioni di questa residenza. null = profilo senza full_name.
  markedByNames: Record<string, string | null>
  // Eccezioni checklist (segna/annulla non applicabile) riservate al
  // costruttore: obbligatoria, senza default, così un chiamante che
  // dimentica di passarla fallisce in build invece di togliere in silenzio
  // i controlli al super_admin. Upload e conferma classificazione non
  // dipendono da questa prop: l'admin li ha entrambi.
  canManageChecklist: boolean
  // Proposta del fornitore dalle DiCo, riservata al costruttore. Stessa
  // regola di canManageChecklist: obbligatorie e senza default, così un
  // chiamante che le dimentica fallisce in build invece di spegnere la
  // funzione in silenzio.
  //
  // false ⇒ le due liste arrivano vuote per costruzione (page.tsx non esegue
  // nemmeno le query): una lista vuota NON va letta come "nessun fornitore in
  // anagrafica", e ogni consumo deve passare prima da questo booleano.
  //
  // Sono gli input di buildSupplierProposal — anagrafica builder-wide e
  // collegamenti già presenti su questa residenza — e arrivano al pannello di
  // revisione solo dentro supplierContext, che è null quando il booleano è
  // false. residenceName serve alla frase che dichiara il collegamento.
  canLinkSuppliers: boolean
  suppliers: SupplierProposalCandidate[]
  supplierInstallations: SupplierInstallationRef[]
  residenceName: string
}

// Contesto della proposta fornitore dalle DiCo. Esiste solo per il
// costruttore: null per l'admin, e allora la sezione non si rende. Il
// booleano e le liste viaggiano fusi in un solo valore apposta: nessun
// componente a valle può leggere le liste senza essere passato dal gate, né
// scambiare la lista vuota dell'admin per un'anagrafica vuota.
type SupplierContext = {
  residenceName: string
  suppliers: SupplierProposalCandidate[]
  installations: SupplierInstallationRef[]
}

export function DocumentiClient({
  residenceId, docs, units, checklist, today, markedByNames, canManageChecklist,
  canLinkSuppliers, suppliers, supplierInstallations, residenceName,
}: Props) {
  const supplierContext: SupplierContext | null = canLinkSuppliers
    ? { residenceName, suppliers, installations: supplierInstallations }
    : null

  // --- filter state ---
  const [search, setSearch]       = useState('')

  // --- upload modal state ---
  const [showModal, setShowModal] = useState(false)
  const [scope, setScope]         = useState<'residenza' | 'unita'>('residenza')
  const [tasks, setTasks]         = useState<FileTask[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const router = useRouter()

  // --- classificazione AI (batch sequenziale) ---
  const [classifying, setClassifying] = useState(false)
  const [classifyProgress, setClassifyProgress] = useState<{ done: number; total: number } | null>(null)
  const [classifyFailures, setClassifyFailures] = useState<number | null>(null)
  // Servizio (chiave assente/vuota, 5xx, rate limit) vs documento: un banner
  // di pagina sostituisce i badge per-documento solo per questa causa — i
  // documenti restano in stato neutro riprovabile (route.ts rollback a
  // 'non_classificato', mai 'fallita' per una causa che non è loro).
  const [serviceUnavailable, setServiceUnavailable] = useState(false)
  // --- estrazione dati (batch sequenziale, seconda chiamata AI) ---
  // Stato separato da quello della classificazione: i due batch possono
  // girare uno dopo l'altro (la classificazione concatena l'estrazione) e
  // ciascuno ha il proprio bottone, progresso, esito e banner di servizio.
  const [extracting, setExtracting] = useState(false)
  const [extractProgress, setExtractProgress] = useState<{ done: number; total: number } | null>(null)
  const [extractFailures, setExtractFailures] = useState<number | null>(null)
  const [extractServiceUnavailable, setExtractServiceUnavailable] = useState(false)
  const [reviewOnly, setReviewOnly] = useState(false)
  const [docTypeFilter, setDocTypeFilter] = useState<DocType | 'all'>('all')
  // Filtri sui dati estratti (estrazione corrente soltanto): ambito e
  // "con scadenza" (data calcolata o formula dichiarata).
  const [ambitoFilter, setAmbitoFilter] = useState<Ambito | 'all'>('all')
  const [withValidityOnly, setWithValidityOnly] = useState(false)
  // 'fallita' inclusa: dopo il rollback a 'non_classificato' per gli errori di
  // servizio (route.ts), 'fallita' significa solo "questo documento non è
  // classificabile" — un errore di contenuto/formato, non di sistema — e va
  // quindi riproposto dal bottone come qualunque altro documento in coda.
  const pendingClassification = docs.filter(d =>
    d.classification_status === 'non_classificato' || d.classification_status === 'fallita'
  )
  const reviewCount = docs.filter(d => d.classification_status === 'da_revisionare').length
  // Da estrarre: regola unica in document-extraction.ts (classificazione
  // finale, tipo estraibile, nessuna estrazione corrente). Stessa lista per
  // il contatore del bottone e per il batch — mai due calcoli (bug class).
  const pendingExtraction = docs.filter(d => needsExtraction(d, d.extraction))
  // Solo i doc_type davvero presenti tra i documenti, ordinati alfabeticamente
  // per etichetta: in una tendina si cerca per nome, non per l'ordine tecnico
  // della costante. Include sempre il tipo attualmente selezionato anche se
  // zero documenti (lista vuota è un esito legittimo, non un select fuori
  // dalle sue option). Il link "Vedi documenti di questo tipo" dalla
  // checklist, che era il caso d'uso originario, è stato rimosso col blocco
  // Da caricare (18/09); la garanzia resta perché costa niente.
  const presentDocTypes = DOC_TYPES
    .filter(t => t === docTypeFilter || docs.some(d => d.doc_type === t))
    .sort((a, b) => DOC_TYPE_LABELS[a].localeCompare(DOC_TYPE_LABELS[b], 'it'))

  // Ambiti davvero presenti tra le estrazioni correnti (stessa logica della
  // tendina dei tipi: si filtra su ciò che c'è) e conteggio dei documenti
  // con una validità (data o formula) per il toggle "Con scadenza".
  const presentAmbiti = AMBITI.filter(a => a === ambitoFilter || docs.some(d => currentExtraction(d)?.ambito === a))
  const validityCount = docs.filter(hasValidity).length

  // --- computed ---
  // In dashboard il filtro categoria è rimosso (asse ridondante rispetto a
  // doc_type). category resta su upload, badge card e vista PWA residente.
  // Tipo documento, coda revisione, ambito, scadenza e ricerca restano
  // combinabili in AND.
  const isFiltered = search.trim() !== '' || reviewOnly || docTypeFilter !== 'all'
    || ambitoFilter !== 'all' || withValidityOnly

  const filtered = useMemo(() => {
    let result = docs
    if (docTypeFilter !== 'all') result = result.filter(d => d.doc_type === docTypeFilter)
    if (reviewOnly) result = result.filter(d => d.classification_status === 'da_revisionare')
    if (ambitoFilter !== 'all') result = result.filter(d => currentExtraction(d)?.ambito === ambitoFilter)
    if (withValidityOnly) result = result.filter(hasValidity)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(d => searchText(d).includes(q))
    }
    return result
  }, [docs, docTypeFilter, reviewOnly, ambitoFilter, withValidityOnly, search])

  const residenceDocs = filtered.filter(d => d.unit_id === null)

  const unitMap = new Map<string, UnitRow>()
  for (const u of units) unitMap.set(u.id, u)

  const byUnit = new Map<string, DocRow[]>()
  for (const doc of filtered) {
    if (doc.unit_id !== null) {
      const list = byUnit.get(doc.unit_id) ?? []
      list.push(doc)
      byUnit.set(doc.unit_id, list)
    }
  }

  const isEmpty = residenceDocs.length === 0 && byUnit.size === 0

  // --- handlers ---
  function closeModal() {
    if (isUploading) return
    setShowModal(false)
    setTasks([])
    setSubmitted(false)
    setScope('residenza')
  }

  function updateTask(id: string, patch: Partial<FileTask>) {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)))
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setTasks(files.map(file => ({ id: makeTaskId(), file, status: 'in_coda' as const })))
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (tasks.length === 0) return

    const formData = new FormData(e.currentTarget)
    const unitId   = (formData.get('unitId') as string) || null
    const category = formData.get('category') as DocumentCategory
    const fileDate = (formData.get('fileDate') as string) || null
    const ctx: UploadContext = { residenceId, unitId, category, fileDate }

    setSubmitted(true)
    setIsUploading(true)

    const uploadedTasks = tasks
    const results = await Promise.all(uploadedTasks.map(task => runFileTask(task, ctx, updateTask)))

    setIsUploading(false)

    // Auto-classificazione (B4): parte da sola sui documenti appena caricati,
    // per id esatto (mai indovinati da un refresh dei props). Nessun click.
    // Continua in sottofondo anche se la modale viene chiusa — lo stato vive
    // in questo componente, non nella modale.
    const justUploaded = uploadedTasks
      .map((task, i) => ({ file: task.file, result: results[i] }))
      .filter((x): x is { file: File; result: { status: 'fatto'; documentId: string } } =>
        x.result.status === 'fatto' && !!x.result.documentId
      )
      .map(x => ({ id: x.result.documentId, title: x.file.name }))

    if (justUploaded.length > 0) {
      void classifyDocuments(justUploaded)
    }
  }

  // Sequenziale di proposito (mai Promise.all): un documento per invocazione,
  // un fallimento non ferma gli altri, progress visibile durante il batch.
  // Stato condiviso (classifying/classifyProgress) fra il bottone manuale
  // "Classifica documenti" e l'auto-classificazione post-upload: le due non
  // possono mai correre in parallelo (guardia `classifying` sotto), e il
  // bottone manuale si disabilita/mostra progresso anche quando è
  // l'auto-classificazione a girare.
  async function classifyDocuments(targets: { id: string; title: string }[]) {
    if (targets.length === 0 || classifying) return
    setClassifying(true)
    setClassifyProgress({ done: 0, total: targets.length })
    setClassifyFailures(null)
    setServiceUnavailable(false)

    let failures = 0
    // Documenti usciti dalla classificazione con tipo finale ed estraibile:
    // l'estrazione parte da sola su questi, per id esatto (mai indovinati
    // da un refresh dei props), a batch concluso.
    const toExtract: { id: string; title: string }[] = []
    for (const [i, doc] of targets.entries()) {
      try {
        const res = await fetch('/api/classify-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: doc.id }),
        })
        const result = await res.json().catch(() => null)
        if (res.ok) {
          console.log(`[classifica] ${doc.title}:`, result)
          if (result?.status === 'completata' && isExtractableDocType(typeof result.doc_type === 'string' ? result.doc_type : null)) {
            toExtract.push(doc)
          }
        } else if (result?.cause === 'service_unavailable') {
          // Il servizio è giù: proseguire il batch chiamerebbe di nuovo un
          // servizio già noto non disponibile, un errore per documento alla
          // volta invece di un solo banner. Si ferma qui, non si conta come
          // fallimento per-documento.
          console.error(`[classifica] servizio non disponibile, batch interrotto a "${doc.title}":`, result?.error ?? res.statusText)
          setServiceUnavailable(true)
          break
        } else {
          failures++
          console.error(`[classifica] ${doc.title} fallita:`, result?.error ?? res.statusText)
        }
      } catch (err) {
        failures++
        console.error(`[classifica] ${doc.title} fallita:`, err)
      }
      setClassifyProgress({ done: i + 1, total: targets.length })
    }

    setClassifying(false)
    setClassifyProgress(null)
    setClassifyFailures(failures > 0 ? failures : null)
    router.refresh()

    if (toExtract.length > 0) {
      void extractDocuments(toExtract)
    }
  }

  // Bottone manuale: rete di sicurezza per i file che l'auto-classificazione
  // non ha processato. Stessa identica lista (pendingClassification) usata
  // per il contatore nel bottone — mai due calcoli paralleli (bug class).
  function handleClassify() {
    void classifyDocuments(pendingClassification.map(d => ({ id: d.id, title: d.title })))
  }

  // Estrazione dati: stesso disegno del batch di classificazione
  // (sequenziale, un documento per invocazione, stop al primo errore di
  // servizio, esito sobrio a fine batch). Chiamata dal bottone "Estrai
  // dati", in coda alla classificazione, e dopo una conferma umana del
  // tipo. La guardia `extracting` fa cadere una richiesta arrivata durante
  // un batch: il documento resta in pendingExtraction e il bottone lo
  // riprende — mai due batch in parallelo.
  async function extractDocuments(targets: { id: string; title: string }[]) {
    if (targets.length === 0 || extracting) return
    setExtracting(true)
    setExtractProgress({ done: 0, total: targets.length })
    setExtractFailures(null)
    setExtractServiceUnavailable(false)

    let failures = 0
    for (const [i, doc] of targets.entries()) {
      try {
        const res = await fetch('/api/extract-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: doc.id }),
        })
        const result = await res.json().catch(() => null)
        if (res.ok) {
          console.log(`[estrai] ${doc.title}:`, result)
        } else if (result?.cause === 'service_unavailable') {
          console.error(`[estrai] servizio non disponibile, batch interrotto a "${doc.title}":`, result?.error ?? res.statusText)
          setExtractServiceUnavailable(true)
          break
        } else if (result?.cause === 'not_extractable') {
          // Il documento è cambiato sotto (riclassificato in 'altro' o
          // tornato in revisione nel frattempo): non è un fallimento, e
          // al refresh non sarà più in pendingExtraction.
          console.warn(`[estrai] ${doc.title} non estraibile:`, result?.error)
        } else {
          failures++
          console.error(`[estrai] ${doc.title} senza dati:`, result?.error ?? res.statusText)
        }
      } catch (err) {
        failures++
        console.error(`[estrai] ${doc.title} senza dati:`, err)
      }
      setExtractProgress({ done: i + 1, total: targets.length })
    }

    setExtracting(false)
    setExtractProgress(null)
    setExtractFailures(failures > 0 ? failures : null)
    router.refresh()
  }

  function handleExtract() {
    void extractDocuments(pendingExtraction.map(d => ({ id: d.id, title: d.title })))
  }

  // Dopo la conferma umana del tipo (ReviewPanel): se il tipo confermato è
  // estraibile, l'estrazione parte subito per quel documento. La riga
  // precedente, se c'era, non è più corrente (for_doc_type diverso) e
  // viene sovrascritta dalla route.
  function handleClassificationConfirmed(doc: { id: string; title: string }, docType: DocType) {
    if (isExtractableDocType(docType)) void extractDocuments([doc])
  }

  return (
    <div className="space-y-6">

      {/* -------- Banner servizio classificazione -------- */}
      {/* Pagina intera, non per-documento: quando la causa è il servizio
          (chiave assente/vuota, 5xx, rate limit — route.ts) i documenti
          restano neutri e riprovabili, un solo banner sostituisce i badge
          rossi/di errore per ciascuno. */}
      {serviceUnavailable && (
        <div className="bg-neutral-600/7 border border-neutral-600/20 rounded-xl px-4 py-3 text-sm text-neutral-600">
          Classificazione automatica non disponibile al momento. Riprova più tardi con Classifica documenti.
        </div>
      )}
      {extractServiceUnavailable && (
        <div className="bg-neutral-600/7 border border-neutral-600/20 rounded-xl px-4 py-3 text-sm text-neutral-600">
          Estrazione dei dati non disponibile al momento. Riprova più tardi con Estrai dati.
        </div>
      )}

      {/* -------- Modale upload -------- */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-border p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-lg space-y-4">

            {/* Header modale */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-text-primary">Carica documenti</p>
              <button
                onClick={closeModal}
                disabled={isUploading}
                className="p-1 text-text-secondary rounded-lg hover:bg-background disabled:opacity-50"
              >
                <X className="w-4 h-4" strokeWidth={1.6} />
              </button>
            </div>

            {/* ---- Stato task per-file ---- */}
            {submitted ? (
              <div className="space-y-3">
                {/* Riga di avanzamento: caricamento poi, senza soluzione di
                    continuità, classificazione — stesso `classifying`/
                    classifyProgress` letto dal bottone manuale in testata. */}
                {(isUploading || (classifying && classifyProgress)) && (
                  <p className="text-xs text-text-secondary">
                    {isUploading
                      ? `Caricamento: ${tasks.filter(t => t.status === 'fatto' || t.status === 'errore').length} di ${tasks.length}`
                      : `Classificazione: ${classifyProgress!.done} di ${classifyProgress!.total}`}
                  </p>
                )}
                <div className="space-y-1.5">
                  {tasks.map(task => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  {!isUploading && tasks.some(t => t.status === 'errore') && (
                    <button
                      onClick={() => { setSubmitted(false); setTasks([]) }}
                      className="flex-1 border border-border rounded-xl py-2.5 text-sm text-text-secondary"
                    >
                      Riprova
                    </button>
                  )}
                  <button
                    onClick={closeModal}
                    disabled={isUploading}
                    className="flex-1 bg-brand-dark text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
                  >
                    {isUploading ? 'Caricamento…' : 'Chiudi'}
                  </button>
                </div>
              </div>

            ) : (
            /* ---- Form upload ---- */
              <form onSubmit={handleUpload} className="space-y-4">
                {/* Destinazione */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary block">Destinazione *</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setScope('residenza')}
                      className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
                        scope === 'residenza'
                          ? 'bg-brand-dark text-white border-transparent'
                          : 'border-border text-text-secondary hover:bg-background'
                      }`}
                    >
                      Residenza
                    </button>
                    {units.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setScope('unita')}
                        className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
                          scope === 'unita'
                            ? 'bg-brand-dark text-white border-transparent'
                            : 'border-border text-text-secondary hover:bg-background'
                        }`}
                      >
                        Unità
                      </button>
                    )}
                  </div>
                </div>

                {/* Dropdown unità */}
                {scope === 'unita' && (
                  <select
                    name="unitId"
                    required
                    defaultValue=""
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                  >
                    <option value="" disabled>Seleziona unità…</option>
                    {units.map(u => (
                      <option key={u.id} value={u.id}>{u.label}</option>
                    ))}
                  </select>
                )}

                {/* Categoria */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary block">Categoria *</label>
                  <select
                    name="category"
                    required
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {/* Data documento */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary block">
                    Data documento <span className="font-normal">(opzionale)</span>
                  </label>
                  <DateField name="fileDate" />
                </div>

                {/* File */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary block">File *</label>
                  <input
                    type="file"
                    multiple
                    required
                    onChange={handleFilesSelected}
                    accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx"
                    className="w-full text-sm text-text-secondary cursor-pointer file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-light file:text-brand-dark"
                  />
                  <p className="text-xs text-text-secondary">
                    {tasks.length > 0
                      ? `${tasks.length} file selezionat${tasks.length !== 1 ? 'i' : 'o'}`
                      : 'PDF, immagini, Word · max 50 MB per file'}
                  </p>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 border border-border rounded-xl py-2.5 text-sm text-text-secondary"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    disabled={tasks.length === 0}
                    className="flex-1 bg-brand-dark text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
                  >
                    Carica
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* -------- Pulsante upload -------- */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-brand-dark text-white rounded-xl px-4 py-2.5 text-sm font-medium active:scale-[0.98] transition-transform"
        >
          <Upload className="w-4 h-4" strokeWidth={1.8} />
          Carica documenti
        </button>

        {pendingClassification.length > 0 && (
          <button
            onClick={handleClassify}
            disabled={classifying}
            className="flex items-center gap-2 border border-border text-text-secondary rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {classifying ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.8} />
            ) : (
              <Sparkles className="w-4 h-4" strokeWidth={1.8} />
            )}
            {classifying && classifyProgress
              ? `Classificazione: ${classifyProgress.done} di ${classifyProgress.total}`
              : `Classifica documenti (${pendingClassification.length})`}
          </button>
        )}

        {/* Rete di sicurezza per i documenti che l'estrazione automatica
            (in coda alla classificazione / alla conferma umana) non ha
            coperto: stessa lista (pendingExtraction) del batch. */}
        {pendingExtraction.length > 0 && (
          <button
            onClick={handleExtract}
            disabled={extracting}
            className="flex items-center gap-2 border border-border text-text-secondary rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {extracting ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.8} />
            ) : (
              <FileSearch className="w-4 h-4" strokeWidth={1.8} />
            )}
            {extracting && extractProgress
              ? `Estrazione: ${extractProgress.done} di ${extractProgress.total}`
              : `Estrai dati (${pendingExtraction.length})`}
          </button>
        )}
      </div>

      {/* Esito sobrio a fine batch: sopravvive alla chiusura della modale
          (l'auto-classificazione continua in sottofondo). "Classifica
          documenti" sopra è la rete di sicurezza a cui rimanda. */}
      {!classifying && classifyFailures !== null && classifyFailures > 0 && (
        <p className="text-xs text-status-inprogress">
          {pluralize(classifyFailures, 'documento non classificato', 'documenti non classificati')}
          {' '}— riprova con Classifica documenti.
        </p>
      )}
      {!extracting && extractFailures !== null && extractFailures > 0 && (
        <p className="text-xs text-status-inprogress">
          {pluralize(extractFailures, 'documento senza dati estratti', 'documenti senza dati estratti')}
          {' '}— riprova con Estrai dati.
        </p>
      )}

      {/* -------- Da caricare + Escluse dalla consegna -------- */}
      <MissingDocumentsSection
        residenceId={residenceId}
        checklist={checklist}
        unclassifiedCount={pendingClassification.length}
        markedByNames={markedByNames}
        canManageChecklist={canManageChecklist}
      />

      {/* -------- Scadenze -------- */}
      <DeadlinesSection docs={docs} today={today} />

      {/* -------- Ricerca + filtri (tipo a tendina · coda revisione) -------- */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca per nome, installatore, compagnia, unità…"
          className="flex-1 min-w-[10rem] border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
        />

        {/* Coda revisione: azione di workflow, controllo separato sempre visibile
            (non è un tipo, non entra nella tendina). */}
        {reviewCount > 0 && (
          <button
            onClick={() => setReviewOnly(v => !v)}
            aria-pressed={reviewOnly}
            className={`flex-shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium ${
              reviewOnly
                ? 'bg-status-inprogress/10 text-status-inprogress border-status-inprogress/30'
                : 'bg-surface text-text-secondary border-border hover:bg-background'
            }`}
          >
            Da rivedere ({reviewCount})
          </button>
        )}

        {/* Filtro tipo documento: tendina nativa (coerente coi select del modale).
            Il bottone si autodescrive con la selezione corrente; stato attivo
            evidenziato quando la lista è filtrata. */}
        {presentDocTypes.length > 0 && (
          <div className="relative flex-shrink-0">
            <select
              value={docTypeFilter}
              onChange={e => setDocTypeFilter(e.target.value as DocType | 'all')}
              aria-label="Filtra per tipo documento"
              className={`appearance-none w-[200px] truncate rounded-xl border pl-3 pr-9 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-medium transition-colors ${
                docTypeFilter !== 'all'
                  ? 'border-brand-medium bg-brand-light/40 text-brand-dark font-medium'
                  : 'border-border text-text-secondary'
              }`}
            >
              <option value="all">Tutti i tipi</option>
              {presentDocTypes.map(t => (
                <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
              ))}
            </select>
            <ChevronDown
              className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary"
              strokeWidth={1.8}
            />
          </div>
        )}

        {/* Ambito dall'estrazione: tendina solo se almeno un documento ha
            un ambito estratto, altrimenti sarebbe un filtro senza effetto. */}
        {presentAmbiti.length > 0 && (
          <div className="relative flex-shrink-0">
            <select
              value={ambitoFilter}
              onChange={e => setAmbitoFilter(e.target.value as Ambito | 'all')}
              aria-label="Filtra per ambito"
              className={`appearance-none w-[160px] truncate rounded-xl border pl-3 pr-9 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-medium transition-colors ${
                ambitoFilter !== 'all'
                  ? 'border-brand-medium bg-brand-light/40 text-brand-dark font-medium'
                  : 'border-border text-text-secondary'
              }`}
            >
              <option value="all">Tutti gli ambiti</option>
              {presentAmbiti.map(a => (
                <option key={a} value={a}>{AMBITO_LABELS[a]}</option>
              ))}
            </select>
            <ChevronDown
              className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary"
              strokeWidth={1.8}
            />
          </div>
        )}

        {validityCount > 0 && (
          <button
            onClick={() => setWithValidityOnly(v => !v)}
            aria-pressed={withValidityOnly}
            className={`flex-shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium ${
              withValidityOnly
                ? 'border-brand-medium bg-brand-light/40 text-brand-dark'
                : 'bg-surface text-text-secondary border-border hover:bg-background'
            }`}
          >
            Con scadenza ({validityCount})
          </button>
        )}

        {isFiltered && (
          <button
            onClick={() => { setSearch(''); setReviewOnly(false); setDocTypeFilter('all'); setAmbitoFilter('all'); setWithValidityOnly(false) }}
            aria-label="Azzera filtri"
            className="flex-shrink-0 border border-border rounded-xl px-3 py-2 text-sm text-text-secondary bg-surface hover:bg-background transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium"
          >
            ✕
          </button>
        )}
      </div>

      {/* -------- Contatore -------- */}
      {!isEmpty && (
        <p className="text-xs text-text-secondary">
          {pluralize(filtered.length, 'documento', 'documenti')}
        </p>
      )}

      {/* -------- Lista -------- */}
      {isEmpty ? (
        <div className="bg-surface rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-text-secondary">
            {isFiltered
              ? 'Nessun documento trovato.'
              : 'Nessun documento caricato per questa residenza.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Sezione residenza */}
          <section className="space-y-2">
            <h2 className="text-xs font-medium text-text-secondary">Residenza</h2>
            {residenceDocs.length === 0 ? (
              <p className="text-sm text-text-secondary px-1">
                Nessun documento di residenza{isFiltered ? ' per questo filtro' : ''}.
              </p>
            ) : (
              residenceDocs.map(doc => <DocCard key={doc.id} doc={doc} supplierContext={supplierContext} onClassificationConfirmed={handleClassificationConfirmed} />)
            )}
          </section>

          {/* Sezione per unità */}
          {byUnit.size > 0 && (
            <section className="space-y-4">
              <h2 className="text-xs font-medium text-text-secondary">Per unità</h2>
              {[...byUnit.entries()].map(([unitId, unitDocs]) => (
                <div key={unitId} className="space-y-2">
                  <h3 className="text-sm font-medium text-text-primary">
                    {unitMap.get(unitId)?.label ?? 'Unità'}
                  </h3>
                  {unitDocs.map(doc => <DocCard key={doc.id} doc={doc} supplierContext={supplierContext} onClassificationConfirmed={handleClassificationConfirmed} />)}
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  )
}

// I 3 scope contati (CountedScope in document-checklist.ts, non esportato:
// 'unit' non è mai popolato in v1). Label = "ambito" mostrato accanto a ogni
// voce di Da caricare ed Escluse.
type CountedScopeKey = 'condominium' | 'dossier_admin' | 'residence'
const SCOPE_LABELS: Record<CountedScopeKey, string> = {
  condominium: 'Parti comuni',
  dossier_admin: 'Dossier amministratore',
  residence: 'Residenza',
}

function scopeLabel(scope: ChecklistExpectation['scope']): string {
  return SCOPE_LABELS[scope as CountedScopeKey] ?? scope
}

// "Da caricare (N)" + "Escluse dalla consegna (N)" — sostituiscono i tre
// riquadri a fisarmonica con frazioni e pallini (ridisegno 18/09).
// Le liste vengono dallo STESSO array checklist.expectations dell'helper
// (mancante = !satisfied && !notApplicable, esclusa = notApplicable): il
// conteggio nel titolo è la lunghezza della lista mostrata, mai un secondo
// calcolo (bug class contatore/lista). Nessuna frase di verdetto: se non
// manca niente il blocco non compare, senza "tutto in ordine".
// Le voci soddisfatte non hanno più una lista qui: i documenti che le
// coprono sono in archivio, con i loro dati estratti.
function MissingDocumentsSection({
  residenceId,
  checklist,
  unclassifiedCount,
  markedByNames,
  canManageChecklist,
}: {
  residenceId: string
  checklist: ChecklistResult
  unclassifiedCount: number
  markedByNames: Record<string, string | null>
  canManageChecklist: boolean
}) {
  const missing = checklist.expectations.filter(e => !e.satisfied && !e.notApplicable)
  const excluded = checklist.expectations.filter(e => e.notApplicable)
  const [excludedOpen, setExcludedOpen] = useState(false)

  const hasNotes = unclassifiedCount > 0 || checklist.warnings.length > 0
  if (missing.length === 0 && excluded.length === 0 && !hasNotes) return null

  return (
    <div className="space-y-2">
      {missing.length > 0 && (
        <section className="bg-surface rounded-xl border border-border p-4 space-y-1">
          <h2 className="text-sm font-medium text-text-primary">
            Da caricare ({missing.length})
          </h2>
          <div>
            {missing.map(exp => (
              <MissingRow
                key={exp.expectationKey}
                exp={exp}
                residenceId={residenceId}
                canManageChecklist={canManageChecklist}
              />
            ))}
          </div>
        </section>
      )}

      {/* Qualificano la lista sopra (o la sua assenza): un documento non
          ancora classificato può coprire una voce mancante. Contato dallo
          stesso array docs già in prop, nessuna query nuova. */}
      {unclassifiedCount > 0 && (
        <p className="text-xs text-text-secondary bg-background rounded-lg px-3 py-2">
          {pluralize(unclassifiedCount, 'documento non ancora classificato', 'documenti non ancora classificati')}
          {' '}— l&apos;elenco potrebbe cambiare.
        </p>
      )}
      {checklist.warnings.length > 0 && (
        <div className="text-xs text-neutral-600 bg-background rounded-lg px-3 py-2 space-y-0.5">
          {checklist.warnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}

      {/* Riga compressa, subito sotto Da caricare, resa anche quando Da
          caricare non c'è: un'esclusione è una decisione del costruttore
          che deve restare visibile e reversibile (decisione 18/09). */}
      {excluded.length > 0 && (
        <section className="bg-surface rounded-xl border border-border">
          <button
            type="button"
            onClick={() => setExcludedOpen(v => !v)}
            aria-expanded={excludedOpen}
            className="w-full flex items-center gap-2 px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium rounded-xl"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 flex-shrink-0 text-text-secondary transition-transform ${excludedOpen ? 'rotate-180' : ''}`}
              strokeWidth={1.8}
            />
            <span className="text-sm text-text-secondary">
              Escluse dalla consegna ({excluded.length})
            </span>
          </button>
          {excludedOpen && (
            <div className="px-4 pb-3 pl-10">
              {excluded.map(exp => (
                <ExcludedRow
                  key={exp.expectationKey}
                  exp={exp}
                  residenceId={residenceId}
                  markedByNames={markedByNames}
                  canManageChecklist={canManageChecklist}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

// "Scadenze": le prossime sei validità per data, scadute in cima, dalle
// estrazioni CORRENTI (for_doc_type = doc_type). Quando valid_until non è
// calcolabile ma il documento dichiara una durata, al posto della data si
// mostra la formula ("10 anni dalla data di fine lavori"). Date nude,
// nessun colore di allarme, nessun verdetto (decisione 18/09): "Scaduta il"
// è un fatto di calendario reso nello stesso colore del resto. Il blocco
// non compare se non c'è nulla da mostrare. Il lessico scadenza/scaduta è
// vietato sulle voci promemoria e sui badge di classificazione, non sulla
// validità di polizze, garanzie e APE, che è linguaggio di dominio.
function DeadlinesSection({ docs, today }: { docs: DocRow[]; today: string }) {
  const entries = validityEntries(
    docs,
    d => extractionIsCurrent(d, d.extraction) && d.extraction
      ? { docType: d.doc_type, validUntil: d.extraction.valid_until, fields: d.extraction.fields }
      : null,
    today,
  )
  if (entries.length === 0) return null

  return (
    <section className="bg-surface rounded-xl border border-border p-4 space-y-1">
      <h2 className="text-sm font-medium text-text-primary">Scadenze</h2>
      <div>
        {entries.map(entry => (
          <div key={entry.item.id} className="flex items-center gap-3 py-2.5 border-b border-border last:border-b-0">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary truncate">{entry.item.title}</p>
              {entry.item.doc_type && (
                <p className="text-xs text-text-secondary">{DOC_TYPE_LABELS[entry.item.doc_type]}</p>
              )}
            </div>
            <span className="flex-shrink-0 text-xs text-text-secondary text-right">
              {entry.kind === 'date'
                ? (entry.expired ? `Scaduta il ${formatDateIT(entry.validUntil)}` : formatDateIT(entry.validUntil))
                : entry.formula}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

// Voce mancante: nome, ambito (e impianto se la voce è impianto-specifica).
// L'unica azione è "Non applicabile", riservata al costruttore (RLS 027,
// super_admin-only), con motivazione obbligatoria (028): il vincolo vero è
// server-side in setChecklistException, qui solo la disabilitazione di
// comodo. La nota si precompila da exp.note a ogni apertura del form, non
// solo al mount: l'action fa upsert e un form vuoto cancellerebbe una nota
// già presente.
function MissingRow({
  exp,
  residenceId,
  canManageChecklist,
}: {
  exp: ChecklistExpectation
  residenceId: string
  canManageChecklist: boolean
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [note, setNote] = useState(exp.note ?? '')
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const trimmedNote = note.trim()

  function openForm() {
    setNote(exp.note ?? '')
    setActionError(null)
    setShowForm(true)
  }

  async function handleConfirmException() {
    setPending(true)
    setActionError(null)
    const res = await setChecklistException(residenceId, exp.expectationKey, trimmedNote)
    setPending(false)
    if ('error' in res) {
      setActionError(res.error)
      return
    }
    setShowForm(false)
    router.refresh()
  }

  return (
    <div className="border-b border-border last:border-b-0 py-2.5">
      <div className="flex items-center gap-3">
        <span className="flex-1 min-w-0 text-sm text-text-primary truncate">{exp.label}</span>
        <span className="flex-shrink-0 text-xs text-text-secondary">
          {scopeLabel(exp.scope)}
          {exp.sistema && ` · ${SISTEMA_LABELS[exp.sistema]}`}
        </span>
        {canManageChecklist && !showForm && (
          <button
            type="button"
            onClick={openForm}
            className="flex-shrink-0 text-xs text-brand-medium font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium rounded"
          >
            Non applicabile
          </button>
        )}
      </div>

      {showForm && (
        <div className="mt-2 space-y-2 text-xs text-text-secondary">
          <div className="space-y-1">
            <label htmlFor={`note-${exp.expectationKey}`} className="block">
              Motivazione
            </label>
            <textarea
              id={`note-${exp.expectationKey}`}
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>
          <div className="flex gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => { setShowForm(false); setActionError(null) }}
              disabled={pending}
              className="flex-1 border border-border rounded-lg py-1.5 text-text-secondary disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={handleConfirmException}
              disabled={pending || trimmedNote.length === 0}
              className="flex-1 bg-brand-dark text-white rounded-lg py-1.5 font-medium disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium"
            >
              {pending ? 'Salvataggio…' : 'Conferma'}
            </button>
          </div>
          {actionError && <p className="text-status-overdue">{actionError}</p>}
        </div>
      )}
    </div>
  )
}

// Voce esclusa: nome, ambito, motivazione PRIMA dell'attribuzione (chi
// legge vuole sapere perché prima di chi). Fallback "dato non tracciato"
// solo quando marcatore e data sono entrambi assenti (riga pre-028).
// expected_from legacy in sola lettura, mai riscritto. "Annulla esclusione"
// riservata al costruttore; motivazione e attribuzione leggibili anche
// all'admin, perché spiegano un'assenza dalla lista Da caricare.
function ExcludedRow({
  exp,
  residenceId,
  markedByNames,
  canManageChecklist,
}: {
  exp: ChecklistExpectation
  residenceId: string
  markedByNames: Record<string, string | null>
  canManageChecklist: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleClearException() {
    setPending(true)
    setActionError(null)
    const res = await clearChecklistException(residenceId, exp.expectationKey)
    setPending(false)
    if ('error' in res) {
      setActionError(res.error)
      return
    }
    router.refresh()
  }

  const attribution = exp.markedBy === null && exp.markedAt === null
    ? 'Esclusa · dato non tracciato'
    : `Esclusa da ${exp.markedBy ? (markedByNames[exp.markedBy] ?? 'utente sconosciuto') : '—'} · ${
        exp.markedAt ? formatDateIT(exp.markedAt) : '—'
      }`

  return (
    <div className="border-b border-border last:border-b-0 py-2.5 space-y-1">
      <div className="flex items-center gap-3">
        <span className="flex-1 min-w-0 text-sm text-text-primary truncate">{exp.label}</span>
        <span className="flex-shrink-0 text-xs text-text-secondary">
          {scopeLabel(exp.scope)}
          {exp.sistema && ` · ${SISTEMA_LABELS[exp.sistema]}`}
        </span>
      </div>
      <div className="text-xs text-text-secondary space-y-0.5">
        {exp.note && <p className="text-text-primary">{exp.note}</p>}
        {exp.expectedFrom && <p>Atteso da: <span className="text-text-primary">{exp.expectedFrom}</span></p>}
        <p>{attribution}</p>
        {canManageChecklist && (
          <button
            type="button"
            onClick={handleClearException}
            disabled={pending}
            className="text-brand-medium font-medium hover:underline disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium rounded"
          >
            {pending ? 'Attendere…' : 'Annulla esclusione'}
          </button>
        )}
        {actionError && <p className="text-status-overdue">{actionError}</p>}
      </div>
    </div>
  )
}

function TaskRow({ task }: { task: FileTask }) {
  const icon = {
    in_coda:        <Clock className="w-4 h-4 text-text-secondary" strokeWidth={1.6} />,
    in_caricamento: <Loader2 className="w-4 h-4 text-brand-medium animate-spin" strokeWidth={1.6} />,
    fatto:           <CheckCircle2 className="w-4 h-4 text-brand-medium" strokeWidth={1.6} />,
    errore:          <AlertCircle className="w-4 h-4 text-semantic-red" strokeWidth={1.6} />,
  }[task.status]

  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-text-primary truncate">{task.file.name}</p>
        {task.status === 'errore' && task.error && (
          <p className="text-xs text-semantic-red leading-snug">{task.error}</p>
        )}
      </div>
    </div>
  )
}

// Fonte unica per label + colore del badge di stato classificazione, riusata
// da ogni card. 'da_revisionare'/'fallita' non usano mai la parola "fallita"
// né linguaggio di scadenza (stessa filosofia dell'invariante promemoria).
// Colori dalla famiglia di 2ª generazione ammessa ai componenti nuovi
// (status-*/brand/neutral): mai semantic-* (Regola delle Due Generazioni,
// DESIGN.md). 'non_classificato' → nessun badge.
function classificationBadgeInfo(
  doc: DocRow
): { label: string; className: string; spinner?: boolean } | null {
  switch (doc.classification_status) {
    case 'completata': {
      // sistema (impianto) accanto al doc_type quando presente — assi distinti,
      // il sistema qualifica il tipo, non lo sostituisce. Legge SOLO la colonna
      // confermata documents.sistema (regola B4: il display legge le colonne,
      // mai il verbale). Nessun fallback a extracted_metadata: la route la scrive
      // già in auto-conferma, e un fallback farebbe riapparire sulla card una
      // proposta AI che l'umano ha rifiutato scegliendo "Nessun impianto".
      const sistema = doc.sistema
      const base = doc.doc_type ? DOC_TYPE_LABELS[doc.doc_type] : 'Classificato'
      // 'altro' non soddisfa mai una voce di checklist (match per uguaglianza
      // in document-checklist.ts): 'completata' qui significa solo che la
      // revisione è chiusa, non che il documento conta per la consegna.
      // Stesso trattamento neutro di 'Non applicabile' (riga 871), mai il
      // colore di successo.
      if (doc.doc_type === 'altro') {
        return { label: 'Nessuna categoria', className: 'bg-neutral-600/7 text-neutral-600' }
      }
      return {
        label: sistema ? `${base} · ${SISTEMA_LABELS[sistema]}` : base,
        className: 'bg-brand-dark/8 text-brand-dark',
      }
    }
    case 'da_revisionare':
      return { label: 'Da rivedere', className: 'bg-status-inprogress/8 text-status-inprogress' }
    case 'fallita':
      // Non più "Errore, riprova": dopo il rollback a 'non_classificato' per
      // gli errori di servizio (route.ts), 'fallita' significa solo che
      // QUESTO documento non è classificabile nel merito — è già incluso in
      // pendingClassification, quindi "riprova" resta corretto.
      return { label: 'Non classificabile, riprova', className: 'bg-neutral-600/7 text-neutral-600' }
    case 'in_corso':
      return { label: 'Classificazione…', className: 'bg-neutral-600/7 text-neutral-600', spinner: true }
    case 'non_classificato':
      return null
  }
}

function ClassificationBadge({ doc }: { doc: DocRow }) {
  const info = classificationBadgeInfo(doc)
  if (!info) return null
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${info.className}`}>
      {info.spinner && <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />}
      {info.label}
    </span>
  )
}

type ClassificationConfirmedHandler = (doc: { id: string; title: string }, docType: DocType) => void

// Estrazione valida per il documento così com'è ORA: null se mai estratto,
// o se la riga è di un doc_type precedente (riclassificazione umana).
// Unica porta d'accesso ai dati estratti in questa pagina: nessun
// componente legge doc.extraction direttamente senza passare da qui.
function currentExtraction(doc: DocRow): DocumentExtractionRow | null {
  return doc.extraction && extractionIsCurrent(doc, doc.extraction) ? doc.extraction : null
}

// Data mostrata in riga: la data del documento estratta, altrimenti quella
// inserita a mano all'upload, altrimenti la data di caricamento. Un solo
// ordine di fallback, qui, per contatore e riga.
function displayDate(doc: DocRow): string {
  return currentExtraction(doc)?.document_date ?? doc.file_date ?? doc.created_at
}

function hasValidity(doc: DocRow): boolean {
  const ext = currentExtraction(doc)
  if (!ext) return false
  return ext.valid_until !== null || validityFormula(doc.doc_type, ext.fields) !== null
}

// Fatti estratti da mostrare in riga, come brevi voci separate da " · ".
// Solo ciò che esiste: nessuna voce vuota, nessuna etichetta senza valore.
// L'installatore viene dal verbale di classificazione (extracted_metadata,
// solo DiCo), gli altri dalla riga di estrazione corrente.
function extractionFacts(doc: DocRow): string[] {
  const facts: string[] = []
  const installer = doc.doc_type === 'dich_conformita_dm37' ? doc.extracted_metadata?.ragione_sociale_installatore : null
  if (installer) facts.push(`Installatore: ${installer}`)

  const ext = currentExtraction(doc)
  if (!ext) return facts

  if (ext.ambito) {
    facts.push(ext.ambito === 'unita' && ext.unita_riferimento
      ? `${AMBITO_LABELS.unita}: ${ext.unita_riferimento}`
      : AMBITO_LABELS[ext.ambito])
  } else if (ext.unita_riferimento) {
    facts.push(`Unità: ${ext.unita_riferimento}`)
  }

  if (isTypedDocType(doc.doc_type)) {
    switch (doc.doc_type) {
      case 'garanzia': {
        const f = ext.fields as Partial<GaranziaFields>
        if (f.oggetto) facts.push(f.oggetto)
        if (f.rilasciata_da) facts.push(`Rilasciata da ${f.rilasciata_da}`)
        break
      }
      case 'ape': {
        const f = ext.fields as Partial<ApeFields>
        if (f.classe_energetica) facts.push(`Classe ${f.classe_energetica}`)
        break
      }
      case 'polizza_decennale': {
        const f = ext.fields as Partial<PolizzaFields>
        if (f.compagnia) facts.push(f.compagnia)
        if (f.numero_polizza) facts.push(`Polizza n. ${f.numero_polizza}`)
        break
      }
    }
  }

  if (ext.valid_until) {
    facts.push(`Valida fino al ${formatDateIT(ext.valid_until)}`)
  } else {
    const formula = validityFormula(doc.doc_type, ext.fields)
    if (formula) facts.push(`Validità: ${formula}`)
  }
  return facts
}

// Testo di ricerca: titolo, nome file e i fatti estratti, in minuscolo.
// Un solo posto che decide cosa è cercabile.
function searchText(doc: DocRow): string {
  return [doc.title, doc.file_name, ...extractionFacts(doc)].join(' ').toLowerCase()
}

function DocCard({ doc, supplierContext, onClassificationConfirmed }: {
  doc: DocRow
  supplierContext: SupplierContext | null
  onClassificationConfirmed: ClassificationConfirmedHandler
}) {
  const [reviewOpen, setReviewOpen] = useState(false)
  const formattedDate = formatDateIT(displayDate(doc))
  const facts = extractionFacts(doc)
  // 'fallita' è un errore di merito dell'AI sul documento, non un errore di
  // servizio (quello rientra in 'non_classificato', vedi route.ts): l'unica
  // via d'uscita automatica sarebbe ritentare la stessa chiamata, che per
  // definizione ha già fallito. Stesso ragionamento per 'non_classificato'
  // quando manca un verbale utilizzabile. La revisione umana è quindi
  // l'unica uscita reale per questi due stati, non una scorciatoia.
  const canReview = doc.classification_status === 'da_revisionare'
    || doc.classification_status === 'completata'
    || doc.classification_status === 'fallita'
    || doc.classification_status === 'non_classificato'
  return (
    <div className="bg-surface rounded-xl border border-border">
      <div className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 bg-background rounded-lg flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-text-secondary" strokeWidth={1.6} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{doc.title}</p>
          <p className="text-xs text-text-secondary mt-0.5 truncate">{doc.file_name} · {formattedDate}</p>
          {facts.length > 0 && (
            <p className="text-xs text-text-secondary mt-0.5">{facts.join(' · ')}</p>
          )}
          {/* Due assi distinti, mai fusi (legge di dominio 024): categoria a
              sinistra, stato/tipo classificazione a destra. */}
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-light text-brand-dark font-medium">
              {CAT_LABELS[doc.category]}
            </span>
            <ClassificationBadge doc={doc} />
          </div>
        </div>
        <a
          href={`/api/download?bucket=documents&path=${encodeURIComponent(doc.storage_path)}`}
          className="p-2 rounded-lg text-brand-medium flex-shrink-0 hover:bg-brand-light transition-colors"
          title="Scarica documento"
        >
          <Download className="w-5 h-5" strokeWidth={1.6} />
        </a>
      </div>

      {canReview && (
        <div className="border-t border-border px-4 py-2">
          <button
            onClick={() => setReviewOpen(v => !v)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-xs font-medium text-brand-medium hover:bg-background transition-colors"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${reviewOpen ? 'rotate-180' : ''}`}
              strokeWidth={1.8}
            />
            {reviewOpen ? 'Chiudi revisione' : 'Rivedi classificazione'}
          </button>
          {reviewOpen && (
            <ReviewPanel
              doc={doc}
              supplierContext={supplierContext}
              onDone={() => setReviewOpen(false)}
              onConfirmed={docType => onClassificationConfirmed({ id: doc.id, title: doc.title }, docType)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function ReviewPanel({ doc, supplierContext, onDone, onConfirmed }: {
  doc: DocRow
  supplierContext: SupplierContext | null
  onDone: () => void
  // Chiamata SOLO a conferma riuscita, col tipo confermato: chi la riceve
  // decide se far partire l'estrazione (DocumentiClient, unico proprietario
  // dello stato di batch).
  onConfirmed: (docType: DocType) => void
}) {
  const router = useRouter()
  // REGOLA (non riaprire): il blocco "Proposta AI" legge SEMPRE E SOLO
  // extracted_metadata (il verbale di cosa ha detto la macchina, mai la
  // colonna). I select di MODIFICA fanno l'opposto: verità confermata dalla
  // colonna (documents.doc_type / documents.sistema) prima, verbale come
  // fallback solo quando la colonna è null. Precompilare i select dal verbale
  // sovrascriverebbe una correzione umana con la proposta AI al submit (B4 C2).
  const [selected, setSelected] = useState<DocType>(doc.doc_type ?? doc.extracted_metadata?.doc_type ?? 'altro')
  const [sistema, setSistema]   = useState<Sistema | ''>(doc.sistema ?? doc.extracted_metadata?.sistema ?? '')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Confidenza del VERBALE (extracted_metadata), non della colonna: il blocco
  // "Proposta AI" deve restare fedele a cosa ha detto la macchina.
  const verbaleConfidence = doc.extracted_metadata?.confidence
  const confidencePct = verbaleConfidence != null
    ? Math.round(verbaleConfidence * 100)
    : null

  async function handleConfirm() {
    setSaving(true)
    setError(null)
    const res = await confirmClassification({
      documentId: doc.id,
      docType: selected,
      sistema: sistema === '' ? null : sistema,
    })
    setSaving(false)
    if ('error' in res) {
      setError(res.error)
    } else {
      onDone()
      router.refresh()
      onConfirmed(selected)
    }
  }

  return (
    <div className="mt-2 space-y-2">
      {/* Proposta AI (sola lettura): SEMPRE E SOLO extracted_metadata, mai la colonna */}
      <div className="text-xs text-text-secondary space-y-0.5">
        {doc.extracted_metadata?.doc_type ? (
          <p>
            Proposta AI: <span className="text-text-primary font-medium">{DOC_TYPE_LABELS[doc.extracted_metadata.doc_type]}</span>
            {doc.extracted_metadata?.sistema && ` · ${SISTEMA_LABELS[doc.extracted_metadata.sistema]}`}
            {confidencePct != null && ` · ${confidencePct}% di confidenza`}
          </p>
        ) : (
          <p>
            Nessuna proposta automatica
            {doc.extracted_metadata?.skipped_reason ? ` (${doc.extracted_metadata.skipped_reason})` : ''}.
          </p>
        )}
        {doc.extracted_metadata?.motivazione && (
          <p className="italic">{doc.extracted_metadata.motivazione}</p>
        )}
      </div>

      {/* Conferma o correzione: tipo documento */}
      <div className="space-y-1.5">
        <label htmlFor={`doctype-${doc.id}`} className="text-xs font-medium text-text-secondary block">Tipo documento</label>
        <select
          id={`doctype-${doc.id}`}
          value={selected}
          onChange={e => setSelected(e.target.value as DocType)}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
        >
          {DOC_TYPES.map(t => (
            <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {/* Impianto di riferimento (verità confermata → documents.sistema) */}
      <div className="space-y-1.5">
        <label htmlFor={`sistema-${doc.id}`} className="text-xs font-medium text-text-secondary block">Impianto di riferimento</label>
        <select
          id={`sistema-${doc.id}`}
          value={sistema}
          onChange={e => setSistema(e.target.value as Sistema | '')}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
        >
          <option value="">Nessun impianto specifico</option>
          {SISTEMI.map(s => (
            <option key={s} value={s}>{SISTEMA_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-xs text-semantic-red">{error}</p>}

      <button
        onClick={handleConfirm}
        disabled={saving}
        className="w-full bg-brand-dark text-white rounded-xl py-2.5 text-sm font-medium shadow-sm active:scale-[0.98] transition-transform disabled:opacity-50"
      >
        {saving ? 'Salvataggio…' : 'Conferma classificazione'}
      </button>

      {supplierContext && <SupplierProposalSection doc={doc} context={supplierContext} />}
    </div>
  )
}

// Proposta del fornitore dalla dichiarazione di conformità, con il bottone di
// conferma sui soli esiti che scrivono (per P.IVA, simile per nome, nessun
// match). Il bottone NON porta al server cosa scrivere: porta l'esito letto, e
// confirmSupplierProposal ricalcola tutto con la stessa buildSupplierProposal,
// rifiutando se l'esito è cambiato nel frattempo.
//
// Gate: il ruolo sta a monte (supplierContext non null solo per il
// costruttore); doc_type DiCo e ragione sociale non vuota li decide la
// funzione pura (non_applicabile → niente sezione). Il sistema null NON
// nasconde la sezione: la DiCo con un'impresa leggibile c'è, e tacere
// lascerebbe credere che non ci sia nulla da collegare. Si dice invece di
// correggere prima la classificazione.
//
// Legge le COLONNE documents.doc_type / documents.sistema, non i select del
// pannello: la proposta descrive ciò che verrebbe scritto a partire dalla
// classificazione salvata, che è anche ciò che la server action riverificherà.
// Cambiare un select senza confermare non la aggiorna, di proposito.
// Ragione sociale e P.IVA vengono dal verbale (extracted_metadata), che la
// conferma umana non riscrive mai.
function SupplierProposalSection({ doc, context }: { doc: DocRow; context: SupplierContext }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const proposal = buildSupplierProposal({
    docType: doc.doc_type,
    sistema: doc.sistema,
    ragioneSociale: doc.extracted_metadata?.ragione_sociale_installatore ?? null,
    partitaIva: doc.extracted_metadata?.partita_iva_installatore ?? null,
    fornitori: context.suppliers,
    installazioni: context.installations,
  })

  if (proposal.kind === 'non_applicabile') return null

  // L'esito LETTO, spedito solo perché il server possa rifiutare se il suo
  // ricalcolo diverge. null sugli esiti che non si confermano (già collegato,
  // sistema mancante): lì il bottone non esiste.
  const vatNumber = supplierVatNumberToWrite(proposal)
  const expected: SupplierProposalExpectation | null =
    proposal.kind === 'per_piva' || proposal.kind === 'simile_per_nome'
      ? { kind: proposal.kind, sistema: proposal.sistema, supplierId: proposal.supplier.id, vatNumber }
      : proposal.kind === 'nessun_match'
        ? { kind: proposal.kind, sistema: proposal.sistema, supplierId: null, vatNumber }
        : null

  async function handleConfirm(exp: SupplierProposalExpectation) {
    setSaving(true)
    setError(null)
    const res = await confirmSupplierProposal({ documentId: doc.id, expected: exp })
    setSaving(false)
    if ('error' in res) {
      setError(res.error)
    } else {
      // Nessun onDone: il pannello resta aperto e, dopo il refresh, la stessa
      // sezione rende "già collegato" — la conferma visibile di cosa è stato scritto.
      router.refresh()
    }
  }

  return (
    // break-words sul blocco: le frasi citano nome residenza e ragione sociale, e una
    // parola più larga della card va spezzata invece di far scorrere la pagina.
    <div className="mt-3 pt-3 border-t border-border space-y-1 break-words">
      <p className="text-xs font-medium text-text-secondary">Impresa installatrice</p>
      <SupplierProposalBody proposal={proposal} residenceName={context.residenceName} />
      {error && <p className="text-xs text-semantic-red">{error}</p>}
      {expected && (
        <button
          type="button"
          onClick={() => handleConfirm(expected)}
          disabled={saving}
          className="w-full mt-2 border border-brand-medium text-brand-medium rounded-xl py-2.5 text-sm font-medium hover:bg-brand-light transition-colors disabled:opacity-50"
        >
          {saving
            ? 'Salvataggio…'
            : expected.kind === 'nessun_match' ? 'Crea fornitore e collega' : 'Collega fornitore'}
        </button>
      )}
    </div>
  )
}

// Ogni esito dichiara per esteso fornitore, sistema e residenza: chi leggerà
// il bottone di conferma deve aver già letto il collegamento che nascerà, non
// un'etichetta di stato da interpretare.
function SupplierProposalBody({ proposal, residenceName }: {
  proposal: Exclude<SupplierProposal, { kind: 'non_applicabile' }>
  residenceName: string
}) {
  switch (proposal.kind) {
    case 'sistema_mancante':
      return (
        <p className="text-xs text-semantic-amber">
          Sistema non classificato: correggi prima la classificazione. Senza impianto di
          riferimento <span className="font-medium">{proposal.ragioneSociale}</span> non può essere
          collegata come esecutore in <span className="font-medium">{residenceName}</span>.
        </p>
      )

    case 'gia_collegato':
      return (
        <>
          <p className="text-sm text-text-primary">
            <span className="font-medium">{proposal.supplier.name}</span> è già collegato{' '}
            <EsecutoreIn sistema={proposal.sistema} residenceName={residenceName} />.
          </p>
          <p className="text-xs text-text-secondary">Il collegamento esiste già: non verrà scritto nulla.</p>
        </>
      )

    case 'per_piva':
      return (
        <>
          <p className="text-sm text-text-primary">
            Collega <span className="font-medium">{proposal.supplier.name}</span>{' '}
            <EsecutoreIn sistema={proposal.sistema} residenceName={residenceName} />
          </p>
          <p className="text-xs text-text-secondary">
            Trovato in anagrafica per partita IVA {proposal.partitaIva}.
          </p>
        </>
      )

    case 'simile_per_nome':
      return (
        <>
          <p className="text-sm text-text-primary">
            Collega <span className="font-medium">{proposal.supplier.name}</span>{' '}
            <EsecutoreIn sistema={proposal.sistema} residenceName={residenceName} />
          </p>
          <p className="text-xs text-text-secondary">
            {proposal.partitaIva
              ? `Nome simile a «${proposal.ragioneSociale}» indicato nella dichiarazione, ma la partita IVA ${proposal.partitaIva} non è in anagrafica. Verifica che sia la stessa impresa.`
              : `Nome simile a «${proposal.ragioneSociale}» indicato nella dichiarazione, che non riporta una partita IVA leggibile. Verifica che sia la stessa impresa.`}
          </p>
          {supplierVatNumberToWrite(proposal) !== null && (
            <p className="text-xs text-text-secondary">
              Alla conferma la partita IVA {proposal.partitaIva} verrà registrata su {proposal.supplier.name}.
            </p>
          )}
          {/* Mai sovrascrivere: una P.IVA già in anagrafica non coincide per
              forza con quella del documento (altrimenti l'esito sarebbe "per
              P.IVA"), ed è un indizio contro il match per nome. */}
          {proposal.partitaIva !== null && proposal.supplier.vat_number !== null && (
            <p className="text-xs text-semantic-amber">
              {proposal.supplier.name} ha già la partita IVA {proposal.supplier.vat_number}, diversa da quella
              della dichiarazione: non verrà modificata. Verifica che sia la stessa impresa.
            </p>
          )}
          {proposal.altriOmonimi > 0 && (
            <p className="text-xs text-semantic-amber">
              Stesso nome anche per {pluralize(proposal.altriOmonimi, 'altro fornitore', 'altri fornitori')} in
              anagrafica: controlla quale sia l&apos;impresa giusta.
            </p>
          )}
        </>
      )

    case 'nessun_match':
      return (
        <>
          <p className="text-sm text-text-primary">
            Crea il fornitore <span className="font-medium">{proposal.ragioneSociale}</span>
            {proposal.partitaIva && <> (P.IVA {proposal.partitaIva})</>} e collegalo{' '}
            <EsecutoreIn sistema={proposal.sistema} residenceName={residenceName} />
          </p>
          <p className="text-xs text-text-secondary">
            {proposal.partitaIva
              ? 'Nessun fornitore in anagrafica con questa partita IVA o con un nome simile.'
              : 'Nessun fornitore in anagrafica con un nome simile, e la dichiarazione non riporta una partita IVA leggibile.'}
          </p>
        </>
      )
  }
}

function EsecutoreIn({ sistema, residenceName }: { sistema: Sistema; residenceName: string }) {
  return (
    <>
      come esecutore di <span className="font-medium">{SISTEMA_LABELS[sistema]}</span> in{' '}
      <span className="font-medium">{residenceName}</span>
    </>
  )
}
