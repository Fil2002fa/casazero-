import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendEmail,
  emailMaintenanceDue,
  emailMaintenanceReminder,
  emailPromemoriaDue,
} from '@/lib/notifications'
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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
            await notifyUnitMembers(supabase, item.unit_id, item.id, 'n1_due', tpl.title, dueDate, {
              subject: `Manutenzione consigliata: "${tpl.title}"`,
              html: emailPromemoriaDue(tpl.title, effectiveFreq, APP_URL),
            })
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
          await notifyUnitMembers(supabase, item.unit_id, item.id, 'n2_due', tpl.title, dueDate, {
            subject: `Manutenzione in scadenza: "${tpl.title}"`,
            html: emailMaintenanceDue(tpl.title, 'residente', dueDate, APP_URL),
          })
        } else if (mode === 'amministratore') {
          await notifyResidenceAdmins(supabase, item.residence_id, item.id, 'n3_due', tpl.title, dueDate, {
            subject: `Manutenzione condominiale in scadenza: "${tpl.title}"`,
            html: emailMaintenanceDue(tpl.title, 'amministratore', dueDate, APP_URL),
          })
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

        const html = emailMaintenanceReminder(tpl.title, dueDate, APP_URL)
        if (mode === 'residente' && item.unit_id) {
          await notifyUnitMembers(supabase, item.unit_id, item.id, 'n2_reminder', tpl.title, dueDate, {
            subject: `Promemoria: "${tpl.title}" non ancora eseguita`,
            html,
          })
        } else if (mode === 'amministratore') {
          await notifyResidenceAdmins(supabase, item.residence_id, item.id, 'n3_reminder', tpl.title, dueDate, {
            subject: `Promemoria: "${tpl.title}" condominiale non eseguita`,
            html,
          })
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
  itemId: string,
  type: string,
  title: string,
  dueDate: string,
  content: EmailContent,
) {
  const { data: members } = await supabase
    .from('unit_members')
    .select('profile_id')
    .eq('unit_id', unitId)
    .is('ended_at', null)

  for (const m of members ?? []) {
    await supabase.from('notifications').insert({
      profile_id: m.profile_id,
      type,
      payload: { item_id: itemId, title, due_date: dueDate },
      channel: 'email',
      status: 'pending',
    })
    const email = await getEmailForProfile(supabase, m.profile_id)
    if (email) await sendEmail({ to: email, ...content })
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
  content: EmailContent,
) {
  const { data: assignments } = await supabase
    .from('admin_assignments')
    .select('profile_id')
    .eq('residence_id', residenceId)

  for (const a of assignments ?? []) {
    await supabase.from('notifications').insert({
      profile_id: a.profile_id,
      type,
      payload: { item_id: itemId, title, due_date: dueDate },
      channel: 'email',
      status: 'pending',
    })
    const email = await getEmailForProfile(supabase, a.profile_id)
    if (email) await sendEmail({ to: email, ...content })
  }
}
