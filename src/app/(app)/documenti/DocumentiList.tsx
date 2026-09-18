'use client'

import { useMemo, useState } from 'react'
import { FileText, Download } from 'lucide-react'
import { Input, Label } from '@/components/ui/Input'
import { buttonVariants } from '@/components/ui/Button'
import { pluralize } from '@/lib/pluralize'
import { humanizeDocumentTitle } from '@/lib/documentTitle'
import type { DocumentCategory } from '@/types/database'

const CATEGORIES: { value: DocumentCategory; label: string; icon: string }[] = [
  { value: 'proprieta',      label: 'Proprietà',     icon: '🏠' },
  { value: 'tecnici',        label: 'Tecnici',        icon: '⚙️' },
  { value: 'energetici',     label: 'Energetici',     icon: '⚡' },
  { value: 'conformita',     label: 'Conformità',     icon: '✅' },
  { value: 'amministrativi', label: 'Amministrativi', icon: '📋' },
]

// La data arriva già formattata dal server: formattarla qui darebbe testo
// diverso fra Node e Safari (ICU e fuso) e quindi un mismatch di hydration.
export type DocItem = {
  id: string
  title: string
  category: DocumentCategory
  file_name: string
  storage_path: string
  formattedDate: string
  // Dati estratti già scelti e composti sul server: validità, classe,
  // oggetto, chi rilascia la garanzia, installatore, compagnia. Vuoto se non
  // ce ne sono.
  facts: string[]
}

type CategoryFilter = DocumentCategory | 'all'

// Tutti i documenti sono già in memoria: filtri e ricerca non passano dal server.
export function DocumentiList({ docs, uploadSlot }: { docs: DocItem[]; uploadSlot?: React.ReactNode }) {
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [search, setSearch] = useState('')

  const term = search.trim().toLocaleLowerCase('it')

  const visible = useMemo(
    () => docs.filter(d =>
      (category === 'all' || d.category === category) &&
      (!term || searchText(d).includes(term))
    ),
    [docs, category, term]
  )

  const grouped = useMemo(() => {
    const map = new Map<DocumentCategory, DocItem[]>()
    for (const cat of CATEGORIES) map.set(cat.value, [])
    for (const doc of visible) map.get(doc.category)?.push(doc)
    return map
  }, [visible])

  const hasFilter = search !== '' || category !== 'all'

  return (
    <>
      <header>
        <h1 className="font-serif text-[22px] font-semibold text-text-primary">Documenti</h1>
        <p className="text-sm text-text-secondary mt-0.5">{pluralize(visible.length, 'documento', 'documenti')}</p>
      </header>

      {uploadSlot}

      {/* Ricerca */}
      <form role="search" onSubmit={e => e.preventDefault()} className="flex gap-2">
        <Label htmlFor="doc-search" className="sr-only">Cerca documento</Label>
        <Input
          id="doc-search"
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca documento…"
          className="flex-1"
        />
        {hasFilter && (
          <button
            type="button"
            onClick={() => { setSearch(''); setCategory('all') }}
            className={buttonVariants('secondary', 'default', 'px-3')}
            aria-label="Cancella ricerca"
          >
            ✕
          </button>
        )}
      </form>

      {/* Filtri categoria: vanno a capo, mai nascosti fuori schermo */}
      <div className="flex flex-wrap gap-2">
        <Chip label="Tutti" active={category === 'all'} onClick={() => setCategory('all')} />
        {CATEGORIES.map(c => (
          <Chip key={c.value} label={c.label} active={category === c.value} onClick={() => setCategory(c.value)} />
        ))}
      </div>

      {/* Lista */}
      {visible.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-8 text-center">
          <p className="text-base text-text-secondary break-words">
            {term ? `Nessun risultato per "${search.trim()}".` : 'Nessun documento caricato.'}
          </p>
        </div>
      ) : category !== 'all' ? (
        <div className="space-y-2">
          {visible.map(doc => <DocCard key={doc.id} doc={doc} />)}
        </div>
      ) : (
        <div className="space-y-6">
          {CATEGORIES.map(cat => {
            const list = grouped.get(cat.value) ?? []
            if (!list.length) return null
            return (
              <section key={cat.value} className="space-y-2">
                <h2 className="text-[13px] font-medium text-neutral-500 flex items-center gap-1.5">
                  {cat.icon} {cat.label}
                  <span className="font-normal">({list.length})</span>
                </h2>
                <div className="space-y-2">
                  {list.map(doc => <DocCard key={doc.id} doc={doc} />)}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

// Testo in cui cerca la ricerca: il titolo com'è salvato e la sua forma
// leggibile, come nell'archivio della dashboard, così "garanzia caldaia"
// trova "certificato_garanzia_caldaia".
function searchText(doc: DocItem): string {
  return `${doc.title} ${humanizeDocumentTitle(doc.title)}`.toLocaleLowerCase('it')
}

function DocCard({ doc }: { doc: DocItem }) {
  return (
    <a
      href={`/api/download?bucket=documents&path=${encodeURIComponent(doc.storage_path)}`}
      className="flex items-center gap-3 min-h-14 py-2 px-4 bg-surface rounded-xl border border-border focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20"
    >
      <FileText className="w-5 h-5 text-neutral-400 flex-shrink-0" strokeWidth={1.6} />
      <div className="flex-1 min-w-0">
        <p className="text-base font-medium text-text-primary break-words">{humanizeDocumentTitle(doc.title)}</p>
        {doc.facts.length > 0 && (
          <p className="text-xs text-text-secondary mt-0.5 break-words">{doc.facts.join(' · ')}</p>
        )}
        {/* La data non si taglia mai: solo il nome file cede spazio */}
        <p className="flex gap-1 text-xs text-neutral-500">
          <span className="truncate">{doc.file_name}</span>
          <span className="flex-shrink-0">· {doc.formattedDate}</span>
        </p>
      </div>
      <Download className="w-4 h-4 text-neutral-400 flex-shrink-0" strokeWidth={1.6} aria-hidden="true" />
    </a>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-shrink-0 flex items-center h-11 px-4 rounded-full text-sm font-medium focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 ${
        active ? 'bg-brand-dark text-white' : 'bg-surface border border-border text-text-secondary'
      }`}
    >
      {label}
    </button>
  )
}
