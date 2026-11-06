import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendEmail,
  emailMaintenanceDue,
  emailMaintenanceReminder,
  emailPromemoriaDue,
  maintenanceItemUrl,
} from '@/lib/notifications'
import { getItemLinkRoles, linkRoleFor } from '@/lib/notification-recipients'
import { nextDueFrom } from '@/lib/maintenance-due'
import { todayISO } from '@/lib/maintenance-status'
import type { CompletionMode } from '@/types/database'

export const runtime = 'nodejs'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

type ItemRow = {
  id: string
  status: string
  next_due_date: string | null
  unit_id: string | null
  residence_id: string
  completion_mode: CompletionMode | null
  frequency_months: number | null
  maintenance_templates: {
    title: string
    completion_mode: CompletionMode | null
    frequency_months: number
    scope: string
  } | null
}

type EmailContent = { subject: string; html: string }
// L'email dipende dal destinatario (il link alla voce cambia con il suo ruolo),
// quindi si costruisce per ogni destinatario a partire dal suo URL.
type EmailBuilder = (actionUrl: string) => EmailContent

export async function GET(req: NextRequest) {
  // Segreto assente o vuoto = guasto di configurazione, non un rifiuto di accesso:
  // senza questo controllo il template darebbe "Bearer undefined" e quella stringa passerebbe.
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cron/daily] CRON_SECRET non configurato, job non eseguito')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today = todayISO()
  const results = { processed: 0, notified: 0, errors: 0 }

  // Tutti gli item attivi con scadenza passata o presente
  const { data: items, error } = await supabase
    .from('maintenance_items')
    .select(`
      id, status, next_due_date, unit_id, residence_id, completion_mode, frequency_months,
      maintenance_templates(title, completion_mode, frequency_months, scope)
    `)
    .or('status.eq.in_attesa,status.eq.scaduta,status.eq.in_corso')
    .lte('next_due_date', today)
    .eq('activation_status', 'inclusa')

  if (error) {
    console.error('[CRON] fetch error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  for (const item of (items ?? []) as unknown as ItemRow[]) {
    const tpl = item.maintenance_templates
    if (!tpl) continue

    // Modalità voce ?? template, come resolveCompletionMode: mai dalla
    // colonna legacy priority. I tipi di notifica (n1_due, n2_due, ...) restano
    // quelli già salvati in notifications: sono chiavi di dedup, non testo.
    const mode = item.completion_mode ?? tpl.completion_mode ?? null
    if (mode === null) {
      console.error(`[CRON] item ${item.id}: modalità assente su voce e template, saltato`)
      results.errors++
      continue
    }
    const effectiveFreq = item.frequency_months ?? tpl.frequency_months
    const dueDate = item.next_due_date ?? today

    try {
      results.processed++

      if (mode === 'promemoria') {
        // Promemoria: avanza la scadenza e notifica (non diventa mai 'scaduta')
        if (item.status === 'in_attesa') {
          await supabase
            .from('maintenance_items')
            .update({ next_due_date: nextDueFrom(dueDate, effectiveFreq) })
            .eq('id', item.id)

          const shouldNotify = await checkDedup(supabase, item.id, 0, 'n1_due')
          if (shouldNotify && item.unit_id) {
            await notifyUnitMembers(supabase, item.unit_id, item.residence_id, item.id, 'n1_due', tpl.title, dueDate, actionUrl => ({
              subject: `Manutenzione consigliata: "${tpl.title}"`,
              html: emailPromemoriaDue(tpl.title, effectiveFreq, actionUrl),
            }))
            results.notified++
          }
        }
        continue
      }

      if (item.status === 'in_attesa') {
        // Marca come scaduta
        await supabase
          .from('maintenance_items')
          .update({ status: 'scaduta' })
          .eq('id', item.id)

        // Notifica iniziale
        if (mode === 'residente' && item.unit_id) {
          await notifyUnitMembers(supabase, item.unit_id, item.residence_id, item.id, 'n2_due', tpl.title, dueDate, actionUrl => ({
            subject: `Manutenzione in scadenza: "${tpl.title}"`,
            html: emailMaintenanceDue(tpl.title, 'residente', dueDate, actionUrl),
          }))
        } else if (mode === 'amministratore') {
          await notifyResidenceAdmins(supabase, item.residence_id, item.id, 'n3_due', tpl.title, dueDate, actionUrl => ({
            subject: `Manutenzione condominiale in scadenza: "${tpl.title}"`,
            html: emailMaintenanceDue(tpl.title, 'amministratore', dueDate, actionUrl),
          }))
        }
        results.notified++
        continue
      }

      if (item.status === 'scaduta') {
        // Solleciti: residente ogni 14 giorni, amministratore ogni 30 giorni
        const intervalDays = mode === 'residente' ? 14 : 30
        const reminderType = mode === 'residente' ? 'n2_reminder' : 'n3_reminder'
        const shouldRemind = await checkDedup(supabase, item.id, intervalDays, reminderType)
        if (!shouldRemind) continue

        if (mode === 'residente' && item.unit_id) {
          await notifyUnitMembers(supabase, item.unit_id, item.residence_id, item.id, 'n2_reminder', tpl.title, dueDate, actionUrl => ({
            subject: `Promemoria: "${tpl.title}" non ancora eseguita`,
            html: emailMaintenanceReminder(tpl.title, dueDate, actionUrl),
          }))
        } else if (mode === 'amministratore') {
          await notifyResidenceAdmins(supabase, item.residence_id, item.id, 'n3_reminder', tpl.title, dueDate, actionUrl => ({
            subject: `Promemoria: "${tpl.title}" condominiale non eseguita`,
            html: emailMaintenanceReminder(tpl.title, dueDate, actionUrl),
          }))
        }
        results.notified++
      }
    } catch (err) {
      console.error(`[CRON] item ${item.id} error:`, err)
      results.errors++
    }
  }

  console.log('[CRON] done', results)
  return NextResponse.json({ ok: true, ...results })
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function checkDedup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  itemId: string,
  intervalDays: number,
  type: string
): Promise<boolean> {
  if (intervalDays === 0) return true
  const cutoff = new Date(Date.now() - intervalDays * 86400000).toISOString()
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('type', type)
    .filter('payload->>item_id', 'eq', itemId)
    .gte('created_at', cutoff)
  return (count ?? 0) === 0
}

