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
import type { ResidentDocMime } from '@/types/database'
import { createClient } from '@/lib/supabase/server'
import { requireCaller } from '@/lib/require-caller'
import { getActiveUnitId } from '@/lib/resident-active-unit.server'
import {
  RESIDENT_DOC_BUCKET,
  RESIDENT_DOC_MAX_PER_UNIT,
  isResidentDocKind,
  residentDocDeclaredError,
  residentDocPath,
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
