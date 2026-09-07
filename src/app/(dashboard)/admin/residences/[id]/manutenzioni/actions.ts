'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { resolveRecipientsForMode } from '@/lib/notification-recipients'
import { sendEmail, emailSollecito } from '@/lib/notifications'
import { OBLIGATION_LABELS } from '@/components/MaintenanceBadge'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import {
  isOverdueLive, resolveCompletionMode, resolveObligationType,
  LIVE_STATUS_FIELDS, LIVE_STATUS_TEMPLATE_FIELDS,
  type LiveStatusItem,
} from '@/lib/maintenance-status'
import type { ObligationType } from '@/types/database'

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
    .select('role, builder_id')
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

  // Gemello di src/app/api/report/route.ts:142-149, di
  // src/app/api/fascicolo-pdf/route.ts:50-61 e di
  // src/app/api/classify-document/route.ts:134-150 (autorizzazione
  // admin-su-residenza dietro service client). Duplicazione consapevole:
  // unificare in un helper condiviso in un commit dedicato, dopo la demo.
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
  const html = emailSollecito({
    title,
    obligationLabel: obligation ? OBLIGATION_LABELS[obligation] : null,
    residenceName: item.residences?.name ?? 'la residenza',
    unitLabel: item.units ? formatUnitLabel(item.units.label) : null,
    dueDate,
    // Le due shell hanno percorsi diversi per la stessa manutenzione.
    actionUrl: mode === 'residente'
      ? `${APP_URL}/manutenzioni/${itemId}`
      : `${APP_URL}/admin/manutenzioni/${itemId}`,
  })
  const subject = `Sollecito: "${title}" non ancora eseguita`

  const cutoff = new Date(Date.now() - DEDUP_WINDOW_HOURS * 3600_000).toISOString()
  const outcome: SollecitoOutcome = { sent: 0, simulated: 0, failed: 0, withoutEmail: 0, skipped: 0 }

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
      const res = await sendEmail({ to: recipient.email, subject, html })
      delivery = res.status === 'sent' ? 'sent' : res.status === 'simulated' ? 'simulated' : 'failed'
      if (delivery === 'sent') outcome.sent++
      else if (delivery === 'simulated') outcome.simulated++
      else outcome.failed++
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

  return { status: 'ok', outcome }
}