async function getEmailForProfile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  profileId: string
): Promise<string | null> {
  const { data } = await supabase.auth.admin.getUserById(profileId)
  return data?.user?.email ?? null
}

async function notifyUnitMembers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  unitId: string,
  residenceId: string,
  itemId: string,
  type: string,
  title: string,
  dueDate: string,
  buildContent: EmailBuilder,
) {
  const { data: members } = await supabase
    .from('unit_members')
    .select('profile_id')
    .eq('unit_id', unitId)
    .is('ended_at', null)

  // Ruolo di ripiego 'client': un membro di unità è un residente. Vale solo se
  // la lettura dei ruoli fallisce (già loggata); altrimenti conta l'accesso
  // reale alla voce: un membro con ruolo admin (account di test) ha il link
  // diretto solo se è assegnato alla residenza, altrimenti va all'elenco.
  const roles = await getItemLinkRoles(supabase, (members ?? []).map((m: { profile_id: string }) => m.profile_id), residenceId)

  for (const m of members ?? []) {
    await supabase.from('notifications').insert({
      profile_id: m.profile_id,
      type,
      payload: { item_id: itemId, title, due_date: dueDate },
      channel: 'email',
      status: 'pending',
    })
    const email = await getEmailForProfile(supabase, m.profile_id)
    if (email) {
      const actionUrl = maintenanceItemUrl(APP_URL, linkRoleFor(roles, m.profile_id, 'client'), itemId)
      await sendEmail({ to: email, ...buildContent(actionUrl) })
    }
  }
}

async function notifyResidenceAdmins(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  residenceId: string,
  itemId: string,
  type: string,
  title: string,
  dueDate: string,
  buildContent: EmailBuilder,
) {
  const { data: assignments } = await supabase
    .from('admin_assignments')
    .select('profile_id')
    .eq('residence_id', residenceId)

  // Ruolo di ripiego 'admin': chi è in admin_assignments è un admin.
  const roles = await getItemLinkRoles(supabase, (assignments ?? []).map((a: { profile_id: string }) => a.profile_id), residenceId)

  for (const a of assignments ?? []) {
    await supabase.from('notifications').insert({
      profile_id: a.profile_id,
      type,
      payload: { item_id: itemId, title, due_date: dueDate },
      channel: 'email',
      status: 'pending',
    })
    const email = await getEmailForProfile(supabase, a.profile_id)
    if (email) {
      const actionUrl = maintenanceItemUrl(APP_URL, linkRoleFor(roles, a.profile_id, 'admin'), itemId)
      await sendEmail({ to: email, ...buildContent(actionUrl) })
    }
  }
}
