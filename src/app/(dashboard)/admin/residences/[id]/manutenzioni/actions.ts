'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { resolveRecipientsForMode, getItemLinkRoles, linkRoleFor } from '@/lib/notification-recipients'
import { sendEmail, emailSollecito, maintenanceItemUrl } from '@/lib/notifications'
import { logActivityEvent } from '@/lib/activity-log'
import { OBLIGATION_LABELS } from '@/components/MaintenanceBadge'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import {
  isOverdueLive, resolveCompletionMode, resolveObligationType, todayISO,
  LIVE_STATUS_FIELDS, LIVE_STATUS_TEMPLATE_FIELDS,
  type LiveStatusItem,
} from '@/lib/maintenance-status'
import type { ObligationType } from '@/types/database'
import { revalidatePath } from 'next/cache'
import { authorizeResidenceActor } from '@/lib/document-access'
import { ITEM_CONFIG_TEMP_ERROR } from '@/lib/itemConfigMessages'
import {
  planConfigWrite, validateConfigChanges,
  type ConfigItem, type ConfigPlanSummary, type PlannedFields,
} from '@/lib/maintenance-config'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

// Nomenclatura v2: nessuna eredità dalla famiglia n1_due/n2_reminder/n3_reminder,
// che resta in produzione come debito registrato. notifications.type è TEXT
// libero, quindi questo valore non richiede migrazione.
const NOTIFICATION_TYPE = 'sollecito_manuale'

// Anti-spam per item + destinatario, NON per solo item: se l'invio a un
// destinatario fallisce, un secondo tentativo deve poter ripartire sull'altro.
// Stesso pattern di checkDedup nel cron, ma non la sua funzione: quella è
// privata del cron e ha finestre sue (14/30 giorni).
const DEDUP_WINDOW_HOURS = 24

/** Come è finita per un singolo destinatario. Va in payload.delivery. */
type Delivery = 'sent' | 'simulated' | 'failed' | 'no_email'

export type SollecitoOutcome = {
  /** Email accettata dal provider. */
  sent: number
  /** Nessuna RESEND_API_KEY: solo log, nulla è partito. Mai contato come sent. */
  simulated: number
  /** Invio tentato e fallito. */
  failed: number
  /** Nessuna email su auth.users: riga registrata, nessun invio. Dato mancante, non errore. */
  withoutEmail: number
  /** Già sollecitato nelle ultime 24h. */
  skipped: number
}

export type SollecitoResult =
  | { status: 'ok'; outcome: SollecitoOutcome }
  | { status: 'no_recipients' }
  | { status: 'not_solicitable' }
  | { status: 'not_overdue' }
  | { status: 'forbidden' }
  | { status: 'error'; message: string }

type ItemForSollecito = LiveStatusItem & {
  id: string
  unit_id: string | null
  residence_id: string
  obligation_type: ObligationType | null
  maintenance_templates: LiveStatusItem['maintenance_templates'] & {
    title: string
    obligation_type: ObligationType | null
  }
  units: { label: string } | null
  residences: { name: string; builder_id: string } | null
}

/**
 * Sollecita l'esecuzione di una manutenzione in ritardo.
 *
 * Non tocca in alcun modo `completions`: il fascicolo resta immutabile. Non
 * cambia lo stato dell'item: scrive solo righe in `notifications` e invia email.
 */
