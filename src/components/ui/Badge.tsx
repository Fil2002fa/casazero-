import type { MaintenanceStatus, ObligationType } from '@/types/database'
import { formatFrequency } from '@/lib/formatFrequency'
import { cn } from '@/lib/cn'

export const PILL_BASE = 'inline-flex items-center rounded-full h-[22px] px-2.5 text-xs font-medium'

const STATUS_STYLES: Record<MaintenanceStatus, string> = {
  scaduta:    'bg-status-overdue/8 text-status-overdue',
  in_corso:   'bg-status-inprogress/8 text-status-inprogress',
  in_attesa:  'bg-neutral-600/7 text-neutral-600',
  completata: 'bg-brand-dark/8 text-brand-dark',
}

const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  scaduta:    'Scaduta',
  in_corso:   'In corso',
  in_attesa:  'Pianificata',
  completata: 'Completata',
}

interface StatusBadgeProps {
  status: MaintenanceStatus
  className?: string
}

/** Pill di stato temporale. Non usare per voci a modalità promemoria: vedi PromemoriaBadge. */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span className={cn(PILL_BASE, STATUS_STYLES[status], className)}>
      {STATUS_LABELS[status]}
    </span>
  )
}

interface PromemoriaBadgeProps {
  frequencyMonths: number | null | undefined
  className?: string
}

/**
 * Garanzia strutturale: unico testo possibile "Consigliata · ogni X mesi", sempre blu.
 * Nessuna prop di stato esiste su questo componente — "Promemoria + Scaduta" è irrappresentabile per tipo.
 */
export function PromemoriaBadge({ frequencyMonths, className }: PromemoriaBadgeProps) {
  return (
    <span className={cn(PILL_BASE, 'bg-status-reminder/8 text-status-reminder', className)}>
      Consigliata · {formatFrequency(frequencyMonths)}
    </span>
  )
}

const OBLIGATION_LABELS: Record<ObligationType, string> = {
  A: 'Obbligo di legge',
  B: 'Raccomandata',
  C: 'Consiglio',
}

interface TypeBadgeProps {
  obligationType: ObligationType
  className?: string
}

/** Badge outline per obligation_type. Sfondo sempre trasparente. */
export function TypeBadge({ obligationType, className }: TypeBadgeProps) {
  const isLegal = obligationType === 'A'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full h-[22px] px-2.5 text-xs font-medium border bg-transparent',
        isLegal ? 'border-brand-dark/25 text-brand-dark' : 'border-border text-neutral-600',
        className
      )}
    >
      {OBLIGATION_LABELS[obligationType]}
    </span>
  )
}
