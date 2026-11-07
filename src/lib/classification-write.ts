/**
 * Scritture di stato e mappatura degli esiti di /api/classify-document.
 *
 * Perché esiste: la route scriveva `documents` con `await admin.from(...).update(...)`
 * senza leggere `error`. Un update fallito diventava un 200 al client con il
 * documento fermo su 'in_corso', e 'in_corso' non rientra in nessuna coda
 * (pendingClassification prende solo 'non_classificato' e 'fallita'). Qui ogni
 * scrittura il cui esito condiziona la risposta controlla `error`, lo logga e
 * lo trasforma in un errore tecnico, mai in un esito di dominio.
 *
 * Il modulo non importa nulla di Next né dell'SDK Anthropic: la route gli passa
 * il client e dice se l'errore è di servizio, così lo script verify lo esegue
 * con un client finto.
 *
 * Esiti, con la causa che il client (batch-failures.ts) sa leggere:
 *   scrittura su documents fallita   500  write_error      → "errore tecnico nel salvataggio"
 *   download dallo storage fallito   500  storage_error    → "errore tecnico del server"
 *   servizio AI non disponibile      503  service_unavailable
 *   errore sul documento             502  document_error
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'

const LOG = '[classify-document]'

export const TECHNICAL_ERROR_MESSAGE = 'Errore tecnico, riprova'
export const WRITE_ERROR_MESSAGE = 'Errore tecnico nel salvataggio, riprova'

/** Scrittura su `documents` fallita: tecnico, mai 'fallita' del documento. */
export class ClassificationWriteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClassificationWriteError'
  }
}

/**
 * Lettura del file dallo storage fallita: tecnico. Il documento non c'entra
 * (il file esiste per costruzione), quindi mai 'fallita'.
 */
export class ClassificationStorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClassificationStorageError'
  }
}

export type ClassificationFailure = {
  status: 500 | 502 | 503
  body: { error: string; cause: 'write_error' | 'storage_error' | 'service_unavailable' | 'document_error' }
}

/** Risposta di una scrittura fallita fuori dal try della route (passo 'in_corso'). */
export const WRITE_ERROR_FAILURE: ClassificationFailure = {
  status: 500,
  body: { error: WRITE_ERROR_MESSAGE, cause: 'write_error' },
}

// --- sessione ---------------------------------------------------------------

export type SessionOutcome =
  | { kind: 'ok'; userId: string }
  | { kind: 'unauthenticated' }
  | { kind: 'technical'; message: string }

/**
 * Esito di `supabase.auth.getUser()`. Senza utente, un guasto del server di
 * autenticazione (rete, 502/503/504: AuthRetryableFetchError) è tecnico; ogni
 * altro caso (nessuna sessione, token non valido) è "non autenticato".
 * Stessa regola di api/documenti-xlsx.
 */
export function sessionOutcome(result: { user: { id: string } | null; error: unknown }): SessionOutcome {
  if (result.user) return { kind: 'ok', userId: result.user.id }
  if (result.error && isAuthRetryableFetchError(result.error)) {
    const message = result.error instanceof Error ? result.error.message : 'errore sconosciuto'
    return { kind: 'technical', message }
  }
  return { kind: 'unauthenticated' }
}

// --- scritture --------------------------------------------------------------

type DocumentUpdate = Record<string, unknown>

/** Scrive `documents`; con `error` logga e lancia ClassificationWriteError. */
export async function writeDocumentState(
  admin: SupabaseClient,
  documentId: string,
  values: DocumentUpdate,
  step: string,
): Promise<void> {
  const { error } = await admin.from('documents').update(values).eq('id', documentId)
  if (error) {
    console.error(`${LOG} scrittura documents fallita (${step}, documentId=${documentId}):`, error.message)
    throw new ClassificationWriteError(error.message)
  }
}

/**
 * Per i rollback: la scrittura è un tentativo di ripulire lo stato, l'esito
 * verso il client è già deciso. Un fallimento si logga (già dentro
 * writeDocumentState) e si riporta come false, senza sostituire l'errore
 * originale.
 */
async function tryWriteDocumentState(
  admin: SupabaseClient,
  documentId: string,
  values: DocumentUpdate,
  step: string,
): Promise<boolean> {
  try {
    await writeDocumentState(admin, documentId, values, step)
    return true
  } catch (err) {
    if (err instanceof ClassificationWriteError) return false
    throw err
  }
}

// --- storage ----------------------------------------------------------------

/** Scarica il file del documento; con `error` o blob assente lancia ClassificationStorageError. */
export async function downloadDocumentBuffer(admin: SupabaseClient, storagePath: string): Promise<ArrayBuffer> {
  const { data: fileBlob, error } = await admin.storage.from('documents').download(storagePath)
  if (error || !fileBlob) {
    throw new ClassificationStorageError(`Errore download storage: ${error?.message ?? 'sconosciuto'}`)
  }
  return fileBlob.arrayBuffer()
}

// --- esito di un errore nel try della route ----------------------------------

/**
 * Decide la risposta e lo stato in cui lasciare il documento, poi scrive lo
 * stato (tentativo, loggato se fallisce):
 *   - scrittura o storage fallito → 500, rollback a 'non_classificato' (il documento rientra in coda);
 *   - servizio AI non disponibile → 503, rollback a 'non_classificato';
 *   - qualunque altro errore      → 502, 'fallita'.
 * Mai un documento lasciato su 'in_corso' in silenzio.
 */
export async function handleClassificationFailure(
  admin: SupabaseClient,
  documentId: string,
  err: unknown,
  serviceUnavailable: boolean,
): Promise<ClassificationFailure> {
  const message = err instanceof Error ? err.message : 'Errore sconosciuto'

  if (err instanceof ClassificationWriteError) {
    // Già loggato in writeDocumentState.
    await tryWriteDocumentState(admin, documentId, { classification_status: 'non_classificato' }, 'rollback dopo scrittura fallita')
    return WRITE_ERROR_FAILURE
  }

  if (err instanceof ClassificationStorageError) {
    console.error(`${LOG} download storage fallito (documentId=${documentId}):`, message)
    await tryWriteDocumentState(admin, documentId, { classification_status: 'non_classificato' }, 'rollback dopo storage')
    return { status: 500, body: { error: TECHNICAL_ERROR_MESSAGE, cause: 'storage_error' } }
  }

  if (serviceUnavailable) {
    // Il servizio è il problema, non il documento: né stato zombie su
    // 'in_corso', né 'fallita' (che significherebbe "documento non
    // classificabile"). Rollback per farlo rientrare nella coda normale.
    console.error(`${LOG} servizio non disponibile (documentId=${documentId}):`, message)
    await tryWriteDocumentState(admin, documentId, { classification_status: 'non_classificato' }, 'rollback servizio non disponibile')
    return { status: 503, body: { error: message, cause: 'service_unavailable' } }
  }

  // Errore sul documento (parsing, schema non conforme, refusal): 'fallita',
  // mai output non validato scritto in doc_type.
  console.error(`${LOG} classificazione fallita (documentId=${documentId}):`, message)
  await tryWriteDocumentState(admin, documentId, { classification_status: 'fallita' }, 'stato fallita')
  return { status: 502, body: { error: message, cause: 'document_error' } }
}
