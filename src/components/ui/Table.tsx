import type { KeyboardEvent, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  )
}

export function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-border">{children}</tr>
    </thead>
  )
}

export function TableHead({ className, children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn('h-12 px-4 text-left text-[13px] font-medium text-neutral-500', className)}
      {...props}
    >
      {children}
    </th>
  )
}

export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>
}

interface TableRowProps {
  children: React.ReactNode
  clickable?: boolean
  onClick?: () => void
  className?: string
}

/** Ultima riga senza bordo: gestito da :last-child, non serve una prop dedicata. */
export function TableRow({ children, clickable, onClick, className }: TableRowProps) {
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
}

export function TableCell({ className, numeric, emphasis, children, ...props }: TableCellProps) {
  return (
    <td
      className={cn(
        'px-4 text-neutral-900',
        numeric && 'text-right tabular-nums',
        emphasis && 'font-medium',
        className
      )}
      {...props}
    >
      {children}
    </td>
  )
}
