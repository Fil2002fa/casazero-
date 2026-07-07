'use client'

import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

type ModalSize = 'confirm' | 'form'

const SIZE_STYLES: Record<ModalSize, string> = {
  confirm: 'max-w-md',
  form:    'max-w-lg',
}

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
  useEffect(() => {
    if (!open) return

    document.body.style.overflow = 'hidden'
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-modal-backdrop flex items-center justify-center p-4 bg-brand-dark/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn('z-modal w-full rounded-xl bg-surface p-6 shadow-elevated', SIZE_STYLES[size])}
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
