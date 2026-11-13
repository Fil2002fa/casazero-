'use server'

/**
 * Scritture del residente sui SUOI documenti (059_resident_documents.sql).
 * Ogni action:
 *  - usa solo il client di sessione: RLS su resident_documents e sul bucket
 *    resident-documents è l'autorizzazione vera, il codice qui la anticipa per
 *    dare messaggi chiari;
 *  - ricava l'unità dalla membership attiva (getActiveUnitId), mai dal client;
 *  - non scarta mai `error` e distingue il fallimento tecnico dall'esito di
 *    dominio (CLAUDE.md).
 * Regole di tipo, dimensione, titolo e path: src/lib/resident-document-upload.ts.
 */
import { revalidatePath } from 'next/cache'
import type { ResidentDocMime } from '@/types/database'
import { createClient } from '@/lib/supabase/server'
import { requireCaller } from '@/lib/require-caller'
import { getActiveUnitId } from '@/lib/resident-active-unit.server'
import {
  MAGIC_BYTES_NEEDED,
  RESIDENT_DOC_BUCKET,
  RESIDENT_DOC_MAX_BYTES,
  RESIDENT_DOC_MAX_PER_UNIT,
  RESIDENT_DOC_TYPE_ERROR,
  isLowerUuid,
  isResidentDocKind,
  isResidentDocPathFor,
  matchesMagicBytes,
  residentDocDeclaredError,
  residentDocPath,
  sanitizeResidentDocTitle,
} from '@/lib/resident-document-upload'

type Fail = { ok: false; error: string }

const RETRY = 'Il caricamento non è riuscito. Riprova tra poco.'

/**
 * Passo 1 del caricamento: controlla tipo, dimensione dichiarata e tetto per
 * unità, poi firma un URL di upload per un path nuovo {unit_id}/{uuid}.{ext}.
 * La firma passa dalla policy INSERT del bucket (client di sessione): un path
 * fuori dalla cartella della propria unità non si firma.
 */
export async function createResidentUploadUrl(input: {
  docKind: unknown
  mimeType: unknown
  sizeBytes: unknown
}): Promise<{ ok: true; path: string; token: string } | Fail> {
  const action = 'createResidentUploadUrl'
  const caller = await requireCaller(action, ['client'])
  if ('error' in caller) return { ok: false, error: caller.error }

  if (!isResidentDocKind(input.docKind)) return { ok: false, error: 'Scegli che tipo di documento è.' }
  const mime = typeof input.mimeType === 'string' ? input.mimeType : null
  const size = typeof input.sizeBytes === 'number' ? input.sizeBytes : NaN
  const declaredError = residentDocDeclaredError(mime, size)
  if (declaredError) return { ok: false, error: declaredError }
  // residentDocDeclaredError ha già escluso i MIME fuori lista.
  const mimeType = mime as ResidentDocMime

  const supabase = await createClient()
  const unit = await getActiveUnitId(supabase, caller.userId, action)
  if ('error' in unit) return { ok: false, error: unit.error }

  // Tetto sui documenti VISIBILI dell'unità (RLS): quelli di un ex membro non
  // si vedono e non contano, così chi entra dopo una vendita non trova la
  // casa già piena di documenti che non può vedere né eliminare.
  const { count, error: countError } = await supabase
    .from('resident_documents')
    .select('id', { count: 'exact', head: true })
    .eq('unit_id', unit.unitId)
  if (countError || count === null) {
    console.error(`${action}: conteggio fallito`, { userId: caller.userId, unitId: unit.unitId, error: countError })
    return { ok: false, error: RETRY }
  }
  if (count >= RESIDENT_DOC_MAX_PER_UNIT) {
    return {
      ok: false,
      error: `Hai raggiunto il massimo di ${RESIDENT_DOC_MAX_PER_UNIT} documenti per questa casa. Eliminane uno per aggiungerne un altro.`,
    }
  }

  const path = residentDocPath(unit.unitId, crypto.randomUUID(), mimeType)
  if (!path) {
    console.error(`${action}: path non costruibile`, { unitId: unit.unitId })
    return { ok: false, error: RETRY }
  }

  const { data, error } = await supabase.storage.from(RESIDENT_DOC_BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    console.error(`${action}: firma upload fallita`, { userId: caller.userId, path, error })
    return { ok: false, error: RETRY }
  }
  return { ok: true, path, token: data.token }
}

