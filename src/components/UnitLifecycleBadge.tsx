import { PILL_BASE } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import type { UnitLifecycle } from '@/lib/unit-utils'

const LIFECYCLE_STYLES: Record<UnitLifecycle['stato'], string> = {
  non_consegnata:             'bg-neutral-600/7 text-neutral-600',
  consegnata_senza_residente: 'bg-semantic-amber-bg text-semantic-amber',
  residente_attivo:           'bg-brand-dark/8 text-brand-dark',
}

const LIFECYCLE_LABELS: Record<UnitLifecycle['stato'], string> = {
  non_consegnata:             'Non consegnata',
  consegnata_senza_residente: 'Consegnata, senza residente',
  residente_attivo:           'Residente attivo',
}

/** Stato del ciclo di vita dell'unità. Stesso componente per pagina Unità e riepilogo residenza. */
export function UnitLifecycleBadge({ lifecycle, className }: { lifecycle: UnitLifecycle; className?: string }) {
  return (
    <span className={cn('inline-flex flex-col items-start gap-0.5', className)}>
      <span className={cn(PILL_BASE, 'whitespace-nowrap', LIFECYCLE_STYLES[lifecycle.stato])}>
        {LIFECYCLE_LABELS[lifecycle.stato]}
      </span>
      {lifecycle.stato === 'non_consegnata' && lifecycle.residenteGiaAttivo && (
        <span className="text-xs text-semantic-amber">residente già attivo</span>
      )}
    </span>
  )
}
