import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type ButtonSize = 'default' | 'table'

const BASE =
  'inline-flex items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors ' +
  'disabled:opacity-40 disabled:pointer-events-none ' +
  'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-offset-2'

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:   'bg-brand-dark text-white hover:bg-[#0B4A40]',
  secondary: 'bg-surface border border-border text-neutral-900 hover:bg-background',
  ghost:     'text-neutral-600 hover:bg-brand-dark/6',
  /** Solo nel footer di una Modal di conferma distruttiva. Non esiste come bottone rosso in pagina. */
  destructive: 'bg-status-overdue text-white hover:bg-[#961F15]',
}

const SIZE_STYLES: Record<ButtonSize, string> = {
  /** h-11 (44px) su touch, h-9 (36px) da md in su: stesso pattern di Input per le superfici (app) mobile. */
  default: 'h-11 md:h-9',
  /** Solo dentro righe tabella — contesto desktop (dashboard), non serve variante touch. */
  table:   'h-8',
}

export function buttonVariants(variant: ButtonVariant = 'primary', size: ButtonSize = 'default', className?: string) {
  return cn(BASE, VARIANT_STYLES[variant], SIZE_STYLES[size], className)
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

/**
 * Dentro righe tabella usare solo variant secondary/ghost con size="table" — mai primary.
 * Azioni distruttive non hanno variant dedicata: il rosso vive solo nel footer della Modal di conferma.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'default', className, ...props }, ref) => {
    return <button ref={ref} className={buttonVariants(variant, size, className)} {...props} />
  }
)
Button.displayName = 'Button'