/**
 * Passo 3 del caricamento (il 2 è uploadToSignedUrl dal browser): INSERT della
 * riga, poi controllo del file VERO nello storage, dimensione e magic bytes.
 * La lettura dell'oggetto è ammessa solo perché la riga ora esiste (policy
 * SELECT del bucket). Se il file non torna si rimuovono oggetto e riga, in
 * quest'ordine (la policy DELETE del bucket richiede la riga), e si esce con
 * un errore chiaro.
 */
export async function confirmResidentDocument(input: {
  path: unknown
  docKind: unknown
  title: unknown
  mimeType: unknown
  sizeBytes: unknown
}): Promise<{ ok: true; id: string } | Fail> {
  const action = 'confirmResidentDocument'
  const caller = await requireCaller(action, ['client'])
  if ('error' in caller) return { ok: false, error: caller.error }

  if (!isResidentDocKind(input.docKind)) return { ok: false, error: 'Scegli che tipo di documento è.' }
  const title = typeof input.title === 'string' ? sanitizeResidentDocTitle(input.title) : ''
  if (!title) return { ok: false, error: 'Scrivi un titolo per il documento.' }
  const mime = typeof input.mimeType === 'string' ? input.mimeType : null
  const size = typeof input.sizeBytes === 'number' ? input.sizeBytes : NaN
  const declaredError = residentDocDeclaredError(mime, size)
  if (declaredError) return { ok: false, error: declaredError }
  const mimeType = mime as ResidentDocMime

  const supabase = await createClient()
  const unit = await getActiveUnitId(supabase, caller.userId, action)
  if ('error' in unit) return { ok: false, error: unit.error }

  const path = typeof input.path === 'string' ? input.path : ''
  if (!isResidentDocPathFor(path, unit.unitId, mimeType)) {
    console.warn(`${action}: path non della propria unità`, { userId: caller.userId, unitId: unit.unitId, path })
    return { ok: false, error: RETRY }
  }

  // uploaded_by ha default auth.uid(); la policy INSERT lo pretende uguale a chi chiama.
  const { data: row, error: insertError } = await supabase
    .from('resident_documents')
    .insert({ unit_id: unit.unitId, doc_kind: input.docKind, title, storage_path: path, mime_type: mimeType, size_bytes: size })
    .select('id')
    .single()
  if (insertError || !row) {
    // Senza riga la policy DELETE del bucket non lascia rimuovere l'oggetto:
    // resta orfano (pulizia con service role, in backlog dalla 059).
    console.error(`${action}: INSERT fallito, oggetto lasciato orfano`, { userId: caller.userId, path, error: insertError })
    return {
      ok: false,
      error: insertError?.code === '23505' ? 'Questo documento è già stato salvato.' : RETRY,
    }
  }
  const id = row.id as string

  const { data: blob, error: downloadError } = await supabase.storage.from(RESIDENT_DOC_BUCKET).download(path)
  if (downloadError || !blob) {
    console.error(`${action}: file non leggibile dopo l'upload`, { userId: caller.userId, id, path, error: downloadError })
    return discardWith(supabase, action, id, path, 'Il file non è arrivato. Riprova a caricarlo.')
  }

  if (blob.size !== size || blob.size > RESIDENT_DOC_MAX_BYTES) {
    console.warn(`${action}: dimensione reale diversa`, { userId: caller.userId, id, declared: size, real: blob.size })
    return discardWith(supabase, action, id, path, 'Il file caricato non corrisponde a quello scelto. Riprova a caricarlo.')
  }

  const head = new Uint8Array(await blob.slice(0, MAGIC_BYTES_NEEDED).arrayBuffer())
  if (!matchesMagicBytes(mimeType, head)) {
    console.warn(`${action}: magic bytes non corrispondenti`, { userId: caller.userId, id, mimeType })
    return discardWith(supabase, action, id, path, `${RESIDENT_DOC_TYPE_ERROR} Il contenuto del file non corrisponde al suo tipo.`)
  }

  revalidatePath('/documenti')
  return { ok: true, id }
}

