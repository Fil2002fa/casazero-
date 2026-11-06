'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Download } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { getDocumentsDownloadUrls, setDocumentUnit } from './actions'
import { DOC_TYPE_LABELS, SISTEMA_LABELS, type DocType } from '@/lib/document-classification'
import { displayDate, reviewState, type DocRow, type ReviewState, type UnitRow } from '@/lib/document-rows'
import {
  EMPTY_TABLE_FILTERS,
  STATE_FILTER_OPTIONS,
  UNIT_FILTER_ALL,
  UNIT_FILTER_NONE,
  filterTableDocs,
  isTableFiltered,
  presentDocTypes,
  pruneSelection,
  selectAllState,
  sortTableDocs,
  sortedUnits,
  splitBulkAssign,
  summarizeBulkAssign,
  summarizeZip,
  tableStateLabel,
  toggleSelectAll,
  zipBlockReason,
  zipEntryNames,
  zipFileName,
  type BulkFailure,
  type TableFilters,
  type TableStateFilter,
} from '@/lib/document-table'
import { formatDateIT } from '@/lib/formatDate'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import { humanizeDocumentTitle } from '@/lib/documentTitle'
import { pluralize } from '@/lib/pluralize'

// Tab "Tutti i documenti" (E1b, 7a). Un solo componente per admin e
// super_admin: nessun dato dipende dal ruolo. Regole di filtro e ordine in
// document-table.ts (verify:doctable); qui solo lo schermo.
//
// Tutta la riga apre il pannello laterale. Il click vive sulla <tr>; il
// bottone col nome serve alla tastiera e agli screen reader (Invio e Spazio
// generano un click che risale alla riga), quindi nessun elemento interattivo
// ne contiene un altro. Gli elementi interattivi che arriveranno nella riga
// (il checkbox oggi, il menu ⋯ in seguito) stanno in una cella che ferma la
// propagazione.
//
// Selezione (7a-2): vale solo per le righe visibili, e un filtro che ne nasconde
// una la toglie dalla selezione (pruneSelection): nessuna azione agisce su
// documenti che non si vedono. "Assegna unità" fa un ciclo sequenziale di
// setDocumentUnit senza rigenerare la pagina a ogni passo, un solo refresh
// alla fine, un solo toast; dopo il ciclo restano selezionati solo i falliti.
//
// "Scarica in ZIP" (7a-4): la server action restituisce solo signed URL brevi
// (con gate di ruolo e controllo residenza su ogni id), i file si scaricano nel
// browser con poche richieste in parallelo e fflate li comprime. Un file che
// non si scarica non blocca gli altri: ZIP con quelli riusciti e un toast
// persistente coi nomi mancanti. Oltre ZIP_MAX_FILES il bottone è disabilitato.

const NO_UNIT = '__none__'
const ZIP_PARALLEL_DOWNLOADS = 4

const PILL_BY_STATE: Record<ReviewState, string> = {
  da_rivedere: 'bg-semantic-amber-bg text-semantic-amber',
  chiusa: 'bg-brand-dark/8 text-brand-dark',
  in_lavorazione: 'bg-neutral-600/7 text-neutral-600',
}

const SELECT_BASE = 'appearance-none truncate rounded-xl border pl-3 pr-9 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-medium transition-colors'

function FilterSelect({ label, value, active, width, onChange, children }: {
  label: string
  value: string
  active: boolean
  width: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <div className="relative flex-shrink-0">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={label}
        className={`${SELECT_BASE} ${width} ${
          active
            ? 'border-brand-medium bg-brand-light/40 text-brand-dark font-medium'
            : 'border-border text-text-secondary'
        }`}
      >
        {children}
      </select>
      <ChevronDown
        className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary"
        strokeWidth={1.8}
      />
    </div>
  )
}