export async function sollecitaItem(itemId: string): Promise<SollecitoResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'forbidden' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, builder_id, full_name')
    .eq('id', user.id)
    .single()
  if (!profile) return { status: 'forbidden' }

  const svc = createServiceClient()

  const { data: raw } = await svc
    .from('maintenance_items')
    .select(`
      id, unit_id, residence_id, obligation_type, ${LIVE_STATUS_FIELDS},
      maintenance_templates!inner(title, obligation_type, ${LIVE_STATUS_TEMPLATE_FIELDS}),
      units(label),
      residences!inner(name, builder_id)
    `)
    .eq('id', itemId)
    .single()

  if (!raw) return { status: 'error', message: 'Manutenzione non trovata' }
  const item = raw as unknown as ItemForSollecito

  const mode = resolveCompletionMode(item)

  // Gemello di src/app/api/report/route.ts:142-149 e di
  // src/app/api/classify-document/route.ts:134-150 (autorizzazione
  // admin-su-residenza dietro service client). Duplicazione consapevole:
  // l'helper condiviso ora esiste (authorizeResidenceActor in
  // src/lib/document-access.ts, già usato da fascicolo-pdf); migrare qui in
  // un commit di sola pulizia.
  if (profile.role === 'super_admin') {
    if (item.residences?.builder_id !== profile.builder_id) return { status: 'forbidden' }
  } else if (profile.role === 'admin') {
    const { count } = await svc
      .from('admin_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', user.id)
      .eq('residence_id', item.residence_id)
    if (!count || count === 0) return { status: 'forbidden' }
    // Sugli item amministratore il destinatario sarebbe l'admin stesso.
    if (mode !== 'residente') return { status: 'forbidden' }
  } else {
    return { status: 'forbidden' }
  }

  // Una promemoria non è mai in ritardo, quindi non ha nulla da sollecitare:
  // rifiuto per chiunque, sempre. Il resolver lo ribadisce strutturalmente.
  if (mode === 'promemoria' || mode === null) return { status: 'not_solicitable' }

  // Ritardo calcolato live, mai dalla colonna status. isOverdueLive copre anche
  // item archiviati e template disattivati a catalogo (isCountable).
  if (!isOverdueLive(item)) return { status: 'not_overdue' }

  const lookup = await resolveRecipientsForMode(svc, mode, {
    unitId: item.unit_id,
    residenceId: item.residence_id,
  })
  if (lookup.status === 'error') return { status: 'error', message: lookup.message }
  if (lookup.status === 'not_solicitable') return { status: 'not_solicitable' }
  if (lookup.recipients.length === 0) return { status: 'no_recipients' }

  const title = item.maintenance_templates.title
  const obligation = resolveObligationType(item)
  const dueDate = item.next_due_date
    ? new Date(item.next_due_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'
  // Le due shell hanno percorsi diversi per la stessa manutenzione: il link si
  // sceglie per ruolo del destinatario (maintenanceItemUrl), quindi l'email si
  // costruisce per ogni destinatario. Ruolo di ripiego, solo se la lettura dei
  // ruoli fallisce (già loggata): quello che la modalità della voce implica.
  const buildHtml = (actionUrl: string) => emailSollecito({
    title,
    obligationLabel: obligation ? OBLIGATION_LABELS[obligation] : null,
    residenceName: item.residences?.name ?? 'la residenza',
    unitLabel: item.units ? formatUnitLabel(item.units.label) : null,
    dueDate,
    actionUrl,
  })
  const fallbackRole = mode === 'residente' ? 'client' : 'admin'
  const recipientRoles = await getItemLinkRoles(svc, lookup.recipients.map(r => r.profileId), item.residence_id)
  const subject = `Sollecito: "${title}" non ancora eseguita`

  const cutoff = new Date(Date.now() - DEDUP_WINDOW_HOURS * 3600_000).toISOString()
  const outcome: SollecitoOutcome = { sent: 0, simulated: 0, failed: 0, withoutEmail: 0, skipped: 0 }

  // Un id per email accettata dal provider, quindi potenzialmente più di uno:
  // il sollecito è un atto solo ma i destinatari possono essere N. Raccoglie
  // SOLO gli invii riusciti — un 'simulated' non ha id e un 'failed' nemmeno.
  const messageIds: string[] = []

  for (const recipient of lookup.recipients) {
    const { count } = await svc
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('type', NOTIFICATION_TYPE)
      .eq('profile_id', recipient.profileId)
      .filter('payload->>item_id', 'eq', itemId)
      .gte('created_at', cutoff)

    if ((count ?? 0) > 0) {
      outcome.skipped++
      continue
    }

    let delivery: Delivery
    if (!recipient.email) {
      delivery = 'no_email'
      outcome.withoutEmail++
    } else {
      const actionUrl = maintenanceItemUrl(APP_URL, linkRoleFor(recipientRoles, recipient.profileId, fallbackRole), itemId)
      const res = await sendEmail({ to: recipient.email, subject, html: buildHtml(actionUrl) })
      delivery = res.status === 'sent' ? 'sent' : res.status === 'simulated' ? 'simulated' : 'failed'
      if (res.status === 'sent') {
        outcome.sent++
        // Narrowing su res.status e non su delivery: solo il ramo 'sent' di
        // EmailResult espone l'id. Resta null quando Resend non lo restituisce
        // (notifications.ts:52), e in quel caso non finisce nell'array.
        if (res.id) messageIds.push(res.id)
      } else if (delivery === 'simulated') {
        outcome.simulated++
      } else {
        outcome.failed++
      }
    }

    // Una riga per destinatario, mai un record cumulativo. status e sent_at
    // valorizzati davvero: 'sent' solo quando l'email è partita per davvero,
    // quindi né 'simulated' né 'no_email' possono passare per un successo.
    // payload.delivery conserva il dettaglio a quattro valori che l'enum a tre
    // di notification_status non può esprimere.
    const sent = delivery === 'sent'
    await svc.from('notifications').insert({
      profile_id: recipient.profileId,
      type: NOTIFICATION_TYPE,
      payload: {
        item_id: itemId,
        title,
        due_date: item.next_due_date,
        residence_id: item.residence_id,
        mode,
        delivery,
      },
      channel: 'email',
      status: sent ? 'sent' : 'failed',
      sent_at: sent ? new Date().toISOString() : null,
    })
  }

  // Una riga per ATTO, non per destinatario, e per questo fuori dal loop: il
  // dettaglio di consegna per-destinatario esiste già in `notifications`, che
  // resta intatta come ledger di consegna. Il registro documenta che il
  // sollecito è stato fatto, non com'è andata a ciascuno.
  //
  // Condizionata a sent > 0: se nessuna email è partita davvero — tutti
  // skipped dall'anti-spam, tutti senza indirizzo, o tutti simulated in
  // assenza di RESEND_API_KEY — non c'è nessun atto da registrare. Un registro
  // che dice "inviato" quando non è partito nulla è peggio di nessun registro,
  // e la tabella è append-only: la riga sbagliata non si toglie più.
  if (outcome.sent > 0) {
    // Giorni di ritardo calcolati qui e non in un helper condiviso: il valore
    // serve a questa sola superficie, quindi la regola della fonte di verità
    // unica non si applica. Stessa aritmetica di formatRelativeDue
    // (maintenance-status.ts:201-206), con le due date normalizzate a
    // mezzanotte per non contare un giorno di troppo per effetto dell'ora.
    //
    // Il ternario non è difensivo per abitudine: senza, un next_due_date null
    // produrrebbe NaN, e NaN in una tabella immutabile è un dato sbagliato per
    // sempre. Il ramo null non è raggiungibile qui — isOverdueLive a :129 ha
    // già preteso next_due_date non null e minore di oggi, quindi il numero è
    // sempre >= 1 — ma il costo di garantirlo è una riga.
    const daysLate = item.next_due_date
      ? Math.round(
          (new Date(`${todayISO()}T00:00:00`).getTime() -
            new Date(`${item.next_due_date}T00:00:00`).getTime()) / 86_400_000
        )
      : null

    await logActivityEvent(svc, {
      residenceId: item.residence_id,
      // Valorizzato per le voci di unità, null per quelle condominiali: la
      // distinzione è la nullabilità di unit_id, la stessa già usata a :148
      // per decidere se l'email porta un'etichetta di unità.
      unitId: item.unit_id,
      eventType: 'sollecito_inviato',
      // Attore dalla sessione, mai da input. Il service client bypassa le
      // policy INSERT della 037, quindi l'antispoofing che quelle policy
      // esprimono con actor_id = auth.uid() vive solo in questa riga.
      actorId: user.id,
      actorRole: profile.role,
      // Letto lato server al momento dell'atto e congelato qui: il registro
      // non deve cambiare di senso se la persona cambia nome dopo.
      actorName: profile.full_name ?? null,
      payload: {
        item_id: itemId,
        title,
        completion_mode: mode,
        days_late: daysLate,
        // I cinque esiti di SollecitoOutcome per intero, non solo i riusciti:
        // `sent` è anche il numero di destinatari raggiunti, e gli altri
        // quattro dicono perché gli altri non lo sono stati. Senza di loro la
        // riga non distingue "unico destinatario raggiunto" da "uno su sei".
        sent: outcome.sent,
        simulated: outcome.simulated,
        failed: outcome.failed,
        without_email: outcome.withoutEmail,
        skipped: outcome.skipped,
        message_ids: messageIds,
      },
    })
  }

  return { status: 'ok', outcome }
}

