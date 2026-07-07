'use client'

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

type ToastKind = 'success' | 'error'

interface ToastState {
  id: number
  kind: ToastKind
  message: string
}

const DURATIONS: Record<ToastKind, number> = {
  success: 4000,
  error: 8000,
}

interface ToastContextValue {
  showToast: (kind: ToastKind, message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** Uno alla volta: un nuovo toast rimpiazza quello in corso invece di accodarsi. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idRef = useRef(0)

  const showToast = useCallback((kind: ToastKind, message: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    idRef.current += 1
    const id = idRef.current
    setToast({ id, kind, message })
    timeoutRef.current = setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current))
    }, DURATIONS[kind])
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            className={cn(
              'fixed z-toast flex items-center gap-2 rounded-lg border border-border bg-surface p-3 shadow-elevated text-sm',
              'bottom-4 right-4',
              'max-md:bottom-20 max-md:left-1/2 max-md:right-auto max-md:-translate-x-1/2'
            )}
          >
            {toast.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-brand-dark" strokeWidth={1.8} />
            ) : (
              <XCircle className="w-4 h-4 flex-shrink-0 text-status-overdue" strokeWidth={1.8} />
            )}
            <span className="text-neutral-900">{toast.message}</span>
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast va chiamato dentro <ToastProvider>')
  return ctx
}
