import { FileSearch } from 'lucide-react'
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
    <details className="mt-2">
      <summary className="inline-flex w-fit cursor-pointer select-none items-center gap-1.5 text-sm font-medium text-brand-medium hover:text-brand-dark">
        <FileSearch className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
        Vedi nel documento
      </summary>
      {/* Riquadro bianco con filo a sinistra: una citazione, non un campo da compilare. */}
      <div className="mt-2 mb-1 rounded-r-lg border border-border border-l-4 border-l-brand-medium bg-white px-3 py-2.5">
        <p className="text-xs font-medium text-text-secondary">Dal documento</p>
        <blockquote className="mt-1 text-sm leading-relaxed text-text-primary">{citation}</blockquote>
      </div>
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
    <div className="mt-2 mb-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
        <span className={cn(PILL_BASE, 'h-5 px-2', STATE_STYLES[field.state])}>{FIELD_STATE_LABEL[field.state]}</span>
        {field.state !== 'non_trovato' && field.confidence && <span>confidenza {field.confidence}</span>}
        {field.state !== 'non_trovato' && format && <span>· proposta {format(field.value)}</span>}
      </div>
      {field.state !== 'non_trovato' && field.citation && <CitationDetails citation={field.citation} />}
    </div>
  )
}
