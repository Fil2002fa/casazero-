/**
 * Sezione "Dal costruttore" della pagina Documenti del residente: righe,
 * gruppi per categoria, filtro, ricerca e conteggi come funzioni pure. Il
 * componente non decide niente da solo, e scripts/verify-resident-documents.mjs
 * prova ogni regola senza avviare l'app.
 *
 * Due passi, entrambi su UN solo elenco di righe (la bug class "conteggio e
 * lista divergenti" non può nascere):
 *  1. toResidentDocumentItems (server): righe documento → una voce per file+tipo,
 *     con tutte le stringhe già composte (titolo, riga sotto, versioni, dati
 *     estratti). Gruppo e titolo sono quelli della home (home-documents.ts).
 *  2. filterResidentDocuments (client): categoria, ricerca, sezioni, conteggi.
 *
 * Il testo cercabile usa solo i dati estratti che il residente vede
 * (residentDocumentFacts): cercando una P.IVA o un numero di polizza si
 * scoprirebbe quale documento li contiene.
 *
 * Import relativi tra moduli di lib: vedi document-rows.ts.
 */
import type { DocumentCategory } from '@/types/database'
import { SISTEMA_LABELS } from './document-classification'
import { displayDate, type DocRow } from './document-rows'
import { formatDateIT } from './formatDate'
import { groupHomeDocuments, homeDocumentTitle } from './home-documents'
import { humanizeDocumentTitle } from './documentTitle'
import { pluralize } from './pluralize'
import { residentDocumentFacts } from './resident-document-facts'

/** Categorie del DB (enum document_category) con l'etichetta mostrata, nell'ordine delle sezioni. */
export const RESIDENT_DOC_CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: 'proprieta', label: 'Proprietà' },
  { value: 'tecnici', label: 'Tecnici' },
  { value: 'energetici', label: 'Energetici' },
  { value: 'conformita', label: 'Conformità' },
  { value: 'amministrativi', label: 'Amministrativi' },
]

export const SCOPE_RESIDENCE_LABEL = 'Residenza'
export const SCOPE_UNIT_LABEL = 'Il tuo appartamento'

export type ResidentDocVersion = {
  id: string
  storagePath: string
  dateLabel: string
  isLatest: boolean
}

export type ResidentDocItem = {
  /** Chiave del gruppo (file + tipo): stabile tra un render e l'altro. */
  key: string
  category: DocumentCategory
  /** Etichetta del tipo documento; senza tipo, titolo umanizzato; poi nome file. */
  title: string
  /** "Residenza" (unit_id nullo) oppure "Il tuo appartamento". */
  scopeLabel: string
  /** Impianto (SISTEMA_LABELS), se il documento ne ha uno. */
  sistemaLabel: string | null
  /** Data del documento più recente, già formattata (formatDateIT). */
  dateLabel: string
  /** "Residenza · Impianto termico · 21 mag 2026": la riga sotto il titolo. */
  subtitle: string
  /** "+2 versioni", oppure null se il documento ha una sola versione. */
  versionsLabel: string | null
  /** Dati estratti visibili al residente, già composti. */
  facts: string[]
  fileName: string
  /** Tutte le versioni, la più recente per prima. */
  versions: ResidentDocVersion[]
  /** Testo minuscolo su cui lavora la ricerca. */
  searchText: string
}

export function toResidentDocumentItems(docs: readonly DocRow[]): ResidentDocItem[] {
  return groupHomeDocuments(docs).map(({ key, latest, docs: versions, extra }) => {
    const scopeLabel = latest.unit_id === null ? SCOPE_RESIDENCE_LABEL : SCOPE_UNIT_LABEL
    const sistemaLabel = latest.sistema ? SISTEMA_LABELS[latest.sistema] ?? null : null
    const dateLabel = formatDateIT(displayDate(latest))
    const facts = residentDocumentFacts(latest)
    const title = homeDocumentTitle(latest)
    return {
      key,
      category: latest.category,
      title,
      scopeLabel,
      sistemaLabel,
      dateLabel,
      subtitle: [scopeLabel, sistemaLabel, dateLabel].filter(Boolean).join(' · '),
      versionsLabel: extra > 0 ? `+${pluralize(extra, 'versione', 'versioni')}` : null,
      facts,
      fileName: latest.file_name,
      versions: versions.map((v, i) => ({
        id: v.id,
        storagePath: v.storage_path,
        dateLabel: formatDateIT(displayDate(v)),
        isLatest: i === 0,
      })),
      searchText: [title, humanizeDocumentTitle(latest.title), latest.file_name, scopeLabel, sistemaLabel ?? '', ...facts]
        .join(' ')
        .toLocaleLowerCase('it'),
    }
  })
}

/** Indirizzo del file via /api/download: scaricamento, oppure apertura in linea con inline=1. */
export function residentDocumentUrl(storagePath: string, inline = false): string {
  return `/api/download?bucket=documents&path=${encodeURIComponent(storagePath)}${inline ? '&inline=1' : ''}`
}

export type CategoryFilter = DocumentCategory | 'all'

export type ResidentDocFilters = { category: CategoryFilter; search: string }

export const EMPTY_RESIDENT_DOC_FILTERS: ResidentDocFilters = { category: 'all', search: '' }

export type ResidentDocSection = { category: DocumentCategory; label: string; items: ResidentDocItem[] }

/**
 * none       il residente non ha documenti: stato vuoto "Nessun documento".
 * no-results ci sono documenti ma filtro o ricerca non ne lasciano: "Nessun documento trovato".
 */
export type ResidentDocEmpty = 'none' | 'no-results' | null

export type ResidentDocView = {
  /** Gruppi totali, senza filtri: il numero della card verde. */
  total: number
  /** Gruppi dopo filtri: il numero accanto al titolo della sezione. Somma di sections[].items. */
  visible: number
  sections: ResidentDocSection[]
  empty: ResidentDocEmpty
  /** Filtro o ricerca attivi: serve a mostrare "Mostra tutti i documenti". */
  filtering: boolean
}

export function isFiltering(filters: ResidentDocFilters): boolean {
  return filters.category !== 'all' || filters.search.trim() !== ''
}

export function filterResidentDocuments(
  items: readonly ResidentDocItem[],
  filters: ResidentDocFilters,
): ResidentDocView {
  const term = filters.search.trim().toLocaleLowerCase('it')
  const matching = items.filter(
    i => (filters.category === 'all' || i.category === filters.category) && (term === '' || i.searchText.includes(term)),
  )
  const sections = RESIDENT_DOC_CATEGORIES
    .map(c => ({ category: c.value, label: c.label, items: matching.filter(i => i.category === c.value) }))
    .filter(s => s.items.length > 0)
  const filtering = isFiltering(filters)
  return {
    total: items.length,
    visible: matching.length,
    sections,
    empty: items.length === 0 ? 'none' : matching.length === 0 ? 'no-results' : null,
    filtering,
  }
}
