import { FIELD_STATE_LABEL, type DraftField, type FieldState } from '@/lib/residence-draft'
import { PILL_BASE } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'

const STATE_STYLES: Record<FieldState, string> = {
  dal_documento: 'bg-brand-light text-brand-dark',
  da_verificare: 'bg-semantic-amber-bg text-semantic-amber',
  non_trovato:   'bg-neutral-600/7 text-neutral-600',
}

// Citazione del documento, chiusa di default: la riga di provenienza resta
// una sola, chi vuole controllare la apre. Riusata anche per suggerimenti
// che non sono un DraftField (es. la data di agibilità).
export function CitationDetails({ citation }: { citation: string }) {
  return (
    <details className="mt-0.5 text-xs text-text-secondary">
      <summary className="cursor-pointer select-none text-brand-medium w-fit">Vedi nel documento</summary>
      <p className="mt-1 italic">&ldquo;{citation}&rdquo;</p>
    </details>
  )
}

// Da dove viene il valore di un campo proposto dal documento: una riga piccola
// con pillola di stato e confidenza, la citazione in un dettaglio chiuso.
// È l'unica parte della revisione che il wizard manuale non ha; i campi
// restano gli stessi componenti condivisi.
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
    <div className="mt-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
        <span className={cn(PILL_BASE, 'h-5 px-2', STATE_STYLES[field.state])}>{FIELD_STATE_LABEL[field.state]}</span>
        {field.state !== 'non_trovato' && field.confidence && <span>confidenza {field.confidence}</span>}
        {field.state !== 'non_trovato' && format && <span>· proposta {format(field.value)}</span>}
      </div>
      {field.state !== 'non_trovato' && field.citation && <CitationDetails citation={field.citation} />}
    </div>
  )
}
