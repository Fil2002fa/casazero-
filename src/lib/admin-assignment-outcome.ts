/**
 * Esito della scrittura "invito admin → assegnazione alla residenza"
 * (accept-invite.ts, activateInvite). Modulo puro, verificato da
 * scripts/verify-admin-assignment.mjs.
 *
 * PERCHE' ESISTE: admin_assignments ha UNIQUE(residence_id) sul DB live (una
 * residenza, un solo admin) e NON ha UNIQUE(profile_id, residence_id): un upsert
 * con onConflict su quelle due colonne fallisce sempre con 42P10. Si scrive con
 * un INSERT e si distingue il conflitto di dominio dal guasto tecnico:
 *
 *  - nessun errore                      → 'assegnata'
 *  - 23505, la riga è dello stesso      → 'gia_assegnata' (successo, l'atto è
 *    profilo che accetta                   ripetibile: stesso esito di prima)
 *  - 23505, la riga è di un altro admin → 'altro_admin' (esito di dominio: un
 *                                          invito non sostituisce mai un admin)
 *  - 23505 ma la riga non si rilegge    → 'tecnico' (sparita fra le due letture)
 *  - qualunque altro errore             → 'tecnico'
 *
 * La rilettura della riga in conflitto la fa il chiamante, solo dopo un 23505.
 */

export const UNIQUE_VIOLATION = '23505'

export type AssignmentOutcome = 'assegnata' | 'gia_assegnata' | 'altro_admin' | 'tecnico'

export function classifyAssignmentWrite(input: {
  /** `error.code` dell'INSERT; null se la scrittura è riuscita. */
  errorCode: string | null
  /** profile_id della riga che occupa la residenza, riletto dopo un 23505; null se assente. */
  existingProfileId: string | null
  /** Chi accetta l'invito (sessione, mai input). */
  userId: string
}): AssignmentOutcome {
  const { errorCode, existingProfileId, userId } = input
  if (errorCode === null) return 'assegnata'
  if (errorCode !== UNIQUE_VIOLATION) return 'tecnico'
  if (existingProfileId === null) return 'tecnico'
  return existingProfileId === userId ? 'gia_assegnata' : 'altro_admin'
}
