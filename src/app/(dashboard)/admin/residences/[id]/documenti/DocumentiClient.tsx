'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Download, Upload, X, Loader2, CheckCircle2, AlertCircle, Clock, Sparkles, ChevronDown } from 'lucide-react'
import type { DocumentCategory } from '@/types/database'
import { createUploadUrl, confirmDocument, confirmClassification, setChecklistException, clearChecklistException } from './actions'
import { ALLOWED_DOCUMENT_MIME, MAX_DOCUMENT_SIZE } from '@/lib/document-upload'
import { pluralize } from '@/lib/pluralize'
import {
  DOC_TYPES,
  DOC_TYPE_LABELS,
  SISTEMI,
  SISTEMA_LABELS,
  type DocType,
  type Sistema,
  type ClassificationStatus,
} from '@/lib/document-classification'
import type { ChecklistResult, ChecklistExpectation } from '@/lib/document-checklist'
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
  // id profilo → full_name (028), solo i marcatori realmente presenti tra
  // le eccezioni di questa residenza. null = profilo senza full_name.
  markedByNames: Record<string, string | null>
}

export function DocumentiClient({ residenceId, docs, units, checklist, markedByNames }: Props) {
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
  const [reviewOnly, setReviewOnly] = useState(false)
  const [docTypeFilter, setDocTypeFilter] = useState<DocType | 'all'>('all')
  const pendingClassification = docs.filter(d => d.classification_status === 'non_classificato')
  const reviewCount = docs.filter(d => d.classification_status === 'da_revisionare').length
  // Solo i doc_type davvero presenti tra i documenti, ordinati alfabeticamente
  // per etichetta: in una tendina si cerca per nome, non per l'ordine tecnico
  // della costante. Include sempre il tipo attualmente selezionato anche se
  // zero documenti: un click "Vedi documenti di questo tipo" dalla checklist
  // su una voce mancante deve poter selezionare un tipo senza risultati
  // (lista vuota è un esito legittimo, non un select fuori dalle sue option).
  const presentDocTypes = DOC_TYPES
    .filter(t => t === docTypeFilter || docs.some(d => d.doc_type === t))
    .sort((a, b) => DOC_TYPE_LABELS[a].localeCompare(DOC_TYPE_LABELS[b], 'it'))

  // --- computed ---
  // In dashboard il filtro categoria è rimosso (asse ridondante rispetto a
  // doc_type). category resta su upload, badge card e vista PWA residente.
  // Tipo documento, coda revisione e ricerca restano combinabili in AND.
  const isFiltered = search.trim() !== '' || reviewOnly || docTypeFilter !== 'all'

  const filtered = useMemo(() => {
    let result = docs
    if (docTypeFilter !== 'all') result = result.filter(d => d.doc_type === docTypeFilter)
    if (reviewOnly) result = result.filter(d => d.classification_status === 'da_revisionare')
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(d => d.title.toLowerCase().includes(q))
    }
    return result
  }, [docs, docTypeFilter, reviewOnly, search])

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

    let failures = 0
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
  }

  // Bottone manuale: rete di sicurezza per i file che l'auto-classificazione
  // non ha processato. Stessa identica lista (pendingClassification) usata
  // per il contatore nel bottone — mai due calcoli paralleli (bug class).
  function handleClassify() {
    void classifyDocuments(pendingClassification.map(d => ({ id: d.id, title: d.title })))
  }

  return (
    <div className="space-y-5">

      {/* -------- Modale upload -------- */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[#E4E6E2] p-5 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-lg space-y-4">

            {/* Header modale */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-[#20302A]">Carica documenti</p>
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
                  <input
                    type="date"
                    name="fileDate"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                  />
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

      {/* -------- Checklist di consegna (B4 C5a/C5b) -------- */}
      <ChecklistSection
        residenceId={residenceId}
        checklist={checklist}
        unclassifiedCount={pendingClassification.length}
        onFilterDocType={t => setDocTypeFilter(t)}
        markedByNames={markedByNames}
      />

      {/* -------- Ricerca + filtri (tipo a tendina · coda revisione) -------- */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca documento…"
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

        {isFiltered && (
          <button
            onClick={() => { setSearch(''); setReviewOnly(false); setDocTypeFilter('all') }}
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
            <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wide">Residenza</h2>
            {residenceDocs.length === 0 ? (
              <p className="text-sm text-text-secondary px-1">
                Nessun documento di residenza{isFiltered ? ' per questo filtro' : ''}.
              </p>
            ) : (
              residenceDocs.map(doc => <DocCard key={doc.id} doc={doc} />)
            )}
          </section>

          {/* Sezione per unità */}
          {byUnit.size > 0 && (
            <section className="space-y-4">
              <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wide">Per unità</h2>
              {[...byUnit.entries()].map(([unitId, unitDocs]) => (
                <div key={unitId} className="space-y-2">
                  <h3 className="text-sm font-medium text-text-primary">
                    {unitMap.get(unitId)?.label ?? 'Unità'}
                  </h3>
                  {unitDocs.map(doc => <DocCard key={doc.id} doc={doc} />)}
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
// 'unit' non è mai popolato in v1). Ordine e label coerenti con SCOPE_RANK
// dell'helper (condominium, dossier_admin, residence).
type CountedScopeKey = 'condominium' | 'dossier_admin' | 'residence'
const SCOPE_ORDER: CountedScopeKey[] = ['condominium', 'dossier_admin', 'residence']
const SCOPE_LABELS: Record<CountedScopeKey, string> = {
  condominium: 'Parti comuni',
  dossier_admin: 'Dossier amministratore',
  residence: 'Residenza',
}

// Checklist di consegna — read-only (B4 C5a). I numeri dei contatori
// vengono SEMPRE da checklist.counts (reduce già fatta nell'helper, bug
// class contatore/lista chiusa a monte): nessun ricalcolo qui.
//
// Fisarmonica (B4 C5a-bis): chiusa di default, un solo scope aperto alla
// volta (stesso useState, mai due). I documenti restano il contenuto
// principale della pagina; la checklist è supporto e non deve spingerli
// sotto la piega.
function ChecklistSection({
  residenceId,
  checklist,
  unclassifiedCount,
  onFilterDocType,
  markedByNames,
}: {
  residenceId: string
  checklist: ChecklistResult
  unclassifiedCount: number
  onFilterDocType: (docType: DocType) => void
  markedByNames: Record<string, string | null>
}) {
  const [openScope, setOpenScope] = useState<CountedScopeKey | null>(null)
  const [missingOnly, setMissingOnly] = useState(false)

  const openItems = openScope
    ? checklist.expectations.filter(
        e => e.scope === openScope && (!missingOnly || (!e.satisfied && !e.notApplicable))
      )
    : []

  return (
    <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
      <h2 className="text-sm font-medium text-text-primary">Checklist di consegna</h2>

      <div className="flex flex-wrap gap-2">
        {SCOPE_ORDER.map(scope => {
          const isOpen = openScope === scope
          const c = checklist.counts[scope]
          return (
            <button
              key={scope}
              type="button"
              onClick={() => setOpenScope(isOpen ? null : scope)}
              aria-expanded={isOpen}
              className={`flex-1 min-w-[9rem] rounded-lg border px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium ${
                isOpen
                  ? 'bg-brand-light/50 border-brand-medium/30'
                  : 'bg-background border-transparent hover:bg-border/40'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <p className="text-[11px] text-text-secondary">{SCOPE_LABELS[scope]}</p>
                <ChevronDown
                  className={`w-3 h-3 flex-shrink-0 text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  strokeWidth={1.8}
                />
              </div>
              <p className="text-sm font-medium text-text-primary mt-0.5 flex items-center gap-1.5">
                {c.satisfied}/{c.total - c.notApplicable}
                {c.missing > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-status-inprogress" aria-hidden="true" />
                )}
              </p>
              {c.notApplicable > 0 && (
                <p className="text-[11px] text-text-secondary">
                  {pluralize(c.notApplicable, 'esclusa', 'escluse')}
                </p>
              )}
            </button>
          )
        })}
      </div>

      {/* Qualificano i numeri dei contatori sopra: restano visibili anche a
          checklist chiusa (B4 C5a-bis punto 5). Avviso non classificati
          contato dallo stesso array docs già in prop, nessuna query nuova. */}
      {unclassifiedCount > 0 && (
        <p className="text-xs text-text-secondary bg-background rounded-lg px-3 py-2">
          {pluralize(unclassifiedCount, 'documento non ancora classificato', 'documenti non ancora classificati')}
          {' '}— i conteggi potrebbero cambiare.
        </p>
      )}
      {checklist.warnings.length > 0 && (
        <div className="text-[11px] text-neutral-600 bg-background rounded-lg px-3 py-2 space-y-0.5">
          {checklist.warnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}

      {openScope && (
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="text-[11px] font-medium text-text-secondary uppercase tracking-wide">
              {SCOPE_LABELS[openScope]}
            </h3>
            <button
              onClick={() => setMissingOnly(v => !v)}
              aria-pressed={missingOnly}
              className={`flex-shrink-0 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium ${
                missingOnly
                  ? 'bg-status-inprogress/10 text-status-inprogress border-status-inprogress/30'
                  : 'bg-surface text-text-secondary border-border hover:bg-background'
              }`}
            >
              {missingOnly ? 'Mostra tutte' : 'Solo mancanti'}
            </button>
          </div>
          {openItems.length === 0 ? (
            <p className="text-sm text-text-secondary py-2">Nessuna voce mancante in questo gruppo.</p>
          ) : (
            openItems.map(exp => (
              <ChecklistItemRow
                key={exp.expectationKey}
                exp={exp}
                residenceId={residenceId}
                onFilterDocType={onFilterDocType}
                markedByNames={markedByNames}
              />
            ))
          )}
        </div>
      )}
    </section>
  )
}

function ChecklistItemRow({
  exp,
  residenceId,
  onFilterDocType,
  markedByNames,
}: {
  exp: ChecklistExpectation
  residenceId: string
  onFilterDocType: (docType: DocType) => void
  markedByNames: Record<string, string | null>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  // Eccezione checklist (B4 C5b, motivazione obbligatoria dalla revisione
  // "audit" — 028). showForm apre il campo nota di "Segna non applicabile";
  // precompilato da exp.note AD OGNI apertura del form (openForm sotto),
  // non solo al mount — altrimenti riaprire il form dopo un refresh
  // mostrerebbe un valore stantio. Precompilare è correttezza, non
  // cortesia: setChecklistException fa upsert e sovrascrive la nota, un
  // form vuoto su una voce con nota già presente la cancellerebbe.
  // Niente più campo "atteso da": expected_from non è nel payload
  // dell'action (028, IN SCOPE) — il valore legacy resta leggibile in
  // sola lettura nel pannello info sopra, mai riscritto da qui.
  const [showForm, setShowForm] = useState(false)
  const [note, setNote] = useState(exp.note ?? '')
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const status = exp.notApplicable
    ? { label: 'Non applicabile', className: 'bg-neutral-600/7 text-neutral-600' }
    : exp.satisfied
    ? { label: 'Presente', className: 'bg-brand-dark/8 text-brand-dark' }
    : { label: 'Mancante', className: 'bg-status-inprogress/8 text-status-inprogress' }

  function openForm() {
    setNote(exp.note ?? '')
    setActionError(null)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setActionError(null)
  }

  // Disabilitazione client-side per comodità: il vincolo vero è
  // server-side, in setChecklistException ("La motivazione è obbligatoria").
  const trimmedNote = note.trim()

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

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 py-2.5 text-left"
      >
        <ChevronDown
          className={`w-3.5 h-3.5 flex-shrink-0 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.8}
        />
        <span className="flex-1 text-sm text-text-primary min-w-0 truncate">{exp.label}</span>
        <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${status.className}`}>
          {status.label}
        </span>
      </button>

      {/* Pannello SOLO INFORMATIVO in questo commit — nessuna azione di
          scrittura (segna non applicabile / carica documento arrivano in
          C5b/C5c). */}
      {open && (
        <div className="pb-3 pl-6 space-y-2 text-xs text-text-secondary">
          <p>Tipo documento: <span className="text-text-primary">{DOC_TYPE_LABELS[exp.docType]}</span></p>
          {exp.sistema && (
            <p>Impianto: <span className="text-text-primary">{SISTEMA_LABELS[exp.sistema]}</span></p>
          )}
          <p>Ambito: <span className="text-text-primary">{SCOPE_LABELS[exp.scope as CountedScopeKey] ?? exp.scope}</span></p>

          {exp.notApplicable && exp.expectedFrom && (
            <p>Atteso da: <span className="text-text-primary">{exp.expectedFrom}</span></p>
          )}

          {exp.satisfied && exp.matchingDocuments.length > 0 && (
            <div className="space-y-1">
              {exp.matchingDocuments.map(doc => (
                <p key={doc.id} className="flex items-center justify-between gap-2">
                  <span className="text-text-primary truncate">{doc.label}</span>
                  <span className="flex-shrink-0">{doc.reviewedBy ? 'Confermato da te' : "Classificato dall'AI"}</span>
                </p>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => onFilterDocType(exp.docType)}
            className="text-brand-medium font-medium hover:underline"
          >
            Vedi documenti di questo tipo
          </button>

          {/* Eccezione checklist (B4 C5b): segna/annulla non applicabile.
              Due stati, mai insieme. Niente conferma modale — reversibile,
              il bottone opposto è subito accanto. */}
          <div className="pt-2 border-t border-border/60 space-y-2">
            {exp.notApplicable ? (
              <div className="space-y-1.5">
                {/* Motivazione prima dell'attribuzione: chi legge vuole sapere
                    PERCHÉ prima di sapere CHI. Fallback solo quando marcatore
                    e data sono entrambi assenti (riga pre-028, mai backfillata) —
                    non basarsi sul solo nome, altrimenti una data presente senza
                    nome verrebbe scambiata per "non tracciato". */}
                {exp.note && <p className="text-text-primary">{exp.note}</p>}
                <p>
                  {exp.markedBy === null && exp.markedAt === null
                    ? 'Escluso · dato non tracciato'
                    : `Escluso da ${exp.markedBy ? (markedByNames[exp.markedBy] ?? 'utente sconosciuto') : '—'} · ${
                        exp.markedAt
                          ? new Date(exp.markedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
                          : '—'
                      }`}
                </p>
                <button
                  type="button"
                  onClick={handleClearException}
                  disabled={pending}
                  className="text-brand-medium font-medium hover:underline disabled:opacity-50"
                >
                  {pending ? 'Attendere…' : 'Annulla non applicabile'}
                </button>
              </div>
            ) : showForm ? (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label htmlFor={`note-${exp.expectationKey}`} className="block text-text-secondary">
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
                    onClick={cancelForm}
                    disabled={pending}
                    className="flex-1 border border-border rounded-lg py-1.5 text-text-secondary disabled:opacity-50"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmException}
                    disabled={pending || trimmedNote.length === 0}
                    className="flex-1 bg-brand-dark text-white rounded-lg py-1.5 font-medium disabled:opacity-50"
                  >
                    {pending ? 'Salvataggio…' : 'Conferma'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={openForm}
                className="text-brand-medium font-medium hover:underline"
              >
                Segna non applicabile
              </button>
            )}
            {actionError && <p className="text-status-inprogress">{actionError}</p>}
          </div>
        </div>
      )}
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
      return {
        label: sistema ? `${base} · ${SISTEMA_LABELS[sistema]}` : base,
        className: 'bg-brand-dark/8 text-brand-dark',
      }
    }
    case 'da_revisionare':
      return { label: 'Da rivedere', className: 'bg-status-inprogress/8 text-status-inprogress' }
    case 'fallita':
      return { label: 'Errore, riprova', className: 'bg-neutral-600/7 text-neutral-600' }
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
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${info.className}`}>
      {info.spinner && <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />}
      {info.label}
    </span>
  )
}

function DocCard({ doc }: { doc: DocRow }) {
  const [reviewOpen, setReviewOpen] = useState(false)
  const formattedDate = new Date(doc.file_date ?? doc.created_at).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
  // La revisione umana ha senso solo dove c'è (o dovrebbe esserci) un doc_type
  // da confermare/correggere: 'fallita' è un errore tecnico da riclassificare,
  // non da rivedere nel merito.
  const canReview = doc.classification_status === 'da_revisionare' || doc.classification_status === 'completata'
  return (
    <div className="bg-surface rounded-xl border border-border">
      <div className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 bg-background rounded-lg flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-text-secondary" strokeWidth={1.6} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{doc.title}</p>
          <p className="text-xs text-text-secondary mt-0.5 truncate">{doc.file_name} · {formattedDate}</p>
          {/* Due assi distinti, mai fusi (legge di dominio 024): categoria a
              sinistra, stato/tipo classificazione a destra. */}
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-light text-brand-dark font-medium">
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
          {reviewOpen && <ReviewPanel doc={doc} onDone={() => setReviewOpen(false)} />}
        </div>
      )}
    </div>
  )
}

function ReviewPanel({ doc, onDone }: { doc: DocRow; onDone: () => void }) {
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
    </div>
  )
}
