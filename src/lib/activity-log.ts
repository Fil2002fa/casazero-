import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActivityEventType, UserRole } from '@/types/database'

// Unico punto di scrittura del registro attività (tabella `activity_events`,
// migrazione 037). La tabella è append-only: non esistono policy UPDATE o
// DELETE, quindi ogni riga scritta qui è definitiva. Tutto ciò che questo
// helper accetta va trattato come irreversibile.
//
// ANTISPOOFING A CARICO DEL CHIAMANTE. La 037 dichiara policy INSERT con
// `actor_id = auth.uid()`, ma le scritture applicative passano dal client
// service role, che bypassa RLS e i GRANT (037_activity_events.sql:18-20):
// quelle policy NON proteggono questa strada. `actorId` deve quindi venire
// sempre dall'utente della sessione (`user.id` da `auth.getUser()`), mai da
// un parametro di input, da formData o da una query string.

/**
 * Ri-esportato per i chiamanti di scrittura, che importano tutto da qui. La
 * dichiarazione vive in `src/types/database.ts` accanto agli altri union
 * del DB, perché ora la stessa lista serve anche alla superficie di lettura:
 * due copie sarebbero due fonti di verità sullo stesso CHECK.
 */
export type { ActivityEventType }

/**
 * Valori ammessi dentro il payload: solo dati strutturati.
 *
 * Il tipo esclude oggetti e annidamenti, ma NON può escludere una stringa già
 * formattata per lo schermo — quel vincolo resta di disciplina, non di
 * compilazione. Vale comunque la regola della 037: nel payload vanno id,
 * codici, numeri e flag, mai frasi pronte da mostrare. Il registro è
 * immutabile, quindi una stringa di presentazione sbagliata resterebbe
 * sbagliata per sempre; la resa testuale è responsabilità della UI, che può
 * cambiare idea quante volte vuole.
 */
type PayloadValue = string | number | boolean | null | string[] | number[]
export type ActivityPayload = Record<string, PayloadValue>

export type ActivityEventInput = {
  /** Scope obbligatorio: nessun evento esiste fuori da una residenza. */
  residenceId: string
  /** Valorizzato per gli atti di unità, null per quelli condominiali. */
  unitId?: string | null
  eventType: ActivityEventType
  /**
   * Chi ha compiuto l'atto. I tre campi sono CONGELATI al momento della
   * scrittura: si passano espliciti e non vengono mai risolti da `profiles` in
   * lettura, né qui né a display. Un registro storico non deve cambiare di
   * senso quando la persona cambia nome o ruolo dopo.
   *
   * Il vincolo è più forte di quello di `completions.performed_by_name`, che
   * la 037 cita come precedente ma che oggi arriva da un campo digitato
   * dall'utente nel form: qui il nome è letto lato server al momento dell'atto
   * e poi congelato, quindi non è influenzabile dal client.
   *
   * Tutti e tre restano nullable perché la 037 li ammette null per gli atti
   * non umani (cron, sistema).
   */
  actorId: string | null
  actorRole: UserRole | null
  actorName: string | null
  payload?: ActivityPayload
}

/**
 * Scrive una riga nel registro. Richiede un client SERVICE ROLE.
 *
 * NON solleva mai e non restituisce esito: il registro documenta un atto che
 * a questo punto è già avvenuto ed è irreversibile (un'email partita, un admin
 * rimosso). Trasformare il fallimento della riga di registro nel fallimento
 * dell'azione peggiorerebbe le cose — l'atto resterebbe compiuto e il
 * chiamante riceverebbe un errore falso. Il fallimento va quindi a console,
 * dove il monitoraggio lo può vedere, e l'azione prosegue.
 */
export async function logActivityEvent(
  svc: SupabaseClient,
  input: ActivityEventInput
): Promise<void> {
  const { error } = await svc.from('activity_events').insert({
    residence_id: input.residenceId,
    unit_id: input.unitId ?? null,
    event_type: input.eventType,
    actor_id: input.actorId,
    actor_role: input.actorRole,
    actor_name: input.actorName,
    payload: input.payload ?? {},
  })

  if (error) {
    console.error('[ACTIVITY LOG]', input.eventType, error.message)
  }
}
