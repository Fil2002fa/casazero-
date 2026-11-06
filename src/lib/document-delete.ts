/**
 * Eliminazione di documenti (E1b, 7b): regole pure, senza client Supabase,
 * verificate da scripts/verify-document-delete.mjs. Le applicano le server
 * action checkDocumentsDeletable e deleteDocuments.
 *
 * PERCHE' IL BLOCCO E' QUI E NON NEL DB: supplier_installations.source_document_id
 * è ON DELETE SET NULL e attachments.document_id è ON DELETE CASCADE, quindi il
 * DB eliminerebbe senza protestare. Un documento che è la fonte di
 * un'installazione o che ha allegati non si elimina: si dice perché.
 *
 * Import relativi tra moduli di lib: vedi document-rows.ts.
 */
import { humanizeDocumentTitle } from './documentTitle'
import { namesList, type BulkAssignSummary } from './document-table'
import { pluralize } from './pluralize'

export const DELETE_MAX_DOCUMENTS = 50

/** Una sola frase per il bottone della barra e per il rifiuto dell'action. */
export function deleteLimitReason(count: number): string | null {
  if (count <= DELETE_MAX_DOCUMENTS) return null
  return `Si possono eliminare al massimo ${DELETE_MAX_DOCUMENTS} documenti alla volta: ne hai selezionati ${count}.`
}

// ------------------------------------------------------------
// Blocchi
// ------------------------------------------------------------

export type DeleteBlocker = {
  id: string
  title: string
  installations: number
  attachments: number
}

function countOf(ids: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
}

/**
 * I documenti che non si possono eliminare, nell'ordine di ingresso.
 * `installationDocIds` e `attachmentDocIds` hanno un elemento per riga trovata
 * (supplier_installations.source_document_id, attachments.document_id).
 */
export function findDeleteBlockers(
  docs: readonly { id: string; title: string }[],
  installationDocIds: readonly string[],
  attachmentDocIds: readonly string[],
): DeleteBlocker[] {
  const installations = countOf(installationDocIds)
  const attachments = countOf(attachmentDocIds)
  return docs
    .map(d => ({
      id: d.id,
      title: d.title,
      installations: installations.get(d.id) ?? 0,
      attachments: attachments.get(d.id) ?? 0,
    }))
    .filter(b => b.installations > 0 || b.attachments > 0)
}

/** Perché questo documento non si elimina: una frase senza soggetto. */
export function deleteBlockerReason(b: Pick<DeleteBlocker, 'installations' | 'attachments'>): string {
  const reasons: string[] = []
  if (b.installations > 0) {
    reasons.push(`è la fonte di ${pluralize(b.installations, 'installazione fornitore', 'installazioni fornitore')}`)
  }
  if (b.attachments > 0) {
    reasons.push(`ha ${pluralize(b.attachments, 'allegato collegato', 'allegati collegati')}`)
  }
  return reasons.join(' e ')
}

/** Il messaggio quando l'action rifiuta: nel multiplo non si elimina niente e si elencano tutti. */
export function deleteBlockedMessage(blockers: readonly DeleteBlocker[], requested: number): string {
  const list = blockers
    .map(b => `«${humanizeDocumentTitle(b.title)}» ${deleteBlockerReason(b)}`)
    .join('; ')
  return requested === 1 ? `Documento non eliminato: ${list}.` : `Nessun documento eliminato: ${list}.`
}

// ------------------------------------------------------------
// Registro attività (migrazione 053)
// ------------------------------------------------------------

export type DocumentSnapshot = {
  id: string
  title: string
  file_name: string
  doc_type: string | null
  sistema: string | null
  category: string
  unit_id: string | null
  file_date: string | null
  classification_status: string
  storage_path: string
  uploaded_by: string | null
  created_at: string
}

/** Colonne da leggere per lo snapshot: una sola fonte con il tipo sopra. */
export const DOCUMENT_SNAPSHOT_COLUMNS =
  'id, title, file_name, doc_type, sistema, category, unit_id, file_date, classification_status, storage_path, uploaded_by, created_at'

export type DocumentDeletedPayload = {
  document_id: string
  title: string
  file_name: string
  doc_type: string | null
  sistema: string | null
  category: string
  unit_id: string | null
  file_date: string | null
  classification_status: string
  storage_path: string
  uploaded_by: string | null
  document_created_at: string
}

