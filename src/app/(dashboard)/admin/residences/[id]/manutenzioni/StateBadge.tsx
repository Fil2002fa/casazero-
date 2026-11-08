import { cn } from '@/lib/cn'
import { LIST_STATE_LABELS, type ListState } from '@/lib/maintenance-list'
import { MAINTENANCE_STATUS_LABELS } from '@/lib/maintenance-labels'

// Badge di stato della vista costruttore (lista e pannello di dettaglio): una
// sola mappa di stili e testi. Rosso e ambra solo per lo stato, il resto è
// neutro. Le promemoria non lo usano mai: il chiamante non lo rende per loro.
const STATE_STYLES: Record<ListState | 'completata', string> = {
  scaduta: 'bg-semantic-red-bg text-semantic-red',
  in_corso: 'bg-semantic-amber-bg text-semantic-amber',
  entro_30: 'bg-semantic-amber-bg text-semantic-amber',
  piu_avanti: 'bg-background text-text-secondary',
  in_attesa_consegna: 'bg-background text-text-secondary',
  completata: 'bg-background text-text-secondary',
}

export function StateBadge({ state, wrap = false }: { state: ListState | 'completata'; wrap?: boolean }) {
  const label = state === 'completata' ? MAINTENANCE_STATUS_LABELS.completata : LIST_STATE_LABELS[state]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 text-xs font-medium',
        wrap ? 'py-0.5 leading-tight' : 'h-[22px] whitespace-nowrap',
        STATE_STYLES[state],
      )}
    >
      {label}
    </span>
  )
}
