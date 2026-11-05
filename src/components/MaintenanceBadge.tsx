import type { CompletionMode, ObligationType, MaintenanceStatus } from '@/types/database'
import { MODE_LABELS, OBLIGATION_LABELS } from '@/lib/maintenance-labels'

// Etichette in src/lib/maintenance-labels.ts; ri-esportate perché altri file
// le importano ancora da qui.
export { OBLIGATION_LABELS }

const STATUS_STYLES: Record<MaintenanceStatus, string> = {
  in_attesa:  'bg-background text-text-secondary',
  scaduta:    'bg-semantic-red-bg text-semantic-red',
  in_corso:   'bg-semantic-amber-bg text-semantic-amber',
  completata: 'bg-brand-light text-brand-dark',
}

interface Props {
  mode: CompletionMode
  obligation: ObligationType
  status: MaintenanceStatus
  size?: 'sm' | 'xs'
}

export function MaintenanceBadge({ mode, obligation, status, size = 'sm' }: Props) {
  const px = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
  const badgeStyle = mode === 'promemoria'
    ? 'bg-semantic-blue-bg text-semantic-blue'
    : STATUS_STYLES[status]

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center rounded-full font-medium ${badgeStyle} ${px}`}>
        {MODE_LABELS[mode]}
      </span>
      <span className="text-xs text-text-secondary">{OBLIGATION_LABELS[obligation]}</span>
    </span>
  )
}
