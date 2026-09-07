import type { SupabaseClient } from '@supabase/supabase-js'
import type { CompletionMode } from '@/types/database'

// Risoluzione dei destinatari di una notifica a partire dalla modalità di
// completamento di un item. Fonte di verità unica: oggi la stessa query è
// riscritta a mano in cron/daily/route.ts, admin/manutenzioni/actions.ts e
// api/report/route.ts, e getUserById è duplicata in tre file.
//
// TUTTE le funzioni qui richiedono un client SERVICE ROLE: leggono
// admin_assignments e unit_members senza lo scope di RLS, e auth.admin è
// disponibile solo al service role. Chi chiama ha già verificato i permessi.

/**
 * Un destinatario: profilo + email.
 *
 * L'email arriva SEMPRE da auth.users via auth.admin.getUserById, MAI da
 * profiles — che non ha colonna email e non deve averla (due fonti di verità).
 * Resta nullable perché auth.users può non esporla: il chiamante deve poter
 * registrare la notifica anche quando l'invio email non è possibile, invece di
 * perdere il destinatario per strada.
 */
export type Recipient = {
  profileId: string
  email: string | null
}

/**
 * Esito discriminato: il chiamante deve poter distinguere tre casi diversi.
 *
 * - 'ok' con `recipients` VUOTO → nessun destinatario configurato (unità senza
 *   account attivo, residenza senza admin assegnato). È un esito NORMALE da
 *   comunicare, non un'eccezione e non un errore.
 * - 'not_solicitable' → modalità promemoria (o modalità non risolta). Caso non
 *   ammesso per costruzione: una promemoria non è mai in ritardo, quindi non ha
 *   un destinatario da sollecitare. Rifiuto esplicito, non lista vuota.
 * - 'error' → la query è fallita davvero.
 */
export type RecipientLookup =
  | { status: 'ok'; recipients: Recipient[] }
  | { status: 'not_solicitable'; mode: CompletionMode | null }
  | { status: 'error'; message: string }

/**
 * Email di un profilo da auth.users. Unico punto di lettura: l'invariante
 * "mai da profiles" si difende qui, non in ogni chiamante.
 */
export async function getEmailForProfile(
  svc: SupabaseClient,
  profileId: string
): Promise<string | null> {
  const { data } = await svc.auth.admin.getUserById(profileId)
  return data?.user?.email ?? null
}

async function toRecipients(
  svc: SupabaseClient,
  profileIds: string[]
): Promise<Recipient[]> {
  const recipients: Recipient[] = []
  for (const profileId of profileIds) {
    recipients.push({ profileId, email: await getEmailForProfile(svc, profileId) })
  }
  return recipients
}

/**
 * Destinatari di un item `residente`: tutti gli account attivi dell'unità.
 * Sono 0..N — un'unità può avere più membri (nucleo familiare), quindi si
 * cicla, mai maybeSingle.
 *
 * `unitId` null (item a scope condominio configurato come residente) non ha
 * unità da cui risalire: nessun destinatario, esito 'ok' vuoto.
 */
export async function resolveResidentRecipients(
  svc: SupabaseClient,
  unitId: string | null
): Promise<RecipientLookup> {
  if (!unitId) return { status: 'ok', recipients: [] }

  const { data, error } = await svc
    .from('unit_members')
    .select('profile_id')
    .eq('unit_id', unitId)
    .is('ended_at', null)

  if (error) return { status: 'error', message: error.message }

  const ids = [...new Set((data ?? []).map(m => m.profile_id as string))]
  return { status: 'ok', recipients: await toRecipients(svc, ids) }
}

/**
 * Destinatari di un item `amministratore`: tutti gli admin assegnati alla
 * residenza. Anche qui 0..N: admin_assignments ha UNIQUE (profile_id,
 * residence_id), NON un vincolo di unicità per residenza, quindi due admin
 * sulla stessa residenza sono possibili. Si cicla come fa il cron; non si
 * copia il maybeSingle di residences/[id]/page.tsx, che assume cardinalità 1.
 */
export async function resolveAdminRecipients(
  svc: SupabaseClient,
  residenceId: string
): Promise<RecipientLookup> {
  const { data, error } = await svc
    .from('admin_assignments')
    .select('profile_id')
    .eq('residence_id', residenceId)

  if (error) return { status: 'error', message: error.message }

  const ids = [...new Set((data ?? []).map(a => a.profile_id as string))]
  return { status: 'ok', recipients: await toRecipients(svc, ids) }
}

/**
 * Dispatcher sulla modalità. Qui vive il rifiuto strutturale della promemoria:
 * il chiamante non deve mai dover ricordarsi di escluderla a mano.
 */
export async function resolveRecipientsForMode(
  svc: SupabaseClient,
  mode: CompletionMode | null,
  target: { unitId: string | null; residenceId: string }
): Promise<RecipientLookup> {
  if (mode === 'residente')      return resolveResidentRecipients(svc, target.unitId)
  if (mode === 'amministratore') return resolveAdminRecipients(svc, target.residenceId)
  return { status: 'not_solicitable', mode }
}
