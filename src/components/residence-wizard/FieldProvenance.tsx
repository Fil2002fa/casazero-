import { FIELD_STATE_LABEL, type DraftField, type FieldState } from '@/lib/residence-draft'
import { PILL_BASE } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'

const STATE_STYLES: Record<FieldState, string> = {
  dal_documento: 'bg-brand-light text-brand-dark',
  da_verificare: 'bg-semantic-amber-bg text-semantic-amber',
  non_trovato:   'bg-neutral-600/7 text-neutral-600',
}

const CONFIDENCE_LABEL = { alta: 'alta', media: 'media', bassa: 'bassa' } as const

// Da dove viene il valore di un campo proposto dal documento: stato a tre
// valori, confidenza e citazione. È l'unica parte della revisione che il
// wizard manuale non ha; i campi restano gli stessi componenti condivisi.
// `format` rende leggibile il valore PROPOSTO quando non coincide con quello
// mostrato dal campo (es. un "No" da confermare su una dotazione).
export function FieldProvenance<T>({
  field,
  format,
}: {
  field: DraftField<T>
  format?: (value: T) => string
}) {
  return (
    <div className="mt-1 space-y-0.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cn(PILL_BASE, STATE_STYLES[field.state])}>{FIELD_STATE_LABEL[field.state]}</span>
        {field.state !== 'non_trovato' && field.confidence && (
          <span className="text-xs text-text-secondary">confidenza {CONFIDENCE_LABEL[field.confidence]}</span>
        )}
        {field.state !== 'non_trovato' && format && (
          <span className="text-xs text-text-secondary">proposta: {format(field.value)}</span>
        )}
      </div>
      {field.state === 'non_trovato' && (
        <p className="text-xs text-text-secondary">Il documento non lo dice.</p>
      )}
      {field.state !== 'non_trovato' && (
        field.citation
          ? <p className="text-xs text-text-secondary italic">&ldquo;{field.citation}&rdquo;</p>
          : <p className="text-xs text-text-secondary">Nessuna citazione dal documento.</p>
      )}
    </div>
  )
}
