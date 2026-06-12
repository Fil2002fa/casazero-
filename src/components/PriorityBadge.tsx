import type { MaintenancePriority, MaintenanceStatus } from '@/types/database'

interface Props {
  priority: MaintenancePriority
  status?: MaintenanceStatus
  size?: 'sm' | 'xs'
}

export function PriorityBadge({ priority, status, size = 'sm' }: Props) {
  const px = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'

  if (priority === 'N1') {
    return (
      <span className={`inline-flex items-center rounded-full font-medium bg-semantic-blue-bg text-semantic-blue ${px}`}>
        Consigliata
      </span>
    )
  }

  if (priority === 'N2') {
    const isOverdue = status === 'scaduta'
    return (
      <span className={`inline-flex items-center rounded-full font-medium ${px} ${
        isOverdue
          ? 'bg-semantic-red-bg text-semantic-red'
          : 'bg-semantic-amber-bg text-semantic-amber'
      }`}>
        {isOverdue ? 'Scaduta' : 'Obbligatoria'}
      </span>
    )
  }

  // N3
  const statusStyles: Record<MaintenanceStatus, string> = {
    in_attesa:  'bg-background text-text-secondary',
    scaduta:    'bg-semantic-red-bg text-semantic-red',
    in_corso:   'bg-semantic-amber-bg text-semantic-amber',
    completata: 'bg-brand-light text-brand-dark',
  }
  const statusLabels: Record<MaintenanceStatus, string> = {
    in_attesa:  'Pianificata',
    scaduta:    'Scaduta',
    in_corso:   'In corso',
    completata: 'Completata',
  }

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${px} ${
      statusStyles[status ?? 'in_attesa']
    }`}>
      {statusLabels[status ?? 'in_attesa']}
    </span>
  )
}