// ---------------------------------------------------------------------------
// Configura per voce (3a-3)
// ---------------------------------------------------------------------------

export type ConfigureVoceResult =
  | { ok: true; touched: number; summary: ConfigPlanSummary }
  | {
      ok: false
      kind: 'non_autenticato' | 'permessi' | 'non_trovata' | 'input_non_valido' | 'errore_tecnico'
      message: string
    }

const CONFIGURE_ERR = (kind: Extract<ConfigureVoceResult, { ok: false }>['kind'], message: string): ConfigureVoceResult =>
  ({ ok: false, kind, message })

/**
 * Applica a TUTTE le istanze di una voce i soli campi cambiati (modalità,
 * fornitore, garanzia). Il client manda solo residenza, voce e i campi: le
 * righe le legge il server (residence_id + template_id), mai una lista di id
 * dal client. Solo super_admin del builder della residenza. Il piano (date,
 * status, priority) lo calcola maintenance-config.ts; la scrittura è la RPC
 * czero_configure_voce, atomica e SECURITY INVOKER: la RLS resta la seconda
 * barriera. completions non è toccata.
 */
export async function configureVoce(
  residenceId: string,
  templateId: string,
  changes: unknown,
): Promise<ConfigureVoceResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return CONFIGURE_ERR('non_autenticato', 'Non autenticato')

  const prefix = 'configureVoce:'
  const gate = await authorizeResidenceActor(createServiceClient(), user.id, residenceId, prefix)
  if (!gate.ok) {
    if (gate.status === 500) return CONFIGURE_ERR('errore_tecnico', ITEM_CONFIG_TEMP_ERROR)
    if (gate.status === 404) return CONFIGURE_ERR('non_trovata', 'Residenza non trovata.')
    return CONFIGURE_ERR('permessi', 'Permessi insufficienti per configurare questa voce.')
  }
  if (gate.role !== 'super_admin') {
    return CONFIGURE_ERR('permessi', 'Permessi insufficienti per configurare questa voce.')
  }

  // Le righe della voce, lette dal server con la sessione (RLS). completions(count):
  // un conteggio, non la lista, per non incontrare il limite di righe di PostgREST.
  const [itemsRes, suppliersRes] = await Promise.all([
    supabase
      .from('maintenance_items')
      .select(`id, template_id, unit_id, status, next_due_date, completion_mode, obligation_type, activation_status, frequency_months, warranty_info, supplier_id, due_basis_override, maintenance_templates(title, category, completion_mode, obligation_type, frequency_months, is_active), units(delivery_date), completions(count)`)
      .eq('residence_id', residenceId)
      .eq('template_id', templateId),
    supabase
      .from('suppliers')
      .select('id')
      .eq('builder_id', gate.residence.builder_id),
  ])
  if (itemsRes.error) {
    console.error(`${prefix} errore lettura righe della voce`, { residenceId, templateId, error: itemsRes.error })
    return CONFIGURE_ERR('errore_tecnico', ITEM_CONFIG_TEMP_ERROR)
  }
  if (suppliersRes.error) {
    console.error(`${prefix} errore lettura fornitori`, { residenceId, error: suppliersRes.error })
    return CONFIGURE_ERR('errore_tecnico', ITEM_CONFIG_TEMP_ERROR)
  }
  const rawItems = itemsRes.data ?? []
  if (rawItems.length === 0) return CONFIGURE_ERR('non_trovata', 'Voce non trovata in questa residenza.')

  const items: ConfigItem[] = rawItems.map(r => {
    const comp = r.completions as unknown as { count: number }[] | null
    return {
      id: r.id,
      template_id: r.template_id,
      unit_id: r.unit_id,
      status: r.status,
      next_due_date: r.next_due_date,
      completion_mode: r.completion_mode,
      obligation_type: r.obligation_type,
      activation_status: r.activation_status,
      frequency_months: r.frequency_months,
      warranty_info: r.warranty_info,
      supplier_id: r.supplier_id,
      due_basis_override: r.due_basis_override as string | null,
      has_completions: (comp?.[0]?.count ?? 0) > 0,
      maintenance_templates: r.maintenance_templates as unknown as ConfigItem['maintenance_templates'],
      units: r.units as unknown as ConfigItem['units'],
    }
  })

  const validation = validateConfigChanges(changes, {
    hasCommonAreaRows: items.some(i => i.unit_id === null),
    allowedSupplierIds: new Set((suppliersRes.data ?? []).map(s => s.id as string)),
  })
  if (!validation.ok) return CONFIGURE_ERR('input_non_valido', validation.message)

  const plan = planConfigWrite(items, validation.changes, todayISO())
  if (plan.rows.length === 0) return { ok: true, touched: 0, summary: plan.summary }

  const payload = plan.rows.map(r => ({ id: r.id, ...(r.fields satisfies PlannedFields) }))
  const { data, error } = await supabase.rpc('czero_configure_voce', {
    p_residence_id: residenceId,
    p_template_id: templateId,
    p_rows: payload,
  })
  if (error) {
    console.error(`${prefix} RPC czero_configure_voce`, { residenceId, templateId, error })
    if (error.code === '42501') return CONFIGURE_ERR('permessi', 'Permessi insufficienti per configurare questa voce.')
    if (error.code === 'P0002') return CONFIGURE_ERR('non_trovata', 'Voce non trovata in questa residenza.')
    if (error.code === '22023') return CONFIGURE_ERR('input_non_valido', 'Configurazione non valida.')
    return CONFIGURE_ERR('errore_tecnico', ITEM_CONFIG_TEMP_ERROR)
  }

  revalidatePath(`/admin/residences/${residenceId}/manutenzioni`)
  return { ok: true, touched: Array.isArray(data) ? data.length : plan.rows.length, summary: plan.summary }
}
