'use client'

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

// 'warning' = avviso che chiede un controllo senza essere un errore (ambra, non rosso).
type ToastKind = 'success' | 'error' | 'warning'

// Opzioni facoltative. `persistent`: non si chiude da solo, ha la X e resta finché
// qualcuno lo chiude (per gli avvisi che chiedono un controllo e non devono
// sparire mentre si guarda altrove). `action`: un bottone che esegue il gesto e
// chiude il toast.
export interface ToastOptions {
  persistent?: boolean
  action?: { label: string; onClick: () => void }
}

interface ToastState {
  id: number
  kind: ToastKind
  message: string
  options?: ToastOptions
}

const DURATIONS: Record<ToastKind, number> = {
  success: 4000,
  error: 8000,
  warning: 8000,
}

type ToastPlacement = 'app' | 'dashboard'

const PLACEMENT_STYLES: Record<ToastPlacement, string> = {
  // PWA residente: basso-destra da md; sotto md basso-centro sopra la BottomNav,
  // largo quanto il testo ma mai oltre lo schermo (come la dashboard sotto lg).
  app: 'bottom-4 right-4 max-md:bottom-20 max-md:left-1/2 max-md:right-auto max-md:-translate-x-1/2 max-md:w-max max-md:max-w-[calc(100vw-2rem)]',
  // Dashboard: non ha BottomNav. Basso-destra da lg, accanto alla sidebar; sotto lg
  // basso-centro senza offset, largo quanto il testo ma mai oltre lo schermo.
  dashboard:
    'bottom-4 right-4 max-lg:left-1/2 max-lg:right-auto max-lg:-translate-x-1/2 max-lg:w-max max-lg:max-w-[calc(100vw-2rem)]',
}

interface ToastContextValue {
  showToast: (kind: ToastKind, message: string, options?: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/**
 * Uno alla volta: un nuovo toast rimpiazza quello in corso invece di accodarsi.
 * `placement` dipende dalla shell: il layout radice usa 'app', la dashboard annida
 * un provider suo con 'dashboard'. useToast prende il provider più vicino.
 */
export function ToastProvider({ children, placement = 'app' }: { children: ReactNode; placement?: ToastPlacement }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idRef = useRef(0)

  const showToast = useCallback((kind: ToastKind, message: string, options?: ToastOptions) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    idRef.current += 1
    const id = idRef.current
    setToast({ id, kind, message, options })
    if (options?.persistent) {
      timeoutRef.current = null
      return
    }
    timeoutRef.current = setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current))
    }, DURATIONS[kind])
  }, [])

  const dismiss = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    setToast(null)
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
              PLACEMENT_STYLES[placement]
            )}
          >
            {toast.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-brand-dark" strokeWidth={1.8} />
            ) : toast.kind === 'warning' ? (
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-semantic-amber" strokeWidth={1.8} />
            ) : (
              <XCircle className="w-4 h-4 flex-shrink-0 text-status-overdue" strokeWidth={1.8} />
            )}
            <span className="text-neutral-900">{toast.message}</span>
            {toast.options?.action && (
              <button
                type="button"
                onClick={() => {
                  const action = toast.options?.action
                  dismiss()
                  action?.onClick()
                }}
                className="flex-shrink-0 rounded-md border border-brand-medium px-2.5 py-1 text-xs font-medium text-brand-dark hover:bg-brand-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium"
              >
                {toast.options.action.label}
              </button>
            )}
            {toast.options?.persistent && (
              <button
                type="button"
                onClick={dismiss}
                aria-label="Chiudi avviso"
                className="flex-shrink-0 rounded-md p-1 text-text-secondary hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium"
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.8} />
              </button>
            )}
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
