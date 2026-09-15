'use client'

import { createContext, useContext, type KeyboardEvent, type TdHTMLAttributes, type ThHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/**
 * Soglia sotto la quale la tabella diventa una pila di card: mai scroll
 * orizzontale. Sotto la soglia ogni riga è una card, la cella `emphasis` ne è il
 * titolo e ogni altra cella è una riga "etichetta · valore". Stesso markup a ogni
 * larghezza: cambia solo il CSS, nessuna seconda resa da tenere allineata.
 *
 * Mai tabella compressa sotto lg (D7): la soglia minima è `lg`. `xl` per le
 * tabelle le cui colonne non stanno nei 736px di contenuto che restano a lg
 * accanto alla sidebar. Le classi sono scritte per intero per ogni soglia
 * perché Tailwind genera solo classi che trova letterali nel sorgente.
 */
export type TableStack = 'lg' | 'xl'

const STACK: Record<TableStack, {
  wrapper: string
  table: string
  head: string
  body: string
  row: string
  cell: string
  emphasis: string
  unlabeled: string
  label: string
  value: string
}> = {
  lg: {
    wrapper:   'max-lg:overflow-visible max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent',
    table:     'max-lg:block',
    head:      'max-lg:hidden',
    body:      'max-lg:flex max-lg:flex-col max-lg:gap-3',
    row:       'max-lg:flex max-lg:h-auto max-lg:flex-col max-lg:gap-2 max-lg:rounded-xl max-lg:border max-lg:border-border max-lg:bg-surface max-lg:p-4 max-lg:last:border-b',
    cell:      'max-lg:flex max-lg:items-start max-lg:justify-between max-lg:gap-3 max-lg:px-0 max-lg:empty:hidden',
    emphasis:  'max-lg:order-first',
    unlabeled: 'max-lg:justify-end',
    label:     'lg:hidden',
    value:     'max-lg:min-w-0 max-lg:text-right max-lg:line-clamp-2',
  },
  xl: {
    wrapper:   'max-xl:overflow-visible max-xl:rounded-none max-xl:border-0 max-xl:bg-transparent',
    table:     'max-xl:block',
    head:      'max-xl:hidden',
    body:      'max-xl:flex max-xl:flex-col max-xl:gap-3',
    row:       'max-xl:flex max-xl:h-auto max-xl:flex-col max-xl:gap-2 max-xl:rounded-xl max-xl:border max-xl:border-border max-xl:bg-surface max-xl:p-4 max-xl:last:border-b',
    cell:      'max-xl:flex max-xl:items-start max-xl:justify-between max-xl:gap-3 max-xl:px-0 max-xl:empty:hidden',
    emphasis:  'max-xl:order-first',
    unlabeled: 'max-xl:justify-end',
    label:     'xl:hidden',
    value:     'max-xl:min-w-0 max-xl:text-right max-xl:line-clamp-2',
  },
}

const TableStackContext = createContext<TableStack>('lg')

function useStack() {
  return STACK[useContext(TableStackContext)]
}

export function Table({ stack, children }: { stack: TableStack; children: React.ReactNode }) {
  const s = STACK[stack]
  return (
    <TableStackContext.Provider value={stack}>
      <div className={cn('w-full overflow-x-auto rounded-xl border border-border bg-surface', s.wrapper)}>
        <table className={cn('w-full border-collapse text-sm', s.table)}>{children}</table>
      </div>
    </TableStackContext.Provider>
  )
}

export function TableHeader({ children }: { children: React.ReactNode }) {
  const s = useStack()
  return (
    <thead className={s.head}>
      <tr className="border-b border-border">{children}</tr>
    </thead>
  )
}

export function TableHead({ className, children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn('h-12 px-4 text-left text-[13px] font-medium text-neutral-500', className)}
      {...props}
    >
      {children}
    </th>
  )
}

export function TableBody({ children }: { children: React.ReactNode }) {
  const s = useStack()
  return <tbody className={s.body}>{children}</tbody>
}

interface TableRowProps {
  children: React.ReactNode
  clickable?: boolean
  onClick?: () => void
  className?: string
}

/** Ultima riga senza bordo: gestito da :last-child, non serve una prop dedicata. */
export function TableRow({ children, clickable, onClick, className }: TableRowProps) {
  const s = useStack()

  function handleKeyDown(e: KeyboardEvent<HTMLTableRowElement>) {
    if (!onClick) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <tr
      onClick={onClick}
      onKeyDown={clickable ? handleKeyDown : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      className={cn(
        'h-12 border-b border-border last:border-b-0 hover:bg-background',
        s.row,
        clickable && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-dark/30',
        className
      )}
    >
      {children}
    </tr>
  )
}

interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean
  emphasis?: boolean
  /**
   * Etichetta mostrata solo nella resa a card, dove l'intestazione di colonna
   * non c'è. Obbligatoria per le celle che non sono il titolo della card; una
   * cella senza etichetta e senza contenuto sparisce dalla card.
   * Nella card l'etichetta non va mai a capo né si comprime; il valore si ferma
   * a due righe con i puntini, allineato in alto. Mai una riga sola: su una card
   * lo spazio verticale c'è, e un indirizzo tagliato a metà nasconde un dato.
   */
  label?: string
}

export function TableCell({ className, numeric, emphasis, label, children, ...props }: TableCellProps) {
  const s = useStack()
  return (
    <td
      className={cn(
        'px-4 text-neutral-900',
        s.cell,
        numeric && 'text-right tabular-nums',
        emphasis && cn('font-medium', s.emphasis),
        !label && !emphasis && s.unlabeled,
        className
      )}
      {...props}
    >
      {label ? (
        <>
          <span className={cn('text-[13px] font-medium text-neutral-500 whitespace-nowrap flex-shrink-0', s.label)}>{label}</span>
          <span className={s.value}>{children}</span>
        </>
      ) : children}
    </td>
  )
}