/**
 * Elimina un documento visibile (qualunque membro attivo dell'unità può, 059).
 * Prima l'oggetto, poi la riga: la policy DELETE del bucket richiede che la
 * riga esista, quindi l'ordine inverso lascerebbe un file non più eliminabile
 * dal residente. Se l'oggetto non si toglie, la riga resta e si riprova.
 */
export async function deleteResidentDocument(input: { id: unknown }): Promise<{ ok: true } | Fail> {
  const action = 'deleteResidentDocument'
  const caller = await requireCaller(action, ['client'])
  if ('error' in caller) return { ok: false, error: caller.error }
  if (!isLowerUuid(input.id)) return { ok: false, error: 'Documento non trovato.' }
  const id = input.id

  const supabase = await createClient()
  const { data: row, error: readError } = await supabase
    .from('resident_documents')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle()
  if (readError) {
    console.error(`${action}: lettura riga fallita`, { userId: caller.userId, id, error: readError })
    return { ok: false, error: 'Non è stato possibile eliminare il documento. Riprova tra poco.' }
  }
  if (!row) return { ok: false, error: 'Documento non trovato: forse è già stato eliminato.' }
  const path = row.storage_path as string

  const { error: removeError } = await supabase.storage.from(RESIDENT_DOC_BUCKET).remove([path])
  if (removeError) {
    console.error(`${action}: rimozione oggetto fallita, riga lasciata`, { userId: caller.userId, id, path, error: removeError })
    return { ok: false, error: 'Non è stato possibile eliminare il documento. Riprova tra poco.' }
  }

  const { data: deleted, error: deleteError } = await supabase.from('resident_documents').delete().eq('id', id).select('id')
  if (deleteError || !deleted || deleted.length !== 1) {
    // Oggetto già tolto: la riga resta senza file. Un nuovo tentativo la toglie
    // (remove su un oggetto che non c'è non è un errore).
    console.error(`${action}: rimozione riga fallita dopo l'oggetto`, { userId: caller.userId, id, deleted: deleted?.length ?? null, error: deleteError })
    revalidatePath('/documenti')
    return { ok: false, error: 'Il file è stato tolto ma il documento è ancora in elenco. Riprova a eliminarlo.' }
  }

  revalidatePath('/documenti')
  return { ok: true }
}

type ServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Toglie oggetto e riga di un caricamento rifiutato: prima l'oggetto (la
 * policy DELETE del bucket richiede che la riga esista), poi la riga. Ogni
 * errore è loggato; se la pulizia non riesce, il messaggio lo dice.
 */
async function discardWith(supabase: ServerClient, action: string, id: string, path: string, message: string): Promise<Fail> {
  const { error: removeError } = await supabase.storage.from(RESIDENT_DOC_BUCKET).remove([path])
  if (removeError) console.error(`${action}: rimozione oggetto fallita`, { id, path, error: removeError })

  // Una DELETE negata da RLS non dà errore ma 0 righe: si contano.
  const { data: deleted, error: deleteError } = await supabase.from('resident_documents').delete().eq('id', id).select('id')
  const rowLeft = Boolean(deleteError) || !deleted || deleted.length !== 1
  if (rowLeft) console.error(`${action}: rimozione riga fallita`, { id, deleted: deleted?.length ?? null, error: deleteError })

  revalidatePath('/documenti')
  if (removeError || rowLeft) {
    return { ok: false, error: `${message} Il documento potrebbe comparire nell’elenco: eliminalo da lì.` }
  }
  return { ok: false, error: message }
}
