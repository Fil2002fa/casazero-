import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { PriorityBadge } from './PriorityBadge'
import type { MaintenancePriority, MaintenanceStatus } from '@/types/database'
import { formatFrequency } from '@/lib/formatFrequency'

interface Props {
  id: string
  title: string
  category: string
  priority: MaintenancePriority
  status: MaintenanceStatus
  nextDueDate: string | null
  frequencyMonths?: number | null
  scope: 'unit' | 'condominium'
  href?: string
}

export function MaintenanceCard({ id, title, category, priority, status, nextDueDate, frequencyMonths, scope, href }: Props) {
  const isUrgent = status === 'scaduta' && priority !== 'N1'
  const isInProgress = status === 'in_corso'

  const borderColor = isUrgent
    ? 'border-l-semantic-red'
    : isInProgress
    ? 'border-l-semantic-amber'
    : 'border-l-transparent'

  const formattedDate = nextDueDate
    ? new Date(nextDueDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <Link href={href ?? `/manutenzioni/${id}`} className="block">
      <div className={`bg-surface rounded-xl border border-border border-l-4 ${borderColor} p-4 flex items-center gap-3 active:scale-[0.98] transition-transform`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <PriorityBadge priority={priority} status={status} size="xs" />
            {scope === 'condominium' && (
              <span className="text-[10px] text-text-secondary bg-background px-1.5 py-0.5 rounded-full">
                Condominio
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-text-primary truncate">{title}</p>
          <p className="text-xs text-text-secondary mt-0.5">{category}</p>
          {priority === 'N1' ? (
            <p className="text-xs mt-1 font-medium text-semantic-blue">
              Consigliata · {formatFrequency(frequencyMonths)}
            </p>
          ) : formattedDate ? (
            <p className={`text-xs mt-1 font-medium ${isUrgent ? 'text-semantic-red' : 'text-text-secondary'}`}>
              {isUrgent ? 'Scaduta il ' : isInProgress ? 'In corso · scaduta il ' : 'Prossima scadenza: '}
              {formattedDate}
            </p>
          ) : null}
        </div>
        <ChevronRight className="w-4 h-4 text-text-secondary flex-shrink-0" strokeWidth={1.6} />
      </div>
    </Link>
  )
}