/** Payload piatto dell'evento documento_eliminato: solo dati, mai frasi (contratto in 053). */
export function documentDeletedPayload(doc: DocumentSnapshot): DocumentDeletedPayload {
  return {
    document_id: doc.id,
    title: doc.title,
    file_name: doc.file_name,
    doc_type: doc.doc_type,
    sistema: doc.sistema,
    category: doc.category,
    unit_id: doc.unit_id,
    file_date: doc.file_date,
    classification_status: doc.classification_status,
    storage_path: doc.storage_path,
    uploaded_by: doc.uploaded_by,
    document_created_at: doc.created_at,
  }
}

export type FileRemovalReason = 'errore_storage' | 'file_non_rimosso'

export type DocumentFileNotRemovedPayload = {
  document_id: string
  title: string
  storage_path: string
  reason: FileRemovalReason
}

/** Payload dell'evento documento_file_non_rimosso (contratto in 053). */
export function documentFileNotRemovedPayload(doc: DocumentSnapshot, reason: FileRemovalReason): DocumentFileNotRemovedPayload {
  return { document_id: doc.id, title: doc.title, storage_path: doc.storage_path, reason }
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Frase a schermo. Il payload è JSONB non vincolato: null se manca il titolo (ripiego sull'etichetta neutra). */
export function documentDeletedText(payload: Record<string, unknown>): string | null {
  const title = str(payload.title)
  return title ? `Documento «${title}» eliminato` : null
}

export function documentFileNotRemovedText(payload: Record<string, unknown>): string | null {
  const title = str(payload.title)
  return title ? `File del documento eliminato «${title}» non rimosso dall’archivio` : null
}

// ------------------------------------------------------------
// Esito della rimozione dei file
// ------------------------------------------------------------

/**
 * Quali file non sono stati rimossi. Non basta guardare `error`: lo storage può
 * rispondere senza errore e con una lista più corta (policy che nega, file già
 * assente), quindi vale solo ciò che la risposta dice di aver rimosso.
 * `removedNames` null = la chiamata è fallita.
 */
export function fileRemovalFailures(
  paths: readonly string[],
  removedNames: readonly string[] | null,
): Map<string, FileRemovalReason> {
  const failures = new Map<string, FileRemovalReason>()
  if (removedNames === null) {
    for (const p of paths) failures.set(p, 'errore_storage')
    return failures
  }
  const removed = new Set(removedNames)
  for (const p of paths) if (!removed.has(p)) failures.set(p, 'file_non_rimosso')
  return failures
}

// ------------------------------------------------------------
// Riepilogo per il toast
// ------------------------------------------------------------

/**
 * Un solo messaggio a fine eliminazione, come Assegna unità e ZIP. I titoli sono
 * grezzi: li rende leggibili questa funzione.
 *
 * - notDeleted: righe che il DELETE non ha toccato (non più accessibili).
 * - notLogged: eliminati ma senza evento: il file resta, è l'unica traccia.
 * - filesLeft: eliminati e registrati, ma il file non si è rimosso.
 */
export function summarizeDocumentDelete(input: {
  deleted: number
  notDeleted: readonly string[]
  notLogged: readonly string[]
  filesLeft: readonly string[]
}): BulkAssignSummary {
  const { deleted, notDeleted, notLogged, filesLeft } = input
  const names = (titles: readonly string[]) => namesList(titles.map(humanizeDocumentTitle))

  const done = deleted === 0
    ? 'Nessun documento eliminato.'
    : `${pluralize(deleted, 'documento eliminato', 'documenti eliminati')}.`

  const problems: string[] = []
  if (notDeleted.length > 0) {
    problems.push(`Non eliminati perché non più accessibili: ${names(notDeleted)}.`)
  }
  if (notLogged.length > 0) {
    problems.push(`Eliminazione non registrata per ${names(notLogged)}: il file resta nell’archivio, segnalalo all’assistenza.`)
  }
  if (filesLeft.length > 0) {
    problems.push(`Il file di ${names(filesLeft)} è rimasto nell’archivio, segnalalo all’assistenza.`)
  }

  if (problems.length === 0) return { kind: 'success', message: done, persistent: false }
  return { kind: deleted === 0 ? 'error' : 'warning', message: `${done} ${problems.join(' ')}`, persistent: true }
}
