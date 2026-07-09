'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

type ModalSize = 'confirm' | 'form'

const SIZE_STYLES: Record<ModalSize, string> = {
  confirm: 'max-w-md',
  form:    'max-w-lg',
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  size?: ModalSize
  footer?: ReactNode
  children: ReactNode
}

/** Una modale non apre mai un'altra modale. */
export function Modal({ open, onClose, title, size = 'confirm', footer, children }: ModalProps) {
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
      className="fixed inset-0 z-modal-backdrop flex items-center justify-center p-4 bg-brand-dark/40"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className={cn('z-modal w-full rounded-xl bg-surface p-6 shadow-elevated outline-none', SIZE_STYLES[size])}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="modal-title" className="text-lg font-semibold text-neutral-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Chiudi"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-neutral-600 hover:bg-brand-dark/6 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-offset-2"
          >
            <X className="w-4 h-4" strokeWidth={1.8} />
          </button>
        </div>

        <div>{children}</div>

        {footer && <div className="flex items-center justify-end gap-3 mt-6">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