export function DocumentsTable({ residenceId, docs, units, selectedId, onOpen }: {
  residenceId: string
  docs: DocRow[]
  units: UnitRow[]
  selectedId: string | null
  onOpen: (id: string) => void
}) {
  const [filters, setFilters] = useState<TableFilters>(EMPTY_TABLE_FILTERS)
  const patch = (p: Partial<TableFilters>) => setFilters(f => ({ ...f, ...p }))

  const rows = useMemo(() => sortTableDocs(filterTableDocs(docs, filters)), [docs, filters])
  const unitLabels = useMemo(() => new Map(units.map(u => [u.id, u.label])), [units])
  const types = presentDocTypes(docs, filters.docType)
  const filtered = isTableFiltered(filters)

  const router = useRouter()
  const { showToast } = useToast()
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [target, setTarget] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const assigning = progress !== null
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null)
  const zipping = zipProgress !== null
  // Un solo lavoro alla volta sulla selezione: assegnare mentre si prepara lo
  // ZIP cambierebbe le unità di documenti già in viaggio.
  const busy = assigning || zipping

  // Una selezione non sopravvive alla riga che sparisce (filtro, assegnazione).
  useEffect(() => {
    setSelected(prev => pruneSelection(prev, rows))
  }, [rows])

  const selectedDocs = rows.filter(d => selected.has(d.id))
  const allState = selectAllState(selected, rows)
  const headerCheckbox = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (headerCheckbox.current) headerCheckbox.current.indeterminate = allState === 'some'
  }, [allState])

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function assignSelected() {
    if (target === '' || busy || selectedDocs.length === 0) return
    const unitId = target === NO_UNIT ? null : target
    const targetLabel = unitId === null ? null : formatUnitLabel(unitLabels.get(unitId) ?? 'Unità')
    const { toApply, alreadyThere } = splitBulkAssign(selectedDocs, unitId)

    const failures: BulkFailure[] = []
    const failedIds = new Set<string>()
    setProgress({ done: 0, total: toApply.length })
    for (const [i, doc] of toApply.entries()) {
      const res = await setDocumentUnit({ documentId: doc.id, unitId, revalidate: false })
      if ('error' in res) {
        failures.push({ name: humanizeDocumentTitle(doc.title), error: res.error })
        failedIds.add(doc.id)
      }
      setProgress({ done: i + 1, total: toApply.length })
    }
    setProgress(null)

    const summary = summarizeBulkAssign({
      assigned: toApply.length - failures.length,
      alreadyThere: alreadyThere.length,
      failures,
      targetLabel,
    })
    showToast(summary.kind, summary.message, summary.persistent ? { persistent: true } : undefined)
    setSelected(failedIds)
    if (failures.length === 0) setTarget('')
    router.refresh()
  }

  const zipBlocked = zipBlockReason(selectedDocs.length)

  async function downloadZip() {
    if (busy || selectedDocs.length === 0 || zipBlocked !== null) return
    const picked = selectedDocs
    const total = picked.length
    setZipProgress({ done: 0, total })
    try {
      const res = await getDocumentsDownloadUrls({ residenceId, documentIds: picked.map(d => d.id) })
      if ('error' in res) {
        showToast('error', res.error, { persistent: true })
        return
      }

      const nameOf = new Map(picked.map(d => [d.id, humanizeDocumentTitle(d.title)]))
      const bytes = new Map<string, Uint8Array>()
      const failures: BulkFailure[] = []
      let done = 0
      const queue = [...res.files]
      const worker = async () => {
        for (let f = queue.shift(); f !== undefined; f = queue.shift()) {
          const name = nameOf.get(f.id) ?? f.id
          if ('error' in f) {
            failures.push({ name, error: f.error })
          } else {
            try {
              const r = await fetch(f.url)
              if (!r.ok) throw new Error(`HTTP ${r.status}`)
              bytes.set(f.id, new Uint8Array(await r.arrayBuffer()))
            } catch (err) {
              console.error('[downloadZip] scaricamento fallito', { documentId: f.id, err })
              failures.push({ name, error: 'Scaricamento non riuscito, riprova.' })
            }
          }
          done += 1
          setZipProgress({ done, total })
        }
      }
      await Promise.all(Array.from({ length: Math.min(ZIP_PARALLEL_DOWNLOADS, queue.length) }, worker))

      const summary = summarizeZip({ added: bytes.size, failures })
      if (bytes.size > 0) {
        // Nell'ordine della tabella, non in quello di arrivo.
        const entryNames = zipEntryNames(picked.filter(d => bytes.has(d.id)).map(d => ({ id: d.id, fileName: d.file_name })))
        const entries: Record<string, Uint8Array> = {}
        for (const [id, entryName] of entryNames) entries[entryName] = bytes.get(id)!
        const { zip } = await import('fflate')
        const data = await new Promise<Uint8Array>((resolve, reject) => {
          zip(entries, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out)))
        })
        const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/zip' }))
        const a = document.createElement('a')
        a.href = url
        a.download = zipFileName(res.residenceName, new Date())
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
      }
      showToast(summary.kind, summary.message, summary.persistent ? { persistent: true } : undefined)
    } catch (err) {
      console.error('[downloadZip] preparazione fallita', err)
      showToast('error', 'Non sono riuscito a preparare lo ZIP, riprova.', { persistent: true })
    } finally {
      setZipProgress(null)
    }
  }

  return (
    <section aria-label="Tutti i documenti" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filters.search}
          onChange={e => patch({ search: e.target.value })}
          placeholder="Cerca per nome o file…"
          aria-label="Cerca per nome"
          className="flex-1 min-w-[10rem] border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
        />

        <FilterSelect
          label="Filtra per unità"
          value={filters.unit}
          active={filters.unit !== UNIT_FILTER_ALL}
          width="w-[170px]"
          onChange={unit => patch({ unit })}
        >
          <option value={UNIT_FILTER_ALL}>Tutte le unità</option>
          <option value={UNIT_FILTER_NONE}>Senza unità</option>
          {sortedUnits(units).map(u => (
            <option key={u.id} value={u.id}>{formatUnitLabel(u.label)}</option>
          ))}
        </FilterSelect>

        <FilterSelect
          label="Filtra per tipo documento"
          value={filters.docType}
          active={filters.docType !== 'all'}
          width="w-[200px]"
          onChange={docType => patch({ docType: docType as DocType | 'all' })}
        >
          <option value="all">Tutti i tipi</option>
          {types.map(t => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
        </FilterSelect>

        <FilterSelect
          label="Filtra per stato"
          value={filters.state}
          active={filters.state !== 'all'}
          width="w-[170px]"
          onChange={state => patch({ state: state as TableStateFilter })}
        >
          {STATE_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </FilterSelect>

        {filtered && (
          <button
            type="button"
            onClick={() => setFilters(EMPTY_TABLE_FILTERS)}
            aria-label="Azzera filtri"
            className="flex-shrink-0 border border-border rounded-xl px-3 py-2 text-sm text-text-secondary bg-surface hover:bg-background transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium"
          >
            ✕
          </button>
        )}
      </div>

      <p className="text-xs text-text-secondary" aria-live="polite">
        {filtered
          ? `${pluralize(rows.length, 'documento', 'documenti')} su ${docs.length}`
          : pluralize(docs.length, 'documento', 'documenti')}
      </p>

      {selectedDocs.length > 0 && (
        <div
          role="region"
          aria-label="Azioni sulla selezione"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-medium/40 bg-brand-light/40 px-3 py-2"
        >
          <span className="text-sm font-medium text-brand-dark" aria-live="polite">
            {pluralize(selectedDocs.length, 'selezionato', 'selezionati')}
          </span>
          <FilterSelect
            label="Unità di destinazione"
            value={target}
            active={target !== ''}
            width="w-[240px]"
            onChange={setTarget}
          >
            <option value="" disabled>Assegna unità…</option>
            <option value={NO_UNIT}>Nessuna unità (documento della residenza)</option>
            {sortedUnits(units).map(u => (
              <option key={u.id} value={u.id}>{formatUnitLabel(u.label)}</option>
            ))}
          </FilterSelect>
          <button
            type="button"
            onClick={assignSelected}
            disabled={target === '' || busy}
            className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium focus-visible:ring-offset-1"
          >
            {assigning ? `Assegno… (${progress.done}/${progress.total})` : 'Assegna'}
          </button>
          <button
            type="button"
            onClick={downloadZip}
            disabled={busy || zipBlocked !== null}
            aria-describedby={zipBlocked !== null ? 'zip-block-reason' : undefined}
            className="inline-flex items-center gap-1.5 rounded-xl border border-brand-medium bg-surface px-4 py-2 text-sm font-medium text-brand-dark disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium focus-visible:ring-offset-1"
          >
            <Download className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
            {zipping ? `Preparo lo ZIP… (${zipProgress.done}/${zipProgress.total})` : 'Scarica in ZIP'}
          </button>
          {zipBlocked !== null && (
            <span id="zip-block-reason" className="text-xs text-semantic-amber">{zipBlocked}</span>
          )}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            disabled={busy}
            className="ml-auto text-sm text-text-secondary hover:underline disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium rounded"
          >
            Deseleziona
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-text-secondary">
            {filtered ? 'Nessun documento per questi filtri.' : 'Nessun documento caricato per questa residenza.'}
          </p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-text-secondary">
                <th scope="col" className="w-10 pl-4 pr-0 py-2.5">
                  <input
                    ref={headerCheckbox}
                    type="checkbox"
                    checked={allState === 'all'}
                    onChange={() => setSelected(toggleSelectAll(selected, rows))}
                    disabled={busy}
                    aria-label={allState === 'all' ? 'Deseleziona tutti i documenti visibili' : 'Seleziona tutti i documenti visibili'}
                    className="h-4 w-4 accent-brand-medium"
                  />
                </th>
                <th scope="col" className="px-4 py-2.5 min-w-[16rem]">Nome</th>
                <th scope="col" className="px-3 py-2.5">Tipo</th>
                <th scope="col" className="px-3 py-2.5">Unità</th>
                <th scope="col" className="px-3 py-2.5 whitespace-nowrap">Data</th>
                <th scope="col" className="px-3 py-2.5">Stato</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(doc => {
                const open = doc.id === selectedId
                const checked = selected.has(doc.id)
                const unitLabel = doc.unit_id === null ? null : unitLabels.get(doc.unit_id) ?? null
                const state = reviewState(doc)
                return (
                  <tr
                    key={doc.id}
                    onClick={() => onOpen(doc.id)}
                    className={`border-b border-border last:border-b-0 cursor-pointer transition-colors ${
                      open ? 'bg-brand-light/50' : checked ? 'bg-brand-light/25' : 'hover:bg-background'
                    }`}
                  >
                    {/* Il checkbox non apre il pannello: la cella ferma il clic. */}
                    <td className="w-10 pl-4 pr-0 py-2.5" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(doc.id)}
                        disabled={busy}
                        aria-label={`Seleziona ${humanizeDocumentTitle(doc.title)}`}
                        className="h-4 w-4 accent-brand-medium"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        aria-pressed={open}
                        className="block max-w-full text-left font-medium text-text-primary break-words focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium rounded"
                      >
                        {humanizeDocumentTitle(doc.title)}
                      </button>
                      <span className="block text-xs text-text-secondary truncate max-w-[24rem]">{doc.file_name}</span>
                    </td>
                    <td className="px-3 py-2.5 text-text-primary">
                      {doc.doc_type
                        ? <>
                            {DOC_TYPE_LABELS[doc.doc_type]}
                            {doc.sistema && <span className="text-text-secondary"> · {SISTEMA_LABELS[doc.sistema]}</span>}
                          </>
                        : <span className="text-text-secondary">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-text-primary">
                      {unitLabel === null
                        ? <span className="text-text-secondary">{doc.unit_id === null ? 'Residenza' : 'Unità'}</span>
                        : formatUnitLabel(unitLabel)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-text-secondary">{formatDateIT(displayDate(doc))}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${PILL_BY_STATE[state]}`}>
                        {tableStateLabel(doc)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
