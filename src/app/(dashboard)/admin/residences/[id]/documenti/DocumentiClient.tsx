'use client'

import { useState, useMemo } from 'react'
import { FileText, Download } from 'lucide-react'
import type { DocumentCategory } from '@/types/database'

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
  docs: DocRow[]
  units: UnitRow[]
}

export function DocumentiClient({ docs, units }: Props) {
  const [catFilter, setCatFilter] = useState<DocumentCategory | 'all'>('all')
  const [search, setSearch]       = useState('')

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

  return (
    <div className="p-4 space-y-5">
      {/* Ricerca */}
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

      {/* Chip categorie */}
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

      {/* Contatore */}
      {!isEmpty && (
        <p className="text-xs text-text-secondary">
          {filtered.length} documento{filtered.length !== 1 ? 'i' : 'o'}
        </p>
      )}

      {isEmpty ? (
        <div className="bg-surface rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-text-secondary">
            {isFiltered ? 'Nessun documento trovato.' : 'Nessun documento caricato per questa residenza.'}
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
