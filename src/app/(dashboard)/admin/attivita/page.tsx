import type { Metadata } from 'next'
import { CheckCircle2, UserPlus, AlertTriangle, FileText, MessageSquare, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { requireRole } from '@/lib/auth'
import { groupByDay } from '@/lib/activity-feed'
import { ActivityTimelineRow } from '@/components/ActivityTimelineRow'
import { PILL_BASE } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'

export const metadata: Metadata = { title: 'Attività' }

type EventType = 'completion' | 'new_resident' | 'attention' | 'document' | 'comment' | 'maintenance'

type ActivityEvent = {
  type: EventType
  subject: string
  action: string
  overdue?: boolean
  at: Date
}

const EVENT_ICON: Record<EventType, LucideIcon> = {
  completion: CheckCircle2,
  new_resident: UserPlus,
  attention: AlertTriangle,
  document: FileText,
  comment: MessageSquare,
  maintenance: Wrench,
}

function hoursAgo(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * 60 * 60 * 1000)
}

// Dati demo: feed cronologico di esempio per la presentazione.
// Non collegato a eventi reali (trigger DB / cron / webhook) — vedi badge "Test" su ogni riga.
function buildDemoEvents(now: Date): ActivityEvent[] {
  return [
    { type: 'completion', subject: 'Unità 7', action: 'test differenziale impianto elettrico completato', at: hoursAgo(now, 2) },
    { type: 'new_resident', subject: 'Unità 3', action: 'invito accettato', at: hoursAgo(now, 5) },
    { type: 'attention', subject: 'Residenza Cavaccio', action: 'verifica linee vita scaduta — a carico dell’amministratore', overdue: true, at: hoursAgo(now, 27) },
    { type: 'document', subject: 'Unità 11', action: 'certificato di conformità impianto termico caricato', at: hoursAgo(now, 30) },
    { type: 'maintenance', subject: 'Residenza Cavaccio', action: 'pulizia grondaie presa in carico dall’amministratore', at: hoursAgo(now, 48) },
    { type: 'comment', subject: 'Unità 2', action: 'nuovo commento su “Sostituzione filtri VMC”', at: hoursAgo(now, 74) },
    { type: 'completion', subject: 'Unità 9', action: 'controllo serramenti completato', at: hoursAgo(now, 98) },
  ]
}

function TestBadge() {
  return (
    <span className={cn(PILL_BASE, 'border border-border bg-transparent text-neutral-600 flex-shrink-0')}>
      Test
    </span>
  )
}

export default async function AttivitaPage() {
  await requireRole(['super_admin'], '/admin/manutenzioni')

  const now = new Date()
  const groups = groupByDay(buildDemoEvents(now), now)

  return (
    <>
      <header>
        <h1 className="font-serif text-3xl font-semibold text-neutral-900">Attività</h1>
        <p className="text-sm text-neutral-500 mt-2">
          Registro cronologico degli eventi recenti nel sistema.
        </p>
      </header>

      <div className="mt-12">
        {groups.length === 0 ? (
          <div className="bg-surface rounded-xl border border-border p-8 text-center space-y-3">
            <Wrench className="w-10 h-10 text-neutral-400 mx-auto" strokeWidth={1.2} aria-hidden="true" />
            <p className="text-sm text-neutral-500">Nessun evento registrato.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.label}>
                <h2 className="text-[13px] font-medium text-neutral-500">{group.label}</h2>
                <ul role="list" aria-label={`${group.events.length} eventi — ${group.label}`} className="mt-2">
                  {group.events.map((event, i) => (
                    <ActivityTimelineRow
                      key={i}
                      icon={EVENT_ICON[event.type]}
                      text={`${event.subject} — ${event.action}`}
                      at={event.at}
                      tone={event.overdue ? 'overdue' : undefined}
                      divider={i > 0}
                      trailing={<TestBadge />}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
