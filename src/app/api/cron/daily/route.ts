import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendEmail,
  emailMaintenanceDue,
  emailMaintenanceReminder,
} from '@/lib/notifications'

export const runtime = 'nodejs'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

type ItemRow = {
  id: string
  status: string
  next_due_date: string | null
  unit_id: string | null
  residence_id: string
  priority: string | null
  frequency_months: number | null
  maintenance_templates: {
    title: string
    priority: string
    frequency_months: number
    scope: string
  } | null
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today = new Date().toISOString().split('T')[0]
  const results = { processed: 0, notified: 0, errors: 0 }

  // Tutti gli item attivi con scadenza passata o presente
  const { data: items, error } = await supabase
    .from('maintenance_items')
    .select(`
      id, status, next_due_date, unit_id, residence_id, priority, frequency_months,
      maintenance_templates(title, priority, frequency_months, scope)
    `)
    .or('status.eq.in_attesa,status.eq.scaduta,status.eq.in_corso')
    .lte('next_due_date', today)

  if (error) {
    console.error('[CRON] fetch error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  for (const item of (items ?? []) as unknown as ItemRow[]) {
    const tpl = item.maintenance_templates
    if (!tpl) continue

    const effectivePriority = (item.priority ?? tpl.priority) as 'N1' | 'N2' | 'N3'
    const effectiveFreq = item.frequency_months ?? tpl.frequency_months
    const dueDate = item.next_due_date ?? today

    try {
      results.processed++

      if (effectivePriority === 'N1') {
        // N1: avanza la scadenza e notifica (non diventa mai 'scaduta')
        if (item.status === 'in_attesa') {
          const newDue = addMonths(new Date(dueDate), effectiveFreq)
          await supabase
            .from('maintenance_items')
            .update({ next_due_date: newDue.toISOString().split('T')[0] })
            .eq('id', item.id)

          const shouldNotify = await checkDedup(supabase, item.id, 0)
          if (shouldNotify && item.unit_id) {
            await notifyUnitMembers(supabase, item.unit_id, item.id, 'n1_due',
              tpl.title, dueDate, 'N1')
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
        if (effectivePriority === 'N2' && item.unit_id) {
          await notifyUnitMembers(supabase, item.unit_id, item.id, 'n2_due',
            tpl.title, dueDate, 'N2')
        } else if (effectivePriority === 'N3') {
          await notifyResidenceAdmins(supabase, item.residence_id, item.id, 'n3_due',
            tpl.title, dueDate, 'N3')
        }
        results.notified++
        continue
      }

      if (item.status === 'scaduta') {
        // Promemoria: N2 ogni 14 giorni, N3 ogni 30 giorni
        const intervalDays = effectivePriority === 'N2' ? 14 : 30
        const shouldRemind = await checkDedup(supabase, item.id, intervalDays)
        if (!shouldRemind) continue

        if (effectivePriority === 'N2' && item.unit_id) {
          await notifyUnitMembers(supabase, item.unit_id, item.id, 'n2_reminder',
            tpl.title, dueDate, 'N2', true)
        } else if (effectivePriority === 'N3') {
          await notifyResidenceAdmins(supabase, item.residence_id, item.id, 'n3_reminder',
            tpl.title, dueDate, 'N3', true)
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

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

async function checkDedup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  itemId: string,
  intervalDays: number
): Promise<boolean> {
  if (intervalDays === 0) return true
  const cutoff = new Date(Date.now() - intervalDays * 86400000).toISOString()
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
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
  priority: 'N1' | 'N2' | 'N3',
  isReminder = false
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
    if (email) {
      const html = isReminder
        ? emailMaintenanceReminder(title, priority as 'N2' | 'N3', dueDate, APP_URL)
        : emailMaintenanceDue(title, priority, dueDate, APP_URL)
      const subject = isReminder
        ? `Promemoria: "${title}" non ancora eseguita`
        : `Manutenzione in scadenza: "${title}"`
      await sendEmail({ to: email, subject, html })
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
  priority: 'N3',
  isReminder = false
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
    if (email) {
      const html = isReminder
        ? emailMaintenanceReminder(title, priority, dueDate, APP_URL)
        : emailMaintenanceDue(title, priority, dueDate, APP_URL)
      const subject = isReminder
        ? `Promemoria: "${title}" condominiale non eseguita`
        : `Manutenzione condominiale in scadenza: "${title}"`
      await sendEmail({ to: email, subject, html })
    }
  }
}
