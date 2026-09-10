import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Inbox } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { groupByDay } from '@/lib/activity-feed'
import {
  ACTIVITY_EVENT_ICON,
  activityEventSubject,
  describeActivityEvent,
} from '@/lib/activity-event-view'
import { ActivityTimelineRow } from '@/components/ActivityTimelineRow'
import type { ActivityEvent } from '@/types/database'

export const metadata: Metadata = { title: 'Attività residenza' }

type Params = Promise<{ id: string }>

// La riga del registro più il label dell'unità e l'istante convertito:
// groupByDay lavora su { at: Date }, il DB restituisce una stringa ISO.
type FeedEvent = ActivityEvent & { at: Date; unitLabel: string | null }

/**
 * L'embed to-one di PostgREST può arrivare come oggetto o come array di uno a
 * seconda di come deduce la relazione. Il client Supabase qui non è tipizzato
 * (nessun generic Database), quindi il compilatore non discrimina il caso: se
 * si assumesse solo l'oggetto, un ritorno ad array darebbe label null in
 * silenzio e ogni evento di unità apparirebbe come "Unità sconosciuta".
 */
function embeddedUnitLabel(units: unknown): string | null {
  const row = Array.isArray(units) ? units[0] : units
  if (row !== null && typeof row === 'object' && 'label' in row) {
    const label = (row as { label: unknown }).label
    if (typeof label === 'string') return label
  }
  return null
}

export default async function ResidenceAttivitaPage({ params }: { params: Params }) {
  const { id } = await params

  // Il confinamento dell'admin alle residenze che segue è di RLS, non
  // applicativo: qui il client è RLS-scoped, quindi una residenza non sua non
  // torna e la pagina è 404. Un gate esplicito su admin_assignments serve solo
  // dietro service client, che RLS la bypassa (037_activity_events.sql:18-20).
  await requireRole(['admin', 'super_admin'], '/admin/manutenzioni')
  const supabase = await createClient()

  const { data: residence } = await supabase
    .from('residences')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!residence) notFound()

  // Ordine decrescente: è la precondizione di groupByDay, che accorpa solo run
  // consecutivi con la stessa etichetta di giorno.
  const { data: rawEvents } = await supabase
    .from('activity_events')
    .select('id, residence_id, unit_id, event_type, actor_id, actor_role, actor_name, payload, created_at, units(label)')
    .eq('residence_id', id)
    .order('created_at', { ascending: false })

  const events: FeedEvent[] = ((rawEvents ?? []) as (ActivityEvent & { units: unknown })[]).map(row => ({
    ...row,
    at: new Date(row.created_at),
    unitLabel: embeddedUnitLabel(row.units),
  }))

  const groups = groupByDay(events, new Date())

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/admin/residences/${id}`}
          className="text-text-secondary p-1 -ml-1 rounded-lg"
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={1.6} />
        </Link>
        <div className="flex-1">
          <h1 className="text-base font-medium text-text-primary">Attività</h1>
          <p className="text-xs text-text-secondary">{residence.name}</p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-8 text-center space-y-3">
          <Inbox className="w-10 h-10 text-neutral-400 mx-auto" strokeWidth={1.2} aria-hidden="true" />
          <p className="text-sm text-neutral-500">Nessun evento registrato per questa residenza.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <section key={group.label}>
              <h2 className="text-[13px] font-medium text-neutral-500">{group.label}</h2>
              <ul role="list" aria-label={`${group.events.length} eventi — ${group.label}`} className="mt-2">
                {group.events.map((event, i) => (
                  <ActivityTimelineRow
                    key={event.id}
                    icon={ACTIVITY_EVENT_ICON[event.event_type]}
                    text={`${activityEventSubject(event.unit_id, event.unitLabel)} — ${describeActivityEvent(event)}`}
                    at={event.at}
                    divider={i > 0}
                    trailing={
                      event.actor_name
                        ? <span className="text-xs text-neutral-500 flex-shrink-0">{event.actor_name}</span>
                        : undefined
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
