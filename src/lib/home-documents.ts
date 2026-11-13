// Documenti della casa nella home residente: titolo leggibile e versioni raggruppate.
// Nessuna regola nuova: etichette da DOC_TYPE_LABELS (pagina Documenti), chiave di
// gruppo da reviewGroupKey (stessa del tab da rivedere: file_name + doc_type),
// data da displayDate (stessa della riga in /documenti).
import { DOC_TYPE_LABELS } from './document-classification'
import { reviewGroupKey } from './document-review'
import { displayDate, type DocRow } from './document-rows'
import { humanizeDocumentTitle } from './documentTitle'

// `docs`: tutte le versioni del gruppo, la più recente per prima (la pagina Documenti le elenca).
export type HomeDocGroup = { key: string; latest: DocRow; docs: DocRow[]; extra: number }

/** Un gruppo per file+tipo, col più recente (created_at, spareggio id); ordine: più recente prima. */
export function groupHomeDocuments(docs: readonly DocRow[]): HomeDocGroup[] {
  const newest = (a: DocRow, b: DocRow) => Date.parse(b.created_at) - Date.parse(a.created_at) || a.id.localeCompare(b.id)
  const byKey = new Map<string, DocRow[]>()
  for (const d of docs) {
    const k = reviewGroupKey(d)
    const list = byKey.get(k)
    if (list) list.push(d)
    else byKey.set(k, [d])
  }
  return [...byKey].map(([key, list]) => {
    const sorted = [...list].sort(newest)
    return { key, latest: sorted[0], docs: sorted, extra: sorted.length - 1 }
  }).sort((a, b) => newest(a.latest, b.latest))
}

/** Etichetta del tipo; senza tipo il titolo umanizzato; ultima riserva il nome file senza estensione. */
export function homeDocumentTitle(doc: Pick<DocRow, 'doc_type' | 'title' | 'file_name'>): string {
  if (doc.doc_type && DOC_TYPE_LABELS[doc.doc_type]) return DOC_TYPE_LABELS[doc.doc_type]
  const t = humanizeDocumentTitle(doc.title)
  if (t) return t
  return doc.file_name.replace(/\.[A-Za-z0-9]{1,5}$/, '')
}

export { displayDate }
