'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { DocumentCategory } from '@/types/database'
import { ALLOWED_DOCUMENT_MIME } from '@/lib/document-upload'
import { DOC_TYPES, SISTEMI, type DocType, type Sistema } from '@/lib/document-classification'
import { computeResidenceChecklist } from '@/lib/document-checklist'

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

// L'id torna al client per l'auto-classificazione post-upload (B4): il
// client deve sapere ESATTAMENTE quali righe ha appena creato, senza
// indovinarle da un refresh dei props (timing non affidabile).
export type ConfirmDocumentResult = { success: true; id: string } | { error: string }

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

  const { data: inserted, error: dbError } = await supabase
    .from('documents')
    .insert({
      residence_id: residenceId,
      unit_id: unitId,
      category,
      title,
      storage_path: storagePath,
      file_name: fileName,
      file_date: fileDate || new Date().toISOString().split('T')[0],
      uploaded_by: auth.user.id,
    })
    .select('id')
    .single()

  if (dbError || !inserted) {
    // Cleanup file orfano se l'insert DB fallisce
    await supabase.storage.from('documents').remove([storagePath])
    return { error: `Errore salvataggio: ${dbError?.message ?? 'sconosciuto'}` }
  }

  revalidatePath(`/admin/residences/${residenceId}/documenti`)
  return { success: true, id: inserted.id as string }
}

export type ConfirmClassificationResult = { success: true } | { error: string }

// Conferma umana della classificazione AI (decisione #7: l'AI propone, l'umano
// decide). È l'UNICO punto che scrive reviewed_by/reviewed_at, e li scrive
// SERVER-SIDE (auth.user.id + now()), mai da valori passati dal client. Usa il
// client scoped-utente: la policy RLS "documents: admin e super_admin
// gestiscono" (002_rls.sql) autorizza l'UPDATE solo al super_admin del builder
// proprietario — il residente non ha alcuna policy di scrittura su documents.
//
// sistema = verità confermata dell'impianto (OPZIONE B, B4): scritta nella
// colonna dedicata, mai in extracted_metadata (che resta il verbale immutabile
// della proposta AI e NON va riallineato). null = nessun impianto specifico.
export async function confirmClassification(input: {
  documentId: string
  docType: DocType
  sistema: Sistema | null
}): Promise<ConfirmClassificationResult> {
  const supabase = await createClient()
  const auth = await getAuthorizedSuperAdmin(supabase)
  if ('error' in auth) return { error: auth.error }

  const { documentId, docType, sistema } = input
  if (!documentId || !(DOC_TYPES as string[]).includes(docType)) {
    return { error: 'Parametri non validi' }
  }
  if (sistema !== null && !(SISTEMI as string[]).includes(sistema)) {
    return { error: 'Parametri non validi' }
  }

  const { data, error } = await supabase
    .from('documents')
    .update({
      doc_type: docType,
      sistema,
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

export type ChecklistExceptionResult = { success: true } | { error: string }

// Verifica che una expectation_key corrisponda a un'attesa REALE e corrente
// della residenza (BASE+DERIVATO, ricalcolate ora) — non solo "ben formata".
// La funzione privata expectationKey di document-checklist.ts non basta e
// non va esportata per questo: verificare il FORMATO di una chiave non dice
// nulla su se quell'attesa esiste ancora oggi per questa residenza (B4 C5
// FASE 0, punto 3 — rischio di chiave orfana su cambi futuri della mappa).
// Riusata da entrambe le action sotto.
async function expectationKeyExists(
  supabase: Awaited<ReturnType<typeof createClient>>,
  residenceId: string,
  expectationKey: string
): Promise<boolean> {
  const checklist = await computeResidenceChecklist(supabase, residenceId)
  return checklist.expectations.some(e => e.expectationKey === expectationKey)
}

// Segna una voce della checklist di consegna come non applicabile (B4 C5b).
// unit_id sempre NULL in v1 (nessuno scope per-unità, decisione B4 C4).
// Upsert idempotente sul vincolo UNIQUE NULLS NOT DISTINCT (residence_id,
// expectation_key, unit_id) di residence_checklist_exception (027) — stesso
// pattern onConflict di admin-actions.ts:26 e welcome/[token]/accept/page.tsx:66.
export async function setChecklistException(
  residenceId: string,
  expectationKey: string,
  input: { note: string | null; expectedFrom: string | null }
): Promise<ChecklistExceptionResult> {
  const supabase = await createClient()
  const auth = await getAuthorizedSuperAdmin(supabase)
  if ('error' in auth) return { error: auth.error }

  if (!residenceId || !expectationKey) {
    return { error: 'Parametri obbligatori mancanti' }
  }

  if (!(await expectationKeyExists(supabase, residenceId, expectationKey))) {
    return { error: 'Voce non trovata tra le attese correnti della residenza' }
  }

  // Stringa vuota → null, mai stringa vuota nel DB.
  const note = input.note?.trim() || null
  const expectedFrom = input.expectedFrom?.trim() || null

  const { error } = await supabase
    .from('residence_checklist_exception')
    .upsert(
      {
        residence_id: residenceId,
        expectation_key: expectationKey,
        unit_id: null,
        not_applicable: true,
        note,
        expected_from: expectedFrom,
        created_by: auth.user.id,
      },
      { onConflict: 'residence_id,expectation_key,unit_id' }
    )

  if (error) return { error: `Errore salvataggio: ${error.message}` }

  revalidatePath(`/admin/residences/${residenceId}/documenti`)
  return { success: true }
}

// Annulla il "non applicabile": la voce torna mancante. MAI un DELETE — note
// ed expected_from si conservano (decisione B4 C5 #6, chiusa), la riga resta
// come traccia della configurazione. Stesso pattern RLS-filtra-in-silenzio
// di confirmClassification sopra: .select() dopo l'update, zero righe =
// eccezione non trovata o non accessibile.
export async function clearChecklistException(
  residenceId: string,
  expectationKey: string
): Promise<ChecklistExceptionResult> {
  const supabase = await createClient()
  const auth = await getAuthorizedSuperAdmin(supabase)
  if ('error' in auth) return { error: auth.error }

  if (!residenceId || !expectationKey) {
    return { error: 'Parametri obbligatori mancanti' }
  }

  // Nessun ricalcolo qui: a differenza di setChecklistException, questa
  // action non scrive una riga nuova da input del client, agisce solo su
  // una riga già esistente. L'UPDATE con .select() sotto, zero righe = già
  // la difesa completa (chiave inesistente, residenza altrui, riga assente
  // finiscono tutte nello stesso errore, senza bisogno di ricalcolare la
  // checklist prima).
  const { data, error } = await supabase
    .from('residence_checklist_exception')
    .update({ not_applicable: false })
    .eq('residence_id', residenceId)
    .eq('expectation_key', expectationKey)
    .is('unit_id', null)
    .select('id')

  if (error) return { error: `Errore salvataggio: ${error.message}` }
  if (!data || data.length === 0) {
    return { error: 'Eccezione non trovata o non accessibile' }
  }

  revalidatePath(`/admin/residences/${residenceId}/documenti`)
  return { success: true }
}
