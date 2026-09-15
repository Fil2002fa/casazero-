import Link from 'next/link'
import { cn } from '@/lib/cn'

export type CounterTone = 'overdue' | 'inprogress' | 'neutral'

export type CounterItem = {
  key: string
  label: string
  value: number
  tone: CounterTone
  active: boolean
} & (
  // Link quando il filtro vive nell'URL, bottone quando vive nello stato del client.
  | { href: string; onClick?: never }
  | { onClick: () => void; href?: never }
)

// A riposo il numero prende il colore solo se c'è qualcosa da contare: uno zero
// resta neutro (Regola del Silenzio, DESIGN.md). Il filtro attivo è a tinta piena
// con testo bianco, come la voce selezionata della sidebar. Famiglia status-*:
// è un componente nuovo, e i componenti nuovi non usano semantic-*.
const TONES: Record<CounterTone, { value: string; active: string }> = {
  overdue:    { value: 'text-status-overdue',    active: 'bg-status-overdue' },
  inprogress: { value: 'text-status-inprogress', active: 'bg-status-inprogress' },
  neutral:    { value: 'text-neutral-900',       active: 'bg-brand-dark' },
}

const ROW =
  'flex items-center justify-between gap-3 h-11 px-4 transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-brand-dark/20'

/**
 * Contatori-filtro: ogni contatore è una riga compatta, etichetta a sinistra e
 * numero a destra, con la stessa grammatica delle righe "etichetta · valore"
 * delle card di tabella. Un solo contenitore: righe impilate sotto sm, tre
 * colonne da sm in su. Pensato per tre contatori.
 */
export function FilterCounters({ label, items }: { label: string; items: CounterItem[] }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="rounded-xl border border-border bg-surface overflow-hidden divide-y divide-border sm:grid sm:grid-cols-3 sm:divide-y-0 sm:divide-x"
    >
      {items.map(item => {
        const tone = TONES[item.tone]
        const className = cn(ROW, item.active ? tone.active : 'hover:bg-background')
        const content = (
          <>
            <span className={cn('text-[13px] font-medium', item.active ? 'text-white' : 'text-neutral-500')}>
              {item.label}
            </span>
            <span
              className={cn(
                'text-sm font-medium tabular-nums',
                item.active ? 'text-white' : item.value > 0 ? tone.value : 'text-neutral-900'
              )}
            >
              {item.value}
            </span>
          </>
        )

        return item.href !== undefined ? (
          <Link
            key={item.key}
            href={item.href}
            aria-current={item.active ? 'true' : undefined}
            className={className}
          >
            {content}
          </Link>
        ) : (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            aria-pressed={item.active}
            className={cn(className, 'w-full cursor-pointer')}
          >
            {content}
          </button>
        )
      })}
    </div>
  )
}
