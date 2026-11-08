'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, Download, Upload, X, Loader2, CheckCircle2, AlertCircle, Clock, Sparkles, ChevronDown, FileSearch } from 'lucide-react'
import type { DocumentCategory } from '@/types/database'
import { createUploadUrl, confirmDocument, confirmSupplierProposal } from './actions'
import type { SupplierProposalExpectation } from './actions'
import { pluralize } from '@/lib/pluralize'
import { useToast } from '@/components/ui/Toast'
import { formatDateIT } from '@/lib/formatDate'
import { humanizeDocumentTitle } from '@/lib/documentTitle'
import { DateField } from '@/components/DateField'
import { DocumentPanel } from './DocumentPanel'
import { PanelShell } from './PanelShell'
import { UnitDocumentMatrix } from './UnitDocumentMatrix'
import { UnitMatrixSummary } from './UnitMatrixSummary'
import { ClassificationBadge } from './ClassificationBadge'
import { DocumentTabs, tabId, tabPanelId, type DocumentTabId } from './DocumentTabs'
import { DocumentsTable } from './DocumentsTable'
import { ReviewList } from './ReviewList'
import { CommonDocumentsList } from './CommonDocumentsList'
import { documentNameText, presentDocTypes } from '@/lib/document-table'
import { reviewGroups } from '@/lib/document-review'
import { commonBadge, commonDocuments, type CommonDocumentRow } from '@/lib/common-documents'
import { otherVersions, unitDocumentRows, type UnitExpectation } from '@/lib/unit-documents'
import { compareUnitLabels } from '@/lib/unit-utils'
import { batchFailureMessage, classifyBatchFailure, describeBatchFailureReasons, type BatchFailureReason } from '@/lib/batch-failures'
import {
  INITIAL_FILE_STATE,
  applyFileEvent,
  fileRejectionReason,
  fileStatusLabel,
  screenSelection,
  summarizeUploadBatch,
  uploadProgress,
  uploadRetryIds,
  type FileEvent,
  type FileState,
} from '@/lib/document-upload-batch'
import {
  DOC_TYPE_LABELS,
  SISTEMA_LABELS,
  buildSupplierProposal,
  expectedMismatchMessage,
  supplierVatNumberToWrite,
  type DocType,
  type ManualInstaller,
  type Sistema,
  type SupplierProposalCandidate,
  type SupplierInstallationRef,
  type SupplierProposal,
} from '@/lib/document-classification'
import type { ChecklistResult } from '@/lib/document-checklist'
import {
  AMBITI,
  AMBITO_LABELS,
  isExtractableDocType,
  needsExtraction,
  validityEntries,
  type Ambito,
} from '@/lib/document-extraction'
import {
  currentExtraction,
  displayDate,
  hasValidity,
  extractionFacts,
  hasCorrections,
  installerMismatchText,
  installerSupplierMismatches,
  reviewState,
  REVIEW_LABEL,
  validitySubject,
  type DocRow,
  type UnitRow,
} from '@/lib/document-rows'
import { resolveProposalInstaller } from '@/lib/document-overrides'
import { createClient } from '@/lib/supabase/client'

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
// Lo stato di ogni file (caricamento → classificazione → estrazione) è un
// FileState di document-upload-batch.ts: si cambia solo con eventi, mai a mano.
type FileTask = {
  id: string
  file: File
  state: FileState
  // Solo dopo il caricamento: lega il file alla sua riga in `documents`, così
  // classificazione ed estrazione aggiornano il file giusto per id.
  documentId?: string
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

// Cosa precarica la modale: la voce attesa (tipo, nome, categoria se nota) e
// l'unità, o null per una voce di Parti comuni. UnitExpectation vi rientra.
type UploadPreset = {
  unitId: string | null
  expectation: { docType: DocType; label: string; category: DocumentCategory | null }
}

// Esito di un singolo file: lo stato finale del caricamento e, se è arrivato in
// archivio, l'id della riga: è quanto serve all'auto-classificazione per sapere
// ESATTAMENTE quali righe classificare, senza indovinarle da un refresh.
type FileTaskResult = { state: FileState; documentId?: string }

type EmitFileEvent = (taskId: string, event: FileEvent, documentId?: string) => void

const SERVICE_DOWN_TEXT = 'Servizio non disponibile al momento'

// Solo i trascinamenti di file: testo e link trascinati non si toccano.
const dragHasFiles = (e: { dataTransfer: DataTransfer | null }) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

// Genera URL → carica direttamente su Supabase (bypassa il bodySizeLimit
// di Next.js) → conferma. Ogni file è indipendente: il fallimento di uno
// non blocca né tocca lo stato degli altri, ciascuno emette eventi solo per
// la propria riga in `tasks`. Parte sempre da INITIAL_FILE_STATE: chi riprova
// azzera prima lo stato del file.
async function runFileTask(
  task: FileTask,
  ctx: UploadContext,
  emit: EmitFileEvent
): Promise<FileTaskResult> {
  const { file } = task
  let state = INITIAL_FILE_STATE
  const step = (event: FileEvent, documentId?: string) => {
    state = applyFileEvent(state, event)
    emit(task.id, event, documentId)
  }
  const fail = (error: string): FileTaskResult => {
    step({ type: 'upload_fail', error })
    return { state }
  }

  step({ type: 'upload_start' })

  const rejection = fileRejectionReason(file)
  if (rejection) return fail(rejection)

  // Un'eccezione (rete caduta in una server action o nell'upload) deve
  // diventare un file fallito: se risalisse, il Promise.all del chiamante
  // rifiuterebbe per tutti e la modale resterebbe bloccata su "Caricamento…".
  try {
    const urlResult = await createUploadUrl(ctx.residenceId, ctx.category, file.name, file.type)
    if ('error' in urlResult) return fail(urlResult.error)

    const browserSupabase = createClient()
    const { error: uploadError } = await browserSupabase.storage
      .from('documents')
      .uploadToSignedUrl(urlResult.path, urlResult.token, file)
    if (uploadError) return fail(`Errore upload: ${uploadError.message}`)

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
    if ('error' in confirmResult) return fail(confirmResult.error)

    step({ type: 'upload_ok' }, confirmResult.id)
    return { state, documentId: confirmResult.id }
  } catch (err) {
    console.error(`[upload] ${file.name} fallito:`, err)
    return fail('Errore tecnico, riprova.')
  }
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
  // id profilo → full_name di chi ha corretto a mano i dati estratti (048),
  // solo gli autori delle correzioni in vigore. Stesso schema di markedByNames.
  correctedByNames: Record<string, string | null>
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
  // true ⇒ la lettura dell'anagrafica è fallita per un guasto tecnico (non è un
  // "vuoto"): canLinkSuppliers è già false e la proposta non si rende, qui serve
  // solo a dirlo all'utente con un Riprova. Obbligatoria, come le due sopra.
  supplierDataUnavailable: boolean
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
  residenceId, docs, units, checklist, today, markedByNames, correctedByNames, canManageChecklist,
  canLinkSuppliers, supplierDataUnavailable, suppliers, supplierInstallations, residenceName,
}: Props) {
  const supplierContext: SupplierContext | null = canLinkSuppliers
    ? { residenceName, suppliers, installations: supplierInstallations }
    : null

  // --- filter state ---
  const [search, setSearch]       = useState('')

  // --- upload modal state ---
  const [showModal, setShowModal] = useState(false)
  const [scope, setScope]         = useState<'residenza' | 'unita'>('residenza')
  // Caricamento aperto da una cella vuota del quadro (unità e voce già scelte) o da
  // una riga mancante di Parti comuni (unitId null: documento della residenza).
  // category null = tipo senza categoria mappata: nella modale NON si precarica.
  const [uploadPreset, setUploadPreset] = useState<UploadPreset | null>(null)
  const [tasks, setTasks]         = useState<FileTask[]>([])
  // Cosa dire dopo una selezione: oltre il tetto (nessun file entra) o file
  // esclusi per tipo/dimensione. Resta visibile fino alla selezione successiva.
  const [selectionNotice, setSelectionNotice] = useState<{ text: string; overLimit: boolean } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const [submitted, setSubmitted] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  // Valori del form dell'ultimo invio: "Riprova" li riusa tali e quali, senza
  // rileggere il form (che dopo l'invio non c'è più).
  const lastRun = useRef<{ ctx: UploadContext; expectedDocType: DocType | null } | null>(null)
  const router = useRouter()
  const { showToast } = useToast()

  // --- classificazione AI (batch sequenziale) ---
  const [classifying, setClassifying] = useState(false)
  const [classifyProgress, setClassifyProgress] = useState<{ done: number; total: number } | null>(null)
  const [classifyFailures, setClassifyFailures] = useState<number | null>(null)
  // Cause dei fallimenti del batch (E1a, D6): fisse, mai il testo grezzo della route.
  const [classifyFailureReasons, setClassifyFailureReasons] = useState<BatchFailureReason[]>([])
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
  const [extractFailureReasons, setExtractFailureReasons] = useState<BatchFailureReason[]>([])
  const [extractServiceUnavailable, setExtractServiceUnavailable] = useState(false)
  const [reviewOnly, setReviewOnly] = useState(false)
  // Un batch (caricamento, classificazione o estrazione) è in corso: gira nel
  // browser, quindi chiudere o ricaricare la scheda lo interrompe a metà. Fonte
  // unica per l'avviso del browser e per le due righe di testo (B58). Non dipende
  // da showModal: il batch continua con la modale chiusa.
  const batchBusy = isUploading || classifying || extracting
  // Documento aperto nel pannello laterale (E1b): un solo pannello per pagina.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<DocumentTabId>('panoramica')
  // Tab "Parti comuni" (E1b-9): la checklist della residenza, una riga per voce
  // attesa. Regole in common-documents.ts; null = checklist non disponibile.
  const common = useMemo(() => commonDocuments(checklist, docs), [checklist, docs])
  // Tab "Da rivedere" (E1b-8): senza unità e non ignorati, una riga per gruppo di
  // versioni dello stesso file (8e), regole in document-review.ts.
  const toReview = useMemo(() => reviewGroups(docs, units), [docs, units])
  // Righe del quadro unità × documenti (E1b-12): calcolate UNA volta, per il
  // quadro e per la testata dei contatori (mai due calcoli).
  const unitRows = useMemo(
    () => unitDocumentRows(docs, [...units].sort((a, b) => compareUnitLabels(a.label, b.label))),
    [docs, units],
  )
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
  const reviewCount = docs.filter(d => reviewState(d) === 'da_rivedere').length
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
  const presentTypes = presentDocTypes(docs, docTypeFilter)

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
    if (reviewOnly) result = result.filter(d => reviewState(d) === 'da_rivedere')
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
    setSelectionNotice(null)
    setSubmitted(false)
    setScope('residenza')
    setUploadPreset(null)
  }

  function openUploadFor(unitId: string, expectation: UnitExpectation) {
    setTasks([])
    setSelectionNotice(null)
    setSubmitted(false)
    setUploadPreset({ unitId, expectation })
    setScope('unita')
    setShowModal(true)
  }

  // Riga mancante di Parti comuni: stessa modale, destinazione Residenza (nessuna
  // unità) e tipo della voce già scelto. Stessa strada dei documenti di residenza.
  function openUploadForCommon(row: CommonDocumentRow) {
    setTasks([])
    setSelectionNotice(null)
    setSubmitted(false)
    setUploadPreset({ unitId: null, expectation: { docType: row.docType, label: row.label, category: row.category } })
    setScope('residenza')
    setShowModal(true)
  }

  // Un evento di stato per un file, riconosciuto per id del task (caricamento)
  // o per id del documento (classificazione ed estrazione, che conoscono solo lui).
  function emitFileEvent(taskId: string, event: FileEvent, documentId?: string) {
    setTasks(prev => prev.map(t => (
      t.id === taskId ? { ...t, state: applyFileEvent(t.state, event), ...(documentId ? { documentId } : {}) } : t
    )))
  }

  function emitDocumentEvent(documentId: string, event: FileEvent) {
    setTasks(prev => prev.map(t => (t.documentId === documentId ? { ...t, state: applyFileEvent(t.state, event) } : t)))
  }

  // La selezione sostituisce la precedente; tetto ed esclusi li decide
  // screenSelection. `tasks` è l'unica fonte di verità: l'input nativo non
  // tiene i file (vedi handleFilesSelected).
  function applySelection(files: File[]) {
    const { accepted, message, overLimit } = screenSelection(files)
    setTasks(accepted.map(file => ({ id: makeTaskId(), file, state: INITIAL_FILE_STATE })))
    setSelectionNotice(message ? { text: message, overLimit } : null)
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    // Svuota l'input: ripetere la stessa scelta rifà scattare l'evento, e il
    // testo nativo non contraddice la lista (es. "21 file" dopo un tetto superato).
    e.target.value = ''
    applySelection(files)
  }

  // Trascinamento sulla zona (solo senza preset): stessa strada del selettore.
  // Un drop senza file (testo, elemento della pagina) non tocca la lista.
  function handleZoneDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!dragHasFiles(e)) return
    e.preventDefault()
    setIsDragging(true)
  }

  function handleZoneDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false)
  }

  function handleZoneDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) applySelection(files)
  }

  // Modale aperta: una caduta di file fuori dalla zona non deve aprire il PDF
  // nella scheda (e far perdere la pagina). Fuori dalla zona il cursore dice no.
  useEffect(() => {
    if (!showModal) return
    function onDragOver(e: DragEvent) {
      if (!dragHasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = dropZoneRef.current?.contains(e.target as Node) ? 'copy' : 'none'
    }
    function onDrop(e: DragEvent) {
      if (!dragHasFiles(e)) return
      e.preventDefault()
      setIsDragging(false)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [showModal])

  // Avviso del browser solo mentre un batch è in corso; tolto a batch finito e
  // allo smontaggio. Non copre la navigazione interna del menu (nessun unload).
  useEffect(() => {
    if (!batchBusy) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [batchBusy])

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (tasks.length === 0) return

    const formData = new FormData(e.currentTarget)
    const unitId   = (formData.get('unitId') as string) || null
    const category = formData.get('category') as DocumentCategory
    const fileDate = (formData.get('fileDate') as string) || null
    // Caricamento da una cella del quadro: il tipo atteso viaggia come indizio
    // (classify-document lo confronta col tipo letto, mai lo impone).
    lastRun.current = {
      ctx: { residenceId, unitId, category, fileDate },
      expectedDocType: uploadPreset?.expectation.docType ?? null,
    }

    setSubmitted(true)
    await runUploadPass(tasks)
  }

  // "Riprova": solo i file che non sono arrivati in archivio, con i valori del
  // form di prima. Gli altri hanno già la loro riga: ricaricarli ne farebbe una
  // seconda versione (si riprendono con Classifica documenti / Estrai dati).
  function handleRetryFailed() {
    if (isUploading) return
    const ids = new Set(uploadRetryIds(tasks))
    if (ids.size === 0) return
    setTasks(prev => prev.map(t => (ids.has(t.id) ? { ...t, state: INITIAL_FILE_STATE } : t)))
    void runUploadPass(tasks.filter(t => ids.has(t.id)))
  }

  // Un passaggio di caricamento sui file dati, con i valori di lastRun: sia il
  // primo invio sia "Riprova". Un solo toast a fine caricamento, poi la
  // classificazione dei file arrivati in archivio.
  async function runUploadPass(toRun: FileTask[]) {
    const run = lastRun.current
    if (!run) return

    setIsUploading(true)
    const results = await Promise.all(toRun.map(task => runFileTask(task, run.ctx, emitFileEvent)))
    setIsUploading(false)

    const summary = summarizeUploadBatch(toRun.map((task, i) => ({ name: task.file.name, state: results[i].state })))
    if (summary) showToast(summary.kind, summary.message, summary.persistent ? { persistent: true } : undefined)

    // Auto-classificazione (B4): parte da sola sui documenti appena caricati,
    // per id esatto (mai indovinati da un refresh dei props). Nessun click.
    // Continua in sottofondo anche se la modale viene chiusa — lo stato vive
    // in questo componente, non nella modale.
    const justUploaded = toRun.flatMap((task, i) => {
      const documentId = results[i].documentId
      return documentId ? [{ id: documentId, title: task.file.name, expectedDocType: run.expectedDocType }] : []
    })

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
  async function classifyDocuments(targets: { id: string; title: string; expectedDocType?: DocType | null }[]) {
    if (targets.length === 0 || classifying) return
    setClassifying(true)
    setClassifyProgress({ done: 0, total: targets.length })
    setClassifyFailures(null)
    setClassifyFailureReasons([])
    setServiceUnavailable(false)

    let failures = 0
    const reasons: BatchFailureReason[] = []
    // Documenti usciti dalla classificazione con tipo finale ed estraibile:
    // l'estrazione parte da sola su questi, per id esatto (mai indovinati
    // da un refresh dei props), a batch concluso.
    const toExtract: { id: string; title: string }[] = []
    // Tipo letto diverso dal tipo atteso della cella: il documento resta sull'unità
    // ma in revisione, e a fine batch un solo avviso lo dice.
    const mismatches: { expected: DocType; actual: DocType; documentId: string }[] = []
    for (const [i, doc] of targets.entries()) {
      emitDocumentEvent(doc.id, { type: 'classify_start' })
      try {
        const res = await fetch('/api/classify-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: doc.id,
            ...(doc.expectedDocType ? { expected_doc_type: doc.expectedDocType } : {}),
          }),
        })
        const result = await res.json().catch(() => null)
        if (res.ok) {
          if (result?.mismatch === true && typeof result.expected_doc_type === 'string' && typeof result.actual_doc_type === 'string') {
            mismatches.push({ expected: result.expected_doc_type as DocType, actual: result.actual_doc_type as DocType, documentId: doc.id })
          }
          console.log(`[classifica] ${doc.title}:`, result)
          const extractable = result?.status === 'completata' && isExtractableDocType(typeof result.doc_type === 'string' ? result.doc_type : null)
          emitDocumentEvent(doc.id, { type: 'classify_ok', extractable })
          if (extractable) toExtract.push(doc)
        } else if (result?.cause === 'service_unavailable') {
          // Il servizio è giù: proseguire il batch chiamerebbe di nuovo un
          // servizio già noto non disponibile, un errore per documento alla
          // volta invece di un solo banner. Si ferma qui, non si conta come
          // fallimento per-documento. I file ancora in coda restano riprovabili
          // dal bottone, e lo dicono nella loro riga.
          console.error(`[classifica] servizio non disponibile, batch interrotto a "${doc.title}":`, result?.error ?? res.statusText)
          setServiceUnavailable(true)
          for (const stopped of targets.slice(i)) emitDocumentEvent(stopped.id, { type: 'stopped', error: SERVICE_DOWN_TEXT })
          break
        } else {
          failures++
          const reason = classifyBatchFailure({ status: res.status, cause: result?.cause })
          reasons.push(reason)
          emitDocumentEvent(doc.id, { type: 'classify_fail', error: describeBatchFailureReasons([reason]) })
          console.error(`[classifica] ${doc.title} fallita:`, result?.error ?? res.statusText)
        }
      } catch (err) {
        failures++
        const reason = classifyBatchFailure({ status: null, cause: undefined })
        reasons.push(reason)
        emitDocumentEvent(doc.id, { type: 'classify_fail', error: describeBatchFailureReasons([reason]) })
        console.error(`[classifica] ${doc.title} fallita:`, err)
      }
      setClassifyProgress({ done: i + 1, total: targets.length })
    }

    setClassifying(false)
    setClassifyProgress(null)
    setClassifyFailures(failures > 0 ? failures : null)
    setClassifyFailureReasons(reasons)
    router.refresh()

    const mismatchMessage = expectedMismatchMessage(mismatches)
    if (mismatchMessage) {
      // Non si chiude da solo: ha la X e un "Apri" che porta il documento (il primo, se
      // sono più d'uno) nel pannello. Il pannello compare appena il refresh lo porta in docs.
      const firstId = mismatches[0].documentId
      showToast('warning', mismatchMessage, {
        persistent: true,
        action: { label: 'Apri', onClick: () => setSelectedId(firstId) },
      })
    }

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
    setExtractFailureReasons([])
    setExtractServiceUnavailable(false)

    let failures = 0
    const reasons: BatchFailureReason[] = []
    for (const [i, doc] of targets.entries()) {
      emitDocumentEvent(doc.id, { type: 'extract_start' })
      try {
        const res = await fetch('/api/extract-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: doc.id }),
        })
        const result = await res.json().catch(() => null)
        if (res.ok) {
          console.log(`[estrai] ${doc.title}:`, result)
          emitDocumentEvent(doc.id, { type: 'extract_ok' })
        } else if (result?.cause === 'service_unavailable') {
          console.error(`[estrai] servizio non disponibile, batch interrotto a "${doc.title}":`, result?.error ?? res.statusText)
          setExtractServiceUnavailable(true)
          for (const stopped of targets.slice(i)) emitDocumentEvent(stopped.id, { type: 'stopped', error: SERVICE_DOWN_TEXT })
          break
        } else if (result?.cause === 'not_extractable') {
          // Il documento è cambiato sotto (riclassificato in 'altro' o
          // tornato in revisione nel frattempo): non è un fallimento, e
          // al refresh non sarà più in pendingExtraction.
          console.warn(`[estrai] ${doc.title} non estraibile:`, result?.error)
          emitDocumentEvent(doc.id, { type: 'extract_skip' })
        } else {
          failures++
          const reason = classifyBatchFailure({ status: res.status, cause: result?.cause })
          reasons.push(reason)
          emitDocumentEvent(doc.id, { type: 'extract_fail', error: describeBatchFailureReasons([reason]) })
          console.error(`[estrai] ${doc.title} senza dati:`, result?.error ?? res.statusText)
        }
      } catch (err) {
        failures++
        const reason = classifyBatchFailure({ status: null, cause: undefined })
        reasons.push(reason)
        emitDocumentEvent(doc.id, { type: 'extract_fail', error: describeBatchFailureReasons([reason]) })
        console.error(`[estrai] ${doc.title} senza dati:`, err)
      }
      setExtractProgress({ done: i + 1, total: targets.length })
    }

    setExtracting(false)
    setExtractProgress(null)
    setExtractFailures(failures > 0 ? failures : null)
    setExtractFailureReasons(reasons)
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

  const selectedDoc = selectedId === null ? null : docs.find(d => d.id === selectedId) ?? null
  const retryCount = uploadRetryIds(tasks).length

  return (
    <div className={selectedDoc ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_clamp(480px,40%,640px)] xl:gap-6 xl:items-start' : ''}>
    <div className="space-y-6 min-w-0">

      <UnitMatrixSummary rows={unitRows} />

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
      {supplierDataUnavailable && (
        <div className="bg-neutral-600/7 border border-neutral-600/20 rounded-xl px-4 py-3 text-sm text-neutral-600 flex items-center gap-3">
          <p className="flex-1 min-w-0">
            Anagrafica fornitori non disponibile al momento: la proposta del fornitore dai documenti è sospesa.
          </p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="flex-shrink-0 px-3 py-2 border border-brand-medium rounded-lg text-xs font-medium text-brand-dark"
          >
            Riprova
          </button>
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
                      ? `Caricamento: ${uploadProgress(tasks.map(t => t.state)).done} di ${tasks.length}`
                      : `Classificazione: ${classifyProgress!.done} di ${classifyProgress!.total}`}
                  </p>
                )}
                {batchBusy && (
                  <p className="text-xs text-text-secondary">Non chiudere la pagina finché non finisce.</p>
                )}
                <div className="space-y-1.5">
                  {tasks.map(task => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  {retryCount > 0 && (
                    <button
                      onClick={handleRetryFailed}
                      disabled={isUploading || classifying || extracting}
                      className="flex-1 border border-border rounded-xl py-2.5 text-sm text-text-secondary disabled:opacity-50"
                    >
                      {`Riprova (${retryCount})`}
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
                {uploadPreset && (
                  <p className="text-xs text-text-secondary bg-background rounded-lg px-3 py-2">
                    Stai caricando: <span className="font-medium text-text-primary">{uploadPreset.expectation.label}</span>
                    {' '}per <span className="font-medium text-text-primary">
                      {uploadPreset.unitId === null
                        ? 'Parti comuni'
                        : units.find(u => u.id === uploadPreset.unitId)?.label ?? 'l’unità scelta'}
                    </span>.
                    Il tipo lo conferma la classificazione dopo il caricamento.
                  </p>
                )}
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
                    defaultValue={uploadPreset?.unitId ?? ''}
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
                    defaultValue={uploadPreset ? (uploadPreset.expectation.category ?? '') : undefined}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                  >
                    {/* Tipo senza categoria mappata: nessun valore indovinato, si sceglie. */}
                    {uploadPreset && uploadPreset.expectation.category === null && (
                      <option value="" disabled>Scegli categoria…</option>
                    )}
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
                {/* Con preset (un solo file atteso) niente zona: stesso div, senza bordo né handler. */}
                <div
                  ref={uploadPreset === null ? dropZoneRef : undefined}
                  className={`space-y-1.5 ${uploadPreset === null ? `rounded-xl border-2 border-dashed p-3 ${isDragging ? 'border-brand-medium bg-brand-light/40' : 'border-border'}` : ''}`}
                  {...(uploadPreset === null && { onDragEnter: handleZoneDragOver, onDragOver: handleZoneDragOver, onDragLeave: handleZoneDragLeave, onDrop: handleZoneDrop })}
                >
                  <label className="text-xs font-medium text-text-secondary block">File *</label>
                  {/* Senza `required`: l'input resta vuoto per costruzione, la
                      lista vive in `tasks` e Carica è disabilitato a lista vuota. */}
                  <input
                    type="file"
                    multiple={uploadPreset === null}
                    onChange={handleFilesSelected}
                    accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx"
                    className="w-full text-sm text-text-secondary cursor-pointer file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-light file:text-brand-dark"
                  />
                  <p
                    role="status"
                    className={`text-xs leading-snug empty:hidden ${selectionNotice?.overLimit ? 'text-semantic-red' : 'text-status-inprogress'}`}
                  >
                    {selectionNotice?.text}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {tasks.length > 0
                      ? pluralize(tasks.length, 'file selezionato', 'file selezionati')
                      : `${uploadPreset === null ? 'Trascina qui i file o scegli dal computer · ' : ''}PDF, immagini, Word · max 50 MB per file`}
                  </p>
                  {tasks.length > 0 && (
                    <ul className="max-h-40 overflow-y-auto space-y-0.5">
                      {tasks.map(task => (
                        <li key={task.id} className="text-xs text-text-primary break-words">{task.file.name}</li>
                      ))}
                    </ul>
                  )}
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

      {batchBusy && !showModal && (
        <p className="text-xs text-text-secondary">Non chiudere la pagina finché non finisce.</p>
      )}

      {/* Esito sobrio a fine batch: sopravvive alla chiusura della modale
          (l'auto-classificazione continua in sottofondo). "Classifica
          documenti" sopra è la rete di sicurezza a cui rimanda. */}
      {!classifying && classifyFailures !== null && classifyFailures > 0 && (
        <p className="text-xs text-status-inprogress">
          {batchFailureMessage({
            count: classifyFailures,
            singular: 'documento non classificato',
            plural: 'documenti non classificati',
            retryText: 'riprova con Classifica documenti.',
            reasons: classifyFailureReasons,
          })}
        </p>
      )}
      {!extracting && extractFailures !== null && extractFailures > 0 && (
        <p className="text-xs text-status-inprogress">
          {batchFailureMessage({
            count: extractFailures,
            singular: 'documento senza dati estratti',
            plural: 'documenti senza dati estratti',
            retryText: 'riprova con Estrai dati.',
            reasons: extractFailureReasons,
          })}
        </p>
      )}

      <DocumentTabs
        value={tab}
        onChange={setTab}
        counts={{ 'da-rivedere': toReview.length, 'parti-comuni': commonBadge(common) ?? '' }}
      />

      {tab === 'panoramica' && (
      <div id={tabPanelId('panoramica')} role="tabpanel" aria-labelledby={tabId('panoramica')} className="space-y-6">
      {/* -------- Quadro unità × documenti attesi -------- */}
      <UnitDocumentMatrix
        docs={docs}
        rows={unitRows}
        selectedDocId={selectedId}
        onOpenDoc={setSelectedId}
        onUpload={openUploadFor}
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
                ? 'bg-semantic-amber-bg text-semantic-amber border-semantic-amber/50'
                : 'bg-surface text-text-secondary border-border hover:bg-background'
            }`}
          >
            {REVIEW_LABEL} ({reviewCount})
          </button>
        )}

        {/* Filtro tipo documento: tendina nativa (coerente coi select del modale).
            Il bottone si autodescrive con la selezione corrente; stato attivo
            evidenziato quando la lista è filtrata. */}
        {presentTypes.length > 0 && (
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
              {presentTypes.map(t => (
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
              residenceDocs.map(doc => <DocCard key={doc.id} doc={doc} supplierContext={supplierContext} selected={doc.id === selectedId} onOpen={setSelectedId} />)
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
                  {unitDocs.map(doc => <DocCard key={doc.id} doc={doc} supplierContext={supplierContext} selected={doc.id === selectedId} onOpen={setSelectedId} />)}
                </div>
              ))}
            </section>
          )}
        </div>
      )}
      </div>
      )}

      {/* Sempre montata e nascosta quando non attiva: i filtri non si perdono cambiando tab. */}
      <div id={tabPanelId('tutti')} role="tabpanel" aria-labelledby={tabId('tutti')} hidden={tab !== 'tutti'}>
        <DocumentsTable residenceId={residenceId} docs={docs} units={units} selectedId={selectedId} onOpen={setSelectedId} />
      </div>

      {/* Sempre montata: la motivazione di "Non applicabile" non si perde cambiando tab. */}
      <div id={tabPanelId('parti-comuni')} role="tabpanel" aria-labelledby={tabId('parti-comuni')} hidden={tab !== 'parti-comuni'}>
        <CommonDocumentsList
          result={common}
          residenceId={residenceId}
          unclassifiedCount={pendingClassification.length}
          markedByNames={markedByNames}
          canManageChecklist={canManageChecklist}
          selectedId={selectedId}
          onOpen={setSelectedId}
          onUpload={openUploadForCommon}
        />
      </div>

      <div id={tabPanelId('da-rivedere')} role="tabpanel" aria-labelledby={tabId('da-rivedere')} hidden={tab !== 'da-rivedere'}>
        <ReviewList groups={toReview} units={units} selectedId={selectedId} onOpen={setSelectedId} />
      </div>
    </div>

    {selectedDoc && (
      <PanelShell label={`Dettaglio: ${humanizeDocumentTitle(selectedDoc.title)}`} onClose={() => setSelectedId(null)}>
      <DocumentPanel
        // Si rimonta quando cambia il documento o le sue correzioni: le bozze
        // ripartono dai dati appena salvati.
        key={selectedDoc.id + ':' + selectedDoc.overrides.map(o => o.field_key + o.set_at).join('|')}
        doc={selectedDoc}
        units={units}
        versions={otherVersions(selectedDoc, docs)}
        correctedByNames={correctedByNames}
        supplierSlot={supplierContext ? <SupplierProposalSection doc={selectedDoc} context={supplierContext} /> : null}
        onClose={() => setSelectedId(null)}
        onOpenVersion={setSelectedId}
        onConfirmed={docType => handleClassificationConfirmed({ id: selectedDoc.id, title: selectedDoc.title }, docType)}
      />
      </PanelShell>
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
// Legge l'estrazione SOLO da currentExtraction, come riga ed Excel: è la
// porta unica su cui si innestano le correzioni manuali (R10).
function DeadlinesSection({ docs, today }: { docs: DocRow[]; today: string }) {
  const entries = validityEntries(
    docs,
    d => {
      const ext = currentExtraction(d)
      return ext ? { docType: d.doc_type, validUntil: ext.valid_until, fields: ext.fields } : null
    },
    today,
  )
  if (entries.length === 0) return null

  return (
    <section className="bg-surface rounded-xl border border-border p-4 space-y-1">
      <h2 className="text-sm font-medium text-text-primary">Scadenze</h2>
      <div>
        {entries.map(entry => (
          <div key={entry.item.id} className="flex items-center gap-3 max-lg:flex-wrap max-lg:gap-y-1 py-2.5 border-b border-border last:border-b-0">
            <div className="flex-1 min-w-0 max-lg:basis-full">
              <p className="text-sm text-text-primary break-words lg:truncate">{humanizeDocumentTitle(entry.item.title)}</p>
              {validitySubject(entry.item) && (
                <p className="text-xs text-text-secondary max-lg:line-clamp-2 max-lg:break-words lg:truncate">{validitySubject(entry.item)}</p>
              )}
            </div>
            <span className="flex-shrink-0 max-lg:shrink max-lg:min-w-0 max-lg:line-clamp-2 max-lg:break-words text-xs text-text-secondary text-right max-lg:text-left">
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

function TaskRow({ task }: { task: FileTask }) {
  const { state } = task
  // Giro in corso: rotella. In attesa del turno (coda, caricato, classificato): orologio.
  const icon = {
    in_coda:            <Clock className="w-4 h-4 text-text-secondary" strokeWidth={1.6} />,
    in_caricamento:     <Loader2 className="w-4 h-4 text-brand-medium animate-spin" strokeWidth={1.6} />,
    caricato:           <Clock className="w-4 h-4 text-text-secondary" strokeWidth={1.6} />,
    in_classificazione: <Loader2 className="w-4 h-4 text-brand-medium animate-spin" strokeWidth={1.6} />,
    classificato:       <Clock className="w-4 h-4 text-text-secondary" strokeWidth={1.6} />,
    in_estrazione:      <Loader2 className="w-4 h-4 text-brand-medium animate-spin" strokeWidth={1.6} />,
    completo:           <CheckCircle2 className="w-4 h-4 text-brand-medium" strokeWidth={1.6} />,
    fallito:            <AlertCircle className="w-4 h-4 text-semantic-red" strokeWidth={1.6} />,
  }[state.phase]

  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-text-primary break-words lg:truncate">{task.file.name}</p>
        <p className={`text-xs leading-snug ${state.phase === 'fallito' ? 'text-semantic-red' : 'text-text-secondary'}`}>
          {fileStatusLabel(state)}{state.phase === 'fallito' && state.error ? `: ${state.error}` : ''}
        </p>
      </div>
    </div>
  )
}

// Testo di ricerca della lista a card: il nome (document-table.ts) più i fatti
// estratti, in minuscolo. Il nome lo decide un solo posto, come per la tabella.
function searchText(doc: DocRow): string {
  return [documentNameText(doc), ...extractionFacts(doc)].join(' ').toLowerCase()
}

function DocCard({ doc, supplierContext, selected, onOpen }: {
  doc: DocRow
  supplierContext: SupplierContext | null
  selected: boolean
  onOpen: (id: string) => void
}) {
  const formattedDate = formatDateIT(displayDate(doc))
  const facts = extractionFacts(doc)
  // Impresa del documento diversa dal fornitore che quel documento ha collegato
  // (R10, 7c). Solo super_admin: supplierContext è null per l'admin.
  const supplierMismatches = supplierContext
    ? installerSupplierMismatches(doc, supplierContext.installations, supplierContext.suppliers)
    : []
  return (
    // relative: la card è il riquadro che il bottone del nome copre con il suo
    // ::after ("stretched link"), così tutta la card apre il pannello senza che
    // un elemento interattivo ne contenga un altro.
    <div className={`relative bg-surface rounded-xl border transition-colors hover:bg-background ${selected ? 'border-brand-medium' : 'border-border'}`}>
      <div className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 bg-background rounded-lg flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-text-secondary" strokeWidth={1.6} />
        </div>
        <div className="flex-1 min-w-0">
          {/* Il nome apre il pannello laterale: tipo, unità, dati letti e
              revisione stanno tutti lì, non più in pannelli sotto la card.
              Il bottone NON è posizionato: il suo ::after (absolute, inset-0)
              si ancora alla card e ne copre l'intera superficie. Download e
              link interni restano sopra (relative z-10), quindi cliccabili da
              soli. Il focus da tastiera si disegna sulla card intera. */}
          <button
            type="button"
            onClick={() => onOpen(doc.id)}
            aria-pressed={selected}
            className="block max-w-full text-left text-sm font-medium text-text-primary break-words lg:truncate cursor-pointer hover:underline focus:outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-brand-medium"
          >
            {humanizeDocumentTitle(doc.title)}
          </button>
          {/* La data non si taglia mai: solo il nome file cede spazio */}
          <p className="flex gap-1 text-xs text-text-secondary mt-0.5">
            <span className="truncate">{doc.file_name}</span>
            <span className="flex-shrink-0">· {formattedDate}</span>
          </p>
          {facts.length > 0 && (
            <p className="text-xs text-text-secondary mt-0.5">{facts.join(' · ')}</p>
          )}
          {supplierMismatches.length > 0 && (
            <div className="mt-1 space-y-1 break-words">
              {supplierMismatches.map(m => (
                <p key={`${m.supplierName}|${m.sistemaLabel}`} className="text-xs text-semantic-amber">
                  {installerMismatchText(m)}{' '}
                  {/* Gestione dei collegamenti: solo nella pagina builder (rimuovi/aggiungi). */}
                  <Link href="/admin/fornitori" className="relative z-10 font-medium underline">Gestisci i collegamenti</Link>
                </p>
              ))}
            </div>
          )}
          {/* Due assi distinti, mai fusi (legge di dominio 024): categoria a
              sinistra, stato/tipo classificazione a destra. */}
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-light text-brand-dark font-medium">
              {CAT_LABELS[doc.category]}
            </span>
            <ClassificationBadge doc={doc} />
            {hasCorrections(doc) && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-600/7 text-neutral-600 font-medium">
                Dati corretti a mano
              </span>
            )}
          </div>
        </div>
        <a
          href={`/api/download?bucket=documents&path=${encodeURIComponent(doc.storage_path)}`}
          className="relative z-10 p-2 rounded-lg text-brand-medium flex-shrink-0 hover:bg-brand-light transition-colors"
          title="Scarica documento"
        >
          <Download className="w-5 h-5" strokeWidth={1.6} />
        </a>
      </div>
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
// Ragione sociale e P.IVA sono quelle effettive: il verbale (extracted_metadata,
// che la conferma umana non riscrive mai) con sopra le correzioni manuali.
function SupplierProposalSection({ doc, context }: { doc: DocRow; context: SupplierContext }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  // Impresa digitata a mano, valida solo se l'impresa effettiva (correzione >
  // verbale) non ha una ragione sociale (resolveProposalInstaller, la stessa
  // funzione della server action). Vive in questo stato e nell'argomento
  // dell'action, che alla conferma lo salva come correzione del documento
  // (document_field_overrides): mai nel verbale.
  const [manualName, setManualName] = useState('')
  const [manualVat, setManualVat]   = useState('')
  const manualInput: ManualInstaller = { ragioneSociale: manualName, partitaIva: manualVat }
  const installer = resolveProposalInstaller(doc.doc_type, doc.extracted_metadata, doc.overrides, manualInput)
  const nameMissing = installer.nameMissing
  const manual: ManualInstaller | null = nameMissing ? manualInput : null

  const proposal = buildSupplierProposal({
    docType: doc.doc_type,
    sistema: doc.sistema,
    ragioneSociale: installer.ragioneSociale,
    partitaIva: installer.partitaIva,
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
    const res = await confirmSupplierProposal({ documentId: doc.id, expected: exp, manual })
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
      {nameMissing && (
        <div className="space-y-2 pb-1">
          <p className="text-xs text-semantic-amber">Impresa installatrice non rilevata nel documento</p>
          <input
            type="text"
            value={manualName}
            onChange={e => setManualName(e.target.value)}
            placeholder="Ragione sociale (obbligatoria)"
            aria-label="Ragione sociale dell'impresa installatrice"
            className="w-full border border-border rounded-xl px-3 py-2 text-sm"
          />
          <input
            type="text"
            inputMode="numeric"
            value={manualVat}
            onChange={e => setManualVat(e.target.value)}
            placeholder="Partita IVA (facoltativa, 11 cifre)"
            aria-label="Partita IVA dell'impresa installatrice"
            className="w-full border border-border rounded-xl px-3 py-2 text-sm"
          />
          {installer.manualError && <p className="text-xs text-semantic-red">{installer.manualError}</p>}
        </div>
      )}
      <SupplierProposalBody proposal={proposal} residenceName={context.residenceName} />
      {error && <p className="text-xs text-semantic-red">{error}</p>}
      {!expected && nameMissing && (proposal.kind === 'impresa_mancante' || proposal.kind === 'sistema_mancante') && (
        <button
          type="button"
          disabled
          className="w-full mt-2 border border-brand-medium text-brand-medium rounded-xl py-2.5 text-sm font-medium opacity-50"
        >
          Collega fornitore
        </button>
      )}
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
    case 'impresa_mancante':
      return proposal.sistema === null ? (
        <p className="text-xs text-semantic-amber">
          Sistema non classificato: correggi prima la classificazione. Poi inserisci l&apos;impresa
          per collegarla come esecutore in <span className="font-medium">{residenceName}</span>.
        </p>
      ) : (
        <p className="text-xs text-text-secondary">
          Inserisci la ragione sociale per proporre il collegamento{' '}
          <EsecutoreIn sistema={proposal.sistema} residenceName={residenceName} />.
        </p>
      )

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
