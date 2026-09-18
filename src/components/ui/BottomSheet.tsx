'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  /** Riga di contesto sotto il titolo. Il nome accessibile resta `title`. */
  subtitle?: ReactNode
  children: ReactNode
}

/**
 * Variante mobile di Modal: ancorata al bordo inferiore, radius solo in alto,
 * handle di trascinamento visivo. Stesso focus trap/portal/Escape di Modal —
 * una modale non apre mai un'altra modale, vale anche per la bottom sheet.
 *
 * Il titolo è in Source Serif 4 come le intestazioni di pagina: la sheet apre
 * un atto formale (una scrittura nel fascicolo), non un'azione di servizio.
 *
 * Chiudi è il primo elemento focalizzabile: riceve il focus all'apertura e
 * apre il ciclo del Tab. Padding inferiore mai sotto 1rem, anche quando
 * safe-area-inset-bottom vale 0.
 */
export function BottomSheet({ open, onClose, title, subtitle, children }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'

    const panel = panelRef.current
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    ;(firstFocusable ?? panel)?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panel) return

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
      previouslyFocused.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-modal-backdrop flex items-end justify-center bg-brand-dark/40"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        tabIndex={-1}
        className={cn(
          'z-modal w-full max-w-lg rounded-t-xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-elevated outline-none',
          'max-h-[85vh] overflow-y-auto'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pb-3">
          <span className="h-1 w-10 rounded-full bg-border" aria-hidden="true" />
        </div>
        <div className="mb-4 flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <h2 id="sheet-title" className="font-serif text-[22px] font-semibold text-text-primary break-words">
              {title}
            </h2>
            {subtitle && <div className="text-sm text-text-secondary">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="flex items-center justify-center w-11 h-11 -mr-2 -mt-2 flex-shrink-0 rounded-lg text-text-secondary active:bg-background focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20"
          >
            <X className="w-5 h-5" strokeWidth={1.6} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}
