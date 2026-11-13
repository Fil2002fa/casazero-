/**
 * Unità attiva del residente, per le scritture sui suoi documenti. Viene SEMPRE
 * dalla membership (unit_members con ended_at nullo) letta col client di
 * sessione, mai da un valore inviato dal client.
 *
 * NON è un modulo 'use server' (vedi require-caller.ts): ogni export di un file
 * 'use server' diventerebbe una action chiamabile dal browser.
 *
 * Tre esiti distinti, mai collassati (bug class in CLAUDE.md):
 *  - errore tecnico nella lettura → "riprova";
 *  - nessuna membership attiva → "nessuna casa";
 *  - due o più membership attive → rifiuto esplicito: non si sceglie a caso in
 *    quale casa scrivere. (Con maybeSingle() sarebbe un errore generico: backlog (a).)
 */
import type { createClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createClient>>

export type ActiveUnit = { unitId: string } | { error: string }

export async function getActiveUnitId(supabase: ServerClient, userId: string, action: string): Promise<ActiveUnit> {
  const { data, error } = await supabase
    .from('unit_members')
    .select('unit_id')
    .eq('profile_id', userId)
    .is('ended_at', null)
    .limit(2)

  if (error) {
    console.error(`${action}: lettura membership fallita`, { userId, code: error.code, message: error.message })
    return { error: 'Non è stato possibile verificare la tua casa. Riprova tra poco.' }
  }
  if (!data || data.length === 0) {
    return { error: 'Il tuo account non è collegato a nessuna casa.' }
  }
  if (data.length > 1) {
    console.error(`${action}: più membership attive`, { userId, units: data.map(r => r.unit_id) })
    return { error: 'Il tuo account risulta collegato a più case. Contatta l’amministratore.' }
  }
  return { unitId: data[0].unit_id as string }
}
