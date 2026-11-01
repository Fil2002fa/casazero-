import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { StatusBadge, PromemoriaBadge, TypeBadge } from '@/components/ui/Badge'
import type { CompletionMode, MaintenanceStatus, ObligationType } from '@/types/database'

interface Props {
  id: string
  title: string
  category: string
  // Modalità risolta (voce ?? template, resolveCompletionMode): decide il badge.
  mode: CompletionMode | null
  obligationType: ObligationType | null
  status: MaintenanceStatus
  nextDueDate: string | null
  frequencyMonths?: number | null
  scope: 'unit' | 'condominium'
  href?: string
}

// Badge come nella lista e nel dettaglio voce (ManutenzioniList.tsx,
// manutenzioni/[id]/page.tsx): promemoria solo "Consigliata · ogni X mesi",
// mai stato né scadenza; le altre voci stato live + tipo.
export function MaintenanceCard({ id, title, category, mode, obligationType, status, nextDueDate, frequencyMonths, scope, href }: Props) {
  const isReminder = mode === 'promemoria'
  const isUrgent = status === 'scaduta' && !isReminder
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
      <div className={`bg-surface rounded-xl border border-border border-l-4 ${borderColor} p-4 flex items-center gap-3 active:bg-background`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {isReminder ? (
              <PromemoriaBadge frequencyMonths={frequencyMonths} />
            ) : (
              <>
                <StatusBadge status={status} />
                {obligationType && <TypeBadge obligationType={obligationType} />}
              </>
            )}
            {scope === 'condominium' && (
              <span className="text-[10px] text-text-secondary bg-background px-1.5 py-0.5 rounded-full">
                Condominio
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-text-primary line-clamp-2 break-words">{title}</p>
          <p className="text-xs text-text-secondary mt-0.5">{category}</p>
          {/* Promemoria: la frequenza è già nel badge, nessuna riga data. */}
          {!isReminder && formattedDate ? (
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
