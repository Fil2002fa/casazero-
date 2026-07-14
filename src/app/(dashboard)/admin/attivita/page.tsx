import type { Metadata } from 'next'
import { CheckCircle2, UserPlus, AlertTriangle, FileText, MessageSquare, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { requireRole } from '@/lib/auth'
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

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function dayLabel(date: Date, now: Date): string {
  const diffDays = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000)
  if (diffDays === 0) return 'Oggi'
  if (diffDays === 1) return 'Ieri'
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

type DayGroup = { label: string; events: ActivityEvent[] }

function groupByDay(events: ActivityEvent[], now: Date): DayGroup[] {
  const groups: DayGroup[] = []
  for (const event of events) {
    const label = dayLabel(event.at, now)
    const current = groups[groups.length - 1]
    if (current && current.label === label) {
      current.events.push(event)
    } else {
      groups.push({ label, events: [event] })
    }
  }
  return groups
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
                  {group.events.map((event, i) => {
                    const Icon = EVENT_ICON[event.type]
                    return (
                      <li
                        key={i}
                        className={cn('flex items-center gap-3 py-3', i > 0 && 'border-t border-border')}
                      >
                        <Icon
                          className={cn('w-4 h-4 flex-shrink-0', event.overdue ? 'text-status-overdue' : 'text-neutral-400')}
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-sm font-medium text-neutral-900">
                            {event.subject} — {event.action}
                          </p>
                          <TestBadge />
                        </div>
                        <span className="text-xs text-neutral-500 tabular-nums flex-shrink-0 whitespace-nowrap">
                          {formatTime(event.at)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
