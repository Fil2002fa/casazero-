'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { DocumentCategory } from '@/types/database'
import { ALLOWED_DOCUMENT_MIME } from '@/lib/document-upload'
import { DOC_TYPES, type DocType } from '@/lib/document-classification'

type AuthorizedUser = { user: { id: string } }
type AuthError = { error: string }

// Unica fonte di verità per il controllo ruolo di questa superficie
// (upload documenti da dashboard, oggi solo super_admin): riusata da
// tutte le server action del file invece di ricalcolare il check.
async function getAuthorizedSuperAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<AuthorizedUser | AuthError> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'super_admin') {
    return { error: 'Permessi insufficienti' }
  }

  return { user }
}

// Unica fonte di verità per il path storage di un documento: stesso
// pattern per upload server-side (sopra) e client-direct (sotto), la
// 022 lo assume per estrarre residenceId dal 1° segmento del path.
function buildDocumentStoragePath(residenceId: string, category: DocumentCategory, fileName: string) {
  const ext = fileName.split('.').pop() ?? 'bin'
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '')
  const safeTitle = nameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
  return {
    storagePath: `${residenceId}/${category}/${Date.now()}_${safeTitle}.${ext}`,
    nameWithoutExt,
  }
}

// ============================================================
// Upload client-direct (B1). uploadDocumentiAdmin (upload monolitico
// server-side) è stata rimossa in questo commit: DocumentiClient ora
// chiama queste due action, zero altri chiamanti rimasti (verificato
// con grep prima della rimozione — la PWA usa uploadDocument, funzione
// separata in un altro file, mai toccata).
//
// createUploadUrl genera la signed upload URL: qui, e solo qui,
// viene verificata l'autorizzazione — la chiamata a
// createSignedUploadUrl richiede il permesso INSERT su
// storage.objects (022_storage_documents_scoped_rls.sql), quindi il
// client scoped-utente usato qui fa rispettare la stessa policy
// scoped-residenza di oggi. Il successivo uploadToSignedUrl dal
// browser non richiede permessi RLS aggiuntivi (il token è l'unica
// credenziale) — prova nel docstring di
// @supabase/storage-js/src/packages/StorageFileApi.ts:268-272 e
// 374-378, non nei docs pubblici che sono ambigui su questo punto.
// ============================================================

export type SignedUploadUrlResult =
  | { signedUrl: string; token: string; path: string }
  | { error: string }

export async function createUploadUrl(
  residenceId: string,
  category: DocumentCategory,
  fileName: string,
  contentType: string
): Promise<SignedUploadUrlResult> {
  const supabase = await createClient()
  const auth = await getAuthorizedSuperAdmin(supabase)
  if ('error' in auth) return { error: auth.error }

  if (!residenceId || !category || !fileName) {
    return { error: 'Parametri obbligatori mancanti' }
  }
  if (!ALLOWED_DOCUMENT_MIME.has(contentType)) {
    return { error: 'Tipo file non supportato (PDF, immagini, Word)' }
  }

  const { storagePath } = buildDocumentStoragePath(residenceId, category, fileName)

  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUploadUrl(storagePath)

  if (error || !data) {
    return { error: `Errore generazione URL: ${error?.message ?? 'sconosciuto'}` }
  }

  return { signedUrl: data.signedUrl, token: data.token, path: data.path }
}

export type ConfirmDocumentResult = { success: true } | { error: string }

export type ConfirmDocumentInput = {
  residenceId: string
  unitId: string | null
  category: DocumentCategory
  title: string
  storagePath: string
  fileName: string
  fileDate: string | null
}

// Stesso pattern di public.czero_storage_first_uuid (022): il 1° segmento
// del path deve essere uno UUID, altrimenti si tratta un path malformato
// come "nessuna residenza" invece di far esplodere un parse di UUID.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function residenceIdFromStoragePath(storagePath: string): string | null {
  const [first] = storagePath.split('/')
  return UUID_RE.test(first) ? first : null
}

