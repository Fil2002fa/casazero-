/**
 * Pagina Documenti del residente con la sezione "I tuoi documenti" (059):
 * righe dei documenti caricati dal residente e vista combinata con "Dal
 * costruttore" (filtri, ricerca, conteggi). Funzioni pure, provate da
 * scripts/verify-resident-own-documents.mjs.
 *
 * Conteggi e liste vengono dagli STESSI due array (builder e mine): la card
 * verde conta items.length, le sezioni contano ciò che mostrano.
 *
 * Il nome di chi ha caricato non si mostra: le policy su profiles non fanno
 * leggere al residente il profilo di chi vive con lui (si dice "da chi vive
 * con te"). Mostrarlo richiederebbe una modifica RLS.
 */
import type { ResidentDocKind, ResidentDocMime, ResidentDocument } from '@/types/database'
import { formatDateIT } from './formatDate'
import { pluralize } from './pluralize'
import { formatFileSize, residentDocKindLabel } from './resident-document-upload'
import { filterResidentDocuments, type CategoryFilter, type ResidentDocItem, type ResidentDocView } from './resident-documents-view'

export type OwnDocRow = Pick<ResidentDocument, 'id' | 'doc_kind' | 'title' | 'mime_type' | 'size_bytes' | 'created_at' | 'uploaded_by'>

export type OwnDocItem = {
  id: string
  kind: ResidentDocKind
  kindLabel: string
  title: string
  mimeType: ResidentDocMime
  isImage: boolean
  sizeLabel: string
  dateLabel: string
  /** "da te" oppure "da chi vive con te". */
  byLabel: string
  /** Caricato da chi guarda. */
  mine: boolean
  searchText: string
}

export const OWN_BY_ME = 'da te'
export const OWN_BY_HOUSEMATE = 'da chi vive con te'

/** Più recente per primo. */
export function toOwnDocumentItems(rows: readonly OwnDocRow[], viewerId: string): OwnDocItem[] {
  return [...rows]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    .map(r => {
      const kindLabel = residentDocKindLabel(r.doc_kind)
      const mine = r.uploaded_by === viewerId
      return {
        id: r.id,
        kind: r.doc_kind,
        kindLabel,
        title: r.title,
        mimeType: r.mime_type,
        isImage: r.mime_type.startsWith('image/'),
        sizeLabel: formatFileSize(r.size_bytes),
        dateLabel: formatDateIT(r.created_at),
        byLabel: mine ? OWN_BY_ME : OWN_BY_HOUSEMATE,
        mine,
        searchText: [r.title, kindLabel].join(' ').toLocaleLowerCase('it'),
      }
    })
}

/** Riga sotto il titolo: "12 mar 2026" oppure "3 feb 2026 · da chi vive con te". */
export function ownDocumentMeta(item: OwnDocItem): string {
  return item.mine ? item.dateLabel : `${item.dateLabel} · ${item.byLabel}`
}

/** Righe del foglio di dettaglio. */
export function ownDocumentSheetRows(item: OwnDocItem): { label: string; value: string }[] {
  return [
    { label: 'Tipo', value: item.kindLabel },
    { label: 'Dimensione', value: item.sizeLabel },
    { label: 'Aggiunto', value: `${item.dateLabel} · ${item.byLabel}` },
  ]
}

/** Indirizzo del file: scaricamento, oppure apertura in linea con inline=1. */
export function ownDocumentUrl(id: string, inline = false): string {
  return `/api/documenti-residente/${encodeURIComponent(id)}${inline ? '?inline=1' : ''}`
}

/** "3 tuoi" / "1 tuo" nella card verde. */
export function ownCountLabel(n: number): string {
  return n === 1 ? 'tuo' : 'tuoi'
}

export type PageFilter = CategoryFilter | 'mine'

export type PageFilters = { filter: PageFilter; search: string }

export const EMPTY_PAGE_FILTERS: PageFilters = { filter: 'all', search: '' }

/**
 * hidden  sezione non mostrata (filtro di categoria, oppure ricerca senza risultati);
 * empty   il residente non ha ancora documenti suoi e non sta cercando: invito al primo;
 * list    righe da mostrare.
 */
export type OwnSectionState = 'hidden' | 'empty' | 'list'

export type DocumentsPageView = {
  builderTotal: number
  ownTotal: number
  /** null = sezione costruttore non mostrata (filtro "I tuoi"). */
  builder: ResidentDocView | null
  builderState: 'hidden' | 'none' | 'list'
  own: { state: OwnSectionState; items: OwnDocItem[]; countLabel: string }
  /** Nessuna sezione ha qualcosa da mostrare: "Nessun documento trovato". */
  nothing: boolean
  filtering: boolean
}

/**
 * `own` null = chi guarda non è un residente (admin, super_admin): nessuna
 * sezione "I tuoi documenti", vista identica al Blocco 1.
 */
export function documentsPageView(
  builderItems: readonly ResidentDocItem[],
  own: readonly OwnDocItem[] | null,
  filters: PageFilters,
): DocumentsPageView {
  const term = filters.search.trim().toLocaleLowerCase('it')
  const filtering = filters.filter !== 'all' || term !== ''

  const builder = filters.filter === 'mine' ? null : filterResidentDocuments(builderItems, { category: filters.filter, search: filters.search })
  const builderState: DocumentsPageView['builderState'] =
    builder === null ? 'hidden'
      : builder.empty === 'none' && !filtering ? 'none'
        : builder.visible > 0 ? 'list'
          : 'hidden'

  const ownAll = own ?? []
  const showOwn = own !== null && (filters.filter === 'all' || filters.filter === 'mine')
  const ownVisible = showOwn ? ownAll.filter(i => term === '' || i.searchText.includes(term)) : []
  const ownState: OwnSectionState =
    !showOwn ? 'hidden'
      : ownAll.length === 0 && term === '' ? 'empty'
        : ownVisible.length > 0 ? 'list'
          : 'hidden'

  return {
    builderTotal: builderItems.length,
    ownTotal: ownAll.length,
    builder,
    builderState,
    own: { state: ownState, items: ownVisible, countLabel: pluralize(ownVisible.length, 'documento', 'documenti') },
    nothing: builderState === 'hidden' && ownState === 'hidden',
    filtering,
  }
}
