'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Download, Upload, X } from 'lucide-react'
import type { DocumentCategory } from '@/types/database'
import { uploadDocumentiAdmin } from './actions'
import type { UploadResult } from './actions'

export type DocRow = {
  id: string
  title: string
  category: DocumentCategory
  file_name: string
  storage_path: string
  file_date: string | null
  unit_id: string | null
  created_at: string
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

interface Props {
  residenceId: string
  docs: DocRow[]
  units: UnitRow[]
}

export function DocumentiClient({ residenceId, docs, units }: Props) {
  // --- filter state ---
  const [catFilter, setCatFilter] = useState<DocumentCategory | 'all'>('all')
  const [search, setSearch]       = useState('')

  // --- upload modal state ---
  const [showModal, setShowModal]         = useState(false)
  const [scope, setScope]                 = useState<'residenza' | 'unita'>('residenza')
  const [uploadResult, setUploadResult]   = useState<UploadResult | null>(null)
  const [uploadError, setUploadError]     = useState<string | null>(null)
  const [uploadPending, startTransition]  = useTransition()
  const router = useRouter()

  // --- computed ---
  const isFiltered = catFilter !== 'all' || search.trim() !== ''

  const filtered = useMemo(() => {
    let result = docs
    if (catFilter !== 'all') result = result.filter(d => d.category === catFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(d => d.title.toLowerCase().includes(q))
    }
    return result
  }, [docs, catFilter, search])

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
    if (uploadPending) return
    setShowModal(false)
    setUploadResult(null)
    setUploadError(null)
    setScope('residenza')
  }

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setUploadError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await uploadDocumentiAdmin(formData)
      if (result.error) {
        setUploadError(result.error)
      } else {
        setUploadResult(result)
        if (result.uploaded.length > 0) router.refresh()
      }
    })
  }

  return (
    <div className="p-4 space-y-5">

      {/* -------- Modale upload -------- */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[#E4E6E2] p-5 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-lg space-y-4">

            {/* Header modale */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-[#20302A]">Carica documenti</p>
              <button
                onClick={closeModal}
                disabled={uploadPending}
                className="p-1 text-text-secondary rounded-lg hover:bg-background disabled:opacity-50"
              >
                <X className="w-4 h-4" strokeWidth={1.6} />
              </button>
            </div>

            {/* ---- Stato risultato ---- */}
            {uploadResult ? (
              <div className="space-y-3">
                {uploadResult.uploaded.length > 0 && (
                  <div className="text-sm text-brand-dark bg-brand-light rounded-lg px-3 py-2.5">
                    {uploadResult.uploaded.length} documento{uploadResult.uploaded.length !== 1 ? 'i' : ''} caricato{uploadResult.uploaded.length !== 1 ? 'i' : ''} con successo
                  </div>
                )}
                {uploadResult.failed.length > 0 && (
                  <div className="bg-semantic-red-bg rounded-lg px-3 py-2.5 space-y-1.5">
                    <p className="text-xs font-medium text-semantic-red">
                      {uploadResult.failed.length} file non caricato{uploadResult.failed.length !== 1 ? 'i' : ''}:
                    </p>
                    {uploadResult.failed.map((f, i) => (
                      <p key={i} className="text-xs text-semantic-red leading-snug">
                        · {f.name}: {f.reason}
                      </p>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  {uploadResult.uploaded.length === 0 && (
                    <button
                      onClick={() => setUploadResult(null)}
                      className="flex-1 border border-border rounded-xl py-2.5 text-sm text-text-secondary"
                    >
                      Riprova
                    </button>
                  )}
                  <button
                    onClick={closeModal}
                    className="flex-1 bg-brand-dark text-white rounded-xl py-2.5 text-sm font-medium"
                  >
                    Chiudi
                  </button>
                </div>
              </div>

            ) : (
            /* ---- Form upload ---- */
              <form onSubmit={handleUpload} className="space-y-4">
                <input type="hidden" name="residenceId" value={residenceId} />

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
                    name="files"
                    multiple
                    required
                    accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx"
                    className="w-full text-sm text-text-secondary cursor-pointer file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-light file:text-brand-dark"
                  />
                  <p className="text-xs text-text-secondary">PDF, immagini, Word · max 50 MB per file</p>
                </div>

                {uploadError && (
                  <p className="text-xs text-semantic-red bg-semantic-red-bg rounded-lg px-3 py-2">
                    {uploadError}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={uploadPending}
                    className="flex-1 border border-border rounded-xl py-2.5 text-sm text-text-secondary disabled:opacity-50"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    disabled={uploadPending}
                    className="flex-1 bg-brand-dark text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
                  >
                    {uploadPending ? 'Caricamento…' : 'Carica'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* -------- Pulsante upload -------- */}
      <div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-brand-dark text-white rounded-xl px-4 py-2.5 text-sm font-medium active:scale-[0.98] transition-transform"
        >
          <Upload className="w-4 h-4" strokeWidth={1.8} />
          Carica documenti
        </button>
      </div>

      {/* -------- Ricerca -------- */}
      <div className="flex gap-2">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca documento…"
          className="flex-1 border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
        />
        {isFiltered && (
          <button
            onClick={() => { setSearch(''); setCatFilter('all') }}
            className="border border-border rounded-xl px-3 py-2 text-sm text-text-secondary bg-surface"
          >
            ✕
          </button>
        )}
      </div>

      {/* -------- Chip categorie -------- */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-none">
        <CategoryChip label="Tutti" active={catFilter === 'all'} onClick={() => setCatFilter('all')} />
        {CATEGORIES.map(c => (
          <CategoryChip
            key={c.value}
            label={c.label}
            active={catFilter === c.value}
            onClick={() => setCatFilter(prev => prev === c.value ? 'all' : c.value)}
          />
        ))}
      </div>

      {/* -------- Contatore -------- */}
      {!isEmpty && (
        <p className="text-xs text-text-secondary">
          {filtered.length} documento{filtered.length !== 1 ? 'i' : ''}
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

function CategoryChip({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active
          ? 'bg-brand-dark text-white'
          : 'bg-surface border border-border text-text-secondary hover:bg-background'
      }`}
    >
      {label}
    </button>
  )
}

function DocCard({ doc }: { doc: DocRow }) {
  const formattedDate = new Date(doc.file_date ?? doc.created_at).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
  return (
    <div className="bg-surface rounded-xl border border-border p-4 flex items-center gap-3">
      <div className="w-10 h-10 bg-background rounded-lg flex items-center justify-center flex-shrink-0">
        <FileText className="w-5 h-5 text-text-secondary" strokeWidth={1.6} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{doc.title}</p>
        <p className="text-xs text-text-secondary mt-0.5 truncate">{doc.file_name} · {formattedDate}</p>
        <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-brand-light text-brand-dark font-medium">
          {CAT_LABELS[doc.category]}
        </span>
      </div>
      <a
        href={`/api/download?bucket=documents&path=${encodeURIComponent(doc.storage_path)}`}
        className="p-2 rounded-lg text-brand-medium flex-shrink-0 hover:bg-brand-light transition-colors"
        title="Scarica documento"
      >
        <Download className="w-5 h-5" strokeWidth={1.6} />
      </a>
    </div>
  )
}
