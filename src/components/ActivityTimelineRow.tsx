import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatTime } from '@/lib/activity-feed'
import { cn } from '@/lib/cn'

interface Props {
  icon: LucideIcon
  /** Frase già composta dal chiamante. Vedi nota sotto: il testo si costruisce a lettura. */
  text: string
  at: Date
  /** Colore dell'icona. 'overdue' usa lo stesso token di PlanSummarySection. */
  tone?: 'overdue'
  /** Separatore sopra la riga: vero per tutte tranne la prima del gruppo. */
  divider?: boolean
  /** Slot in coda alla frase, per pill e badge specifici di una superficie. */
  trailing?: ReactNode
}

/**
 * Una riga del feed attività. Prop primitive di proposito: il componente non
 * conosce né `activity_events` né i dati demo del portafoglio, così le due
 * superfici lo condividono senza che nessuna delle due imponga la propria
 * forma all'altra.
 *
 * `text` arriva già composto perché la frase si costruisce a lettura dal
 * payload strutturato dell'evento, mai da colonne di testo: il registro è
 * immutabile e non può contenere frasi pronte per lo schermo.
 *
 * Rende un `<li>`: va usato dentro una `<ul>`, che porta la `key`.
 */
export function ActivityTimelineRow({ icon: Icon, text, at, tone, divider, trailing }: Props) {
  return (
    <li className={cn('flex items-center gap-3 py-3', divider && 'border-t border-border')}>
      <Icon
        className={cn('w-4 h-4 flex-shrink-0', tone === 'overdue' ? 'text-status-overdue' : 'text-neutral-400')}
        strokeWidth={1.8}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-sm font-medium text-neutral-900">{text}</p>
        {trailing}
      </div>
      <span className="text-xs text-neutral-500 tabular-nums flex-shrink-0 whitespace-nowrap">
        {formatTime(at)}
      </span>
    </li>
  )
}
