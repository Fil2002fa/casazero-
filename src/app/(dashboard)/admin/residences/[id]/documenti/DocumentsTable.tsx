'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
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
  sortTableDocs,
  sortedUnits,
  tableStateLabel,
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
// (checkbox, menu ⋯, commit 7a-2) fermano la propagazione.

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

export function DocumentsTable({ docs, units, selectedId, onOpen }: {
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
                <th scope="col" className="px-4 py-2.5 min-w-[16rem]">Nome</th>
                <th scope="col" className="px-3 py-2.5">Tipo</th>
                <th scope="col" className="px-3 py-2.5">Unità</th>
                <th scope="col" className="px-3 py-2.5 whitespace-nowrap">Data</th>
                <th scope="col" className="px-3 py-2.5">Stato</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(doc => {
                const selected = doc.id === selectedId
                const unitLabel = doc.unit_id === null ? null : unitLabels.get(doc.unit_id) ?? null
                const state = reviewState(doc)
                return (
                  <tr
                    key={doc.id}
                    onClick={() => onOpen(doc.id)}
                    className={`border-b border-border last:border-b-0 cursor-pointer transition-colors ${
                      selected ? 'bg-brand-light/50' : 'hover:bg-background'
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        aria-pressed={selected}
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
