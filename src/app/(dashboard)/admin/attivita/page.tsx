import type { Metadata } from 'next'
import { CheckCircle2, UserPlus, AlertTriangle, FileText, MessageSquare, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { requireRole } from '@/lib/auth'

export const metadata: Metadata = { title: 'Attività' }

type EventType = 'completion' | 'new_resident' | 'attention' | 'document' | 'comment' | 'maintenance'

type ActivityEvent = {
  type: EventType
  text: string
  detail?: string
  when: string
}

const EVENT_STYLE: Record<EventType, { icon: LucideIcon; color: string; bg: string }> = {
  completion:   { icon: CheckCircle2,  color: 'text-brand-medium',    bg: 'bg-brand-light' },
  new_resident: { icon: UserPlus,      color: 'text-semantic-blue',   bg: 'bg-semantic-blue-bg' },
  attention:    { icon: AlertTriangle, color: 'text-semantic-amber',  bg: 'bg-semantic-amber-bg' },
  document:     { icon: FileText,      color: 'text-semantic-blue',   bg: 'bg-semantic-blue-bg' },
  comment:      { icon: MessageSquare, color: 'text-text-secondary',  bg: 'bg-background' },
  maintenance:  { icon: Wrench,        color: 'text-brand-medium',    bg: 'bg-brand-light' },
}

// Dati demo: feed cronologico di esempio per la presentazione.
// Non collegato a eventi reali (trigger DB / cron / webhook) — vedi badge in header.
const DEMO_EVENTS: ActivityEvent[] = [
  {
    type: 'completion',
    text: 'Test differenziale impianto elettrico completato',
    detail: 'Unità 7 — Residenza Cavaccio',
    when: '2 ore fa',
  },
  {
    type: 'new_resident',
    text: 'Nuovo residente registrato',
    detail: 'Unità 3 — Residenza Cavaccio',
    when: '5 ore fa',
  },
  {
    type: 'attention',
    text: 'Verifica linee vita scaduta',
    detail: 'Residenza Cavaccio — a carico dell’amministratore',
    when: 'ieri',
  },
  {
    type: 'document',
    text: 'Caricato certificato di conformità impianto termico',
    detail: 'Unità 11 — Residenza Cavaccio',
    when: 'ieri',
  },
  {
    type: 'maintenance',
    text: 'Pulizia grondaie presa in carico',
    detail: 'Residenza Cavaccio — Amministratore di condominio',
    when: '2 giorni fa',
  },
  {
    type: 'comment',
    text: 'Nuovo commento su “Sostituzione filtri VMC”',
    detail: 'Unità 2 — Residenza Cavaccio',
    when: '3 giorni fa',
  },
  {
    type: 'completion',
    text: 'Controllo serramenti completato',
    detail: 'Unità 9 — Residenza Cavaccio',
    when: '4 giorni fa',
  },
]

export default async function AttivitaPage() {
  await requireRole(['super_admin'], '/admin/manutenzioni')

  return (
    <div className="p-6 space-y-6 pb-safe">
      <header>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-medium text-text-primary">Attività</h1>
          <span className="px-2 py-0.5 rounded-full bg-semantic-amber-bg text-semantic-amber text-[10px] font-medium uppercase tracking-wide">
            Dati demo
          </span>
        </div>
        <p className="text-xs text-text-secondary mt-1">
          Feed cronologico degli eventi recenti nel sistema. In questa fase mostra dati di
          esempio, non ancora collegati agli eventi reali.
        </p>
      </header>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        {DEMO_EVENTS.map((event, i) => {
          const style = EVENT_STYLE[event.type]
          const Icon = style.icon
          return (
            <div
              key={i}
              className={`flex items-start gap-3 p-4 ${i > 0 ? 'border-t border-border' : ''}`}
            >
              <div className={`w-8 h-8 rounded-full ${style.bg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-4 h-4 ${style.color}`} strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary">{event.text}</p>
                {event.detail && (
                  <p className="text-xs text-text-secondary mt-0.5">{event.detail}</p>
                )}
              </div>
              <span className="text-xs text-text-secondary flex-shrink-0 whitespace-nowrap">
                {event.when}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
