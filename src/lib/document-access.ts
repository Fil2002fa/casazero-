/**
 * Autorizzazione di un utente ad agire su UN documento dietro service
 * client (route API che bypassano RLS e devono rifare lo scoping a mano):
 * super_admin del builder proprietario della residenza, oppure admin
 * assegnato a quella residenza.
 *
 * Stesso perimetro di classify-document (route.ts, blocco "Scoping builder")
 * e di api/report/route.ts:142-149, che quella route già segnala come
 * duplicazione consapevole da unificare "in un commit dedicato". Questa è la
 * fonte per il codice NUOVO (extract-document); le due copie esistenti non
 * sono state toccate — classify-document resta byte-identica per decisione
 * del 18/09 — e sono candidate a migrare qui in un commit di sola pulizia.
 *
 * Convenzione ereditata: entrambi i rami negativi rispondono 404 "Documento
 * non trovato", non 403, per non rivelare a un admin l'esistenza di
 * documenti fuori dalle sue residenze. Il 403 è riservato al ruolo sbagliato
 * (residente) e il 500 a un fallimento tecnico della lettura: `error` è
 * sempre destrutturato e loggato, mai collassato nell'esito di dominio
 * (bug class CLAUDE.md).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type ActorRole = 'super_admin' | 'admin'

export type DocumentForAction = {
  id: string
  title: string
  storage_path: string
  residence_id: string
  doc_type: string | null
  classification_status: string
}

export type DocumentActorResult =
  | { ok: true; doc: DocumentForAction; role: ActorRole }
  | { ok: false; status: 403 | 404 | 500; error: string }

export async function authorizeDocumentActor(
  admin: SupabaseClient,
  userId: string,
  documentId: string,
  logPrefix: string,
): Promise<DocumentActorResult> {
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role, builder_id')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    console.error(`${logPrefix} lettura profiles fallita (userId=${userId}):`, profileError.message)
    return { ok: false, status: 500, error: 'Errore tecnico, riprova' }
  }
  if (!profile || (profile.role !== 'super_admin' && profile.role !== 'admin')) {
    return { ok: false, status: 403, error: 'Permessi insufficienti' }
  }

  const { data: doc, error: docError } = await admin
    .from('documents')
    .select('id, title, storage_path, residence_id, doc_type, classification_status')
    .eq('id', documentId)
    .maybeSingle()

  if (docError) {
    console.error(`${logPrefix} lettura documents fallita (documentId=${documentId}):`, docError.message)
    return { ok: false, status: 500, error: 'Errore tecnico, riprova' }
  }
  if (!doc) return { ok: false, status: 404, error: 'Documento non trovato' }

  if (profile.role === 'super_admin') {
    const { data: residence, error: residenceError } = await admin
      .from('residences')
      .select('id')
      .eq('id', doc.residence_id)
      .eq('builder_id', profile.builder_id)
      .maybeSingle()

    if (residenceError) {
      console.error(`${logPrefix} lettura residences fallita (residenceId=${doc.residence_id}):`, residenceError.message)
      return { ok: false, status: 500, error: 'Errore tecnico, riprova' }
    }
    if (!residence) return { ok: false, status: 404, error: 'Documento non trovato' }
    return { ok: true, doc: doc as DocumentForAction, role: 'super_admin' }
  }

  const { count, error: assignmentError } = await admin
    .from('admin_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', userId)
    .eq('residence_id', doc.residence_id)

  if (assignmentError) {
    console.error(`${logPrefix} lettura admin_assignments fallita (residenceId=${doc.residence_id}):`, assignmentError.message)
    return { ok: false, status: 500, error: 'Errore tecnico, riprova' }
  }
  if (!count || count === 0) return { ok: false, status: 404, error: 'Documento non trovato' }
  return { ok: true, doc: doc as DocumentForAction, role: 'admin' }
}
