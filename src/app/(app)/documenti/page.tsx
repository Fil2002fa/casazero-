import type { Metadata } from 'next'
import { FileText, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'
import { UploadDocumentForm } from '@/components/UploadDocumentForm'
import type { DocumentCategory } from '@/types/database'

export const metadata: Metadata = { title: 'Documenti' }

const CATEGORIES: { value: DocumentCategory; label: string; icon: string }[] = [
  { value: 'proprieta',      label: 'Proprietà',     icon: '🏠' },
  { value: 'tecnici',        label: 'Tecnici',        icon: '⚙️' },
  { value: 'energetici',     label: 'Energetici',     icon: '⚡' },
  { value: 'conformita',     label: 'Conformità',     icon: '✅' },
  { value: 'amministrativi', label: 'Amministrativi', icon: '📋' },
]

type DocRow = {
  id: string
  title: string
  category: DocumentCategory
  file_name: string
  storage_path: string
  file_date: string | null
  created_at: string
}

type SearchParams = Promise<{ search?: string; category?: string }>

export default async function DocumentiPage({ searchParams }: { searchParams: SearchParams }) {
  const { search, category: catFilter } = await searchParams
  const profile = await requireProfile()
  const supabase = await createClient()
  const canUpload = profile.role === 'admin' || profile.role === 'super_admin'

  // Residenza per il form di upload
  let residenceId: string | null = null
  if (profile.role === 'admin') {
    const { data } = await supabase
      .from('admin_assignments')
      .select('residence_id')
      .eq('profile_id', profile.id)
      .limit(1)
      .maybeSingle()
    residenceId = data?.residence_id ?? null
  } else if (profile.role === 'super_admin') {
    const { data } = await supabase
      .from('residences')
      .select('id')
      .limit(1)
      .maybeSingle()
    residenceId = data?.id ?? null
  } else {
    const { data } = await supabase
      .from('unit_members')
      .select('units(residence_id)')
      .eq('profile_id', profile.id)
      .is('ended_at', null)
      .maybeSingle()
    residenceId = (data?.units as unknown as { residence_id: string } | null)?.residence_id ?? null
  }

  // Documenti accessibili via RLS
  let query = supabase
    .from('documents')
    .select('id, title, category, file_name, storage_path, file_date, created_at')
    .order('created_at', { ascending: false })

  if (catFilter && catFilter !== 'all') {
    query = query.eq('category', catFilter as DocumentCategory)
  }
  if (search?.trim()) {
    query = query.ilike('title', `%${search.trim()}%`)
  }

  const { data: rawDocs } = await query
  const docs = (rawDocs ?? []) as DocRow[]

  const grouped = new Map<DocumentCategory, DocRow[]>()
  for (const cat of CATEGORIES) grouped.set(cat.value, [])
  for (const doc of docs) grouped.get(doc.category)?.push(doc)

  return (
    <div className="p-6 space-y-6 pb-safe">
      <header>
        <h1 className="text-xl font-medium text-text-primary">Documenti</h1>
        <p className="text-xs text-text-secondary mt-0.5">{docs.length} documento{docs.length !== 1 ? 's' : ''}</p>
      </header>

      {canUpload && residenceId && (
        <UploadDocumentForm residenceId={residenceId} />
      )}

      {/* Ricerca */}
      <form method="GET" className="flex gap-2">
        <input
          type="search"
          name="search"
          defaultValue={search ?? ''}
          placeholder="Cerca documento…"
          className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
        />
        <button
          type="submit"
          className="border border-border rounded-lg px-4 py-2 text-sm text-text-secondary bg-surface"
        >
          Cerca
        </button>
        {(search || catFilter) && (
          <a
            href="/documenti"
            className="border border-border rounded-lg px-3 py-2 text-sm text-text-secondary bg-surface flex items-center"
          >
            ✕
          </a>
        )}
      </form>

      {/* Filtri categoria */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-6 px-6 scrollbar-none">
        <Chip href="/documenti" label="Tutti" active={!catFilter || catFilter === 'all'} />
        {CATEGORIES.map(c => (
          <Chip key={c.value} href={`/documenti?category=${c.value}`} label={c.label} active={catFilter === c.value} />
        ))}
      </div>

      {/* Lista */}
      {docs.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-text-secondary">
            {search ? `Nessun risultato per "${search}".` : 'Nessun documento caricato.'}
          </p>
        </div>
      ) : (catFilter && catFilter !== 'all') ? (
        <div className="space-y-2">
          {docs.map(doc => <DocCard key={doc.id} doc={doc} />)}
        </div>
      ) : (
        <div className="space-y-6">
          {CATEGORIES.map(cat => {
            const list = grouped.get(cat.value) ?? []
            if (!list.length) return null
            return (
              <section key={cat.value} className="space-y-2">
                <h2 className="text-sm font-medium text-text-primary flex items-center gap-2">
                  {cat.icon} {cat.label}
                  <span className="text-text-secondary font-normal text-xs">({list.length})</span>
                </h2>
                {list.map(doc => <DocCard key={doc.id} doc={doc} />)}
              </section>
            )
          })}
        </div>
      )}
    </div>
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
        <p className="text-xs text-text-secondary mt-0.5">{doc.file_name} · {formattedDate}</p>
      </div>
      <a
        href={`/api/download?bucket=documents&path=${encodeURIComponent(doc.storage_path)}`}
        className="p-2 rounded-lg text-brand-medium flex-shrink-0 active:scale-95 transition-transform"
        title="Scarica"
      >
        <Download className="w-5 h-5" strokeWidth={1.6} />
      </a>
    </div>
  )
}

function Chip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <a
      href={href}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${
        active ? 'bg-brand-dark text-white' : 'bg-surface border border-border text-text-secondary'
      }`}
    >
      {label}
    </a>
  )
}