// Il client ha già caricato il file con la signed URL prima di chiamare
// questa action: qui si verifica che l'oggetto esista davvero (invece
// di fidarsi del client) e poi si scrive la riga documents. L'upload e
// la riga DB sono due chiamate separate: se la conferma non arriva mai
// (tab chiuso, rete caduta), il file resta un orfano in storage senza
// una riga documents
// — nessun errore da intercettare, nessuna riga "pending" introdotta di
// proposito (deciso in FASE 0: niente nuovo invariante di filtro per
// proteggere file orfani innocui). La riconciliazione bucket↔tabella
// è uno script a mano (commit successivo del piano B1), non un cron.
export async function confirmDocument(input: ConfirmDocumentInput): Promise<ConfirmDocumentResult> {
  const supabase = await createClient()
  const auth = await getAuthorizedSuperAdmin(supabase)
  if ('error' in auth) return { error: auth.error }

  const { residenceId, unitId, category, title, storagePath, fileName, fileDate } = input
  if (!residenceId || !category || !storagePath || !title) {
    return { error: 'Parametri obbligatori mancanti' }
  }

  // Un utente autorizzato su più residenze potrebbe (per bug client o
  // in mala fede) passare un residenceId diverso dalla residenza reale
  // codificata nel path: senza questo controllo la RLS tabella e la
  // .list() sopra passerebbero comunque, creando una riga visibile in
  // una residenza ma con un path che punta a un'altra — stessa famiglia
  // di bug della legge "categoria dal DB, mai dal path" (022, footer).
  const pathResidenceId = residenceIdFromStoragePath(storagePath)
  if (!pathResidenceId || pathResidenceId.toLowerCase() !== residenceId.toLowerCase()) {
    return { error: 'Percorso storage incoerente con la residenza indicata' }
  }

  const lastSlash = storagePath.lastIndexOf('/')
  const folder = storagePath.slice(0, lastSlash)
  const objectName = storagePath.slice(lastSlash + 1)
  const { data: listing } = await supabase.storage
    .from('documents')
    .list(folder, { search: objectName })

  if (!listing?.some(o => o.name === objectName)) {
    return { error: 'File non trovato in storage: upload non completato' }
  }

  const { error: dbError } = await supabase.from('documents').insert({
    residence_id: residenceId,
    unit_id: unitId,
    category,
    title,
    storage_path: storagePath,
    file_name: fileName,
    file_date: fileDate || new Date().toISOString().split('T')[0],
    uploaded_by: auth.user.id,
  })

  if (dbError) {
    // Cleanup file orfano se l'insert DB fallisce
    await supabase.storage.from('documents').remove([storagePath])
    return { error: `Errore salvataggio: ${dbError.message}` }
  }

  revalidatePath(`/admin/residences/${residenceId}/documenti`)
  return { success: true }
}

export type ConfirmClassificationResult = { success: true } | { error: string }

// Conferma umana della classificazione AI (decisione #7: l'AI propone, l'umano
// decide). È l'UNICO punto che scrive reviewed_by/reviewed_at, e li scrive
// SERVER-SIDE (auth.user.id + now()), mai da valori passati dal client. Usa il
// client scoped-utente: la policy RLS "documents: admin e super_admin
// gestiscono" (002_rls.sql) autorizza l'UPDATE solo al super_admin del builder
// proprietario — il residente non ha alcuna policy di scrittura su documents.
export async function confirmClassification(input: {
  documentId: string
  docType: DocType
}): Promise<ConfirmClassificationResult> {
  const supabase = await createClient()
  const auth = await getAuthorizedSuperAdmin(supabase)
  if ('error' in auth) return { error: auth.error }

  const { documentId, docType } = input
  if (!documentId || !(DOC_TYPES as string[]).includes(docType)) {
    return { error: 'Parametri non validi' }
  }

  const { data, error } = await supabase
    .from('documents')
    .update({
      doc_type: docType,
      classification_status: 'completata',
      reviewed_by: auth.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', documentId)
    .select('residence_id')

  if (error) return { error: `Errore salvataggio: ${error.message}` }
  // RLS può filtrare la riga senza errore se il documento è fuori dallo scope
  // del super_admin: nessuna riga aggiornata.
  if (!data || data.length === 0) {
    return { error: 'Documento non trovato o non accessibile' }
  }

  revalidatePath(`/admin/residences/${data[0].residence_id}/documenti`)
  return { success: true }
}
