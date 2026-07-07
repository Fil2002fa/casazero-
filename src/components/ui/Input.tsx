import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const FIELD_BASE =
  'w-full h-11 md:h-9 rounded-lg border border-border bg-surface px-3 text-sm text-neutral-900 ' +
  'placeholder:text-neutral-500 ' +
  'focus:outline-none focus:border-brand-dark focus:ring-3 focus:ring-brand-dark/12 ' +
  'disabled:opacity-40 disabled:pointer-events-none'

const FIELD_ERROR = 'border-status-overdue focus:border-status-overdue focus:ring-status-overdue/12'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className, ...props }, ref) => (
    <input ref={ref} className={cn(FIELD_BASE, error && FIELD_ERROR, className)} {...props} />
  )
)
Input.displayName = 'Input'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(FIELD_BASE, 'h-auto min-h-[5.5rem] py-2 resize-none', error && FIELD_ERROR, className)}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, className, ...props }, ref) => (
    <select ref={ref} className={cn(FIELD_BASE, error && FIELD_ERROR, className)} {...props} />
  )
)
Select.displayName = 'Select'

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('block text-[13px] font-medium text-neutral-700 mb-2', className)} {...props} />
}

export function FieldHelp({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-neutral-500">{children}</p>
}

/** Il messaggio deve sempre dire come riparare, non solo cosa è andato storto. */
export function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-status-overdue">{children}</p>
}
