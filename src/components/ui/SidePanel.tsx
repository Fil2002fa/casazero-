'use client'

import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useDialogFocus } from './useDialogFocus'

// Pannello a destra sopra la pagina: la pagina sotto non si sposta. Stesso
// aspetto del drawer della sidebar (sfondo scuro cliccabile, pannello z-modal)
// e stessa meccanica (useDialogFocus: focus iniziale sul primo elemento
// focusabile, cioè la X dell'intestazione; Tab intrappolato, Escape, scroll
// bloccato, focus restituito al trigger). Montato in portal su document.body
// come Modal. Estratto dal pannello di dettaglio di una voce (2a) perché lo
// usi anche il pannello Configura (3a): una sola implementazione del guscio.
//
// Il guscio non conosce il contenuto: titolo e sottotitolo nell'intestazione,
// il corpo è `children`. `open` comanda l'hook anche a pannello chiuso, così
// la chiusura restituisce il focus. `onClose` deve avere identità stabile
// (useCallback nel chiamante): se cambia a ogni render l'effetto del focus si
// riesegue e ruba il focus.

type Props = {
  open: boolean
  onClose: () => void
  /** Id dell'h2 del titolo, referenziato da aria-labelledby. */
  titleId: string
  title: string
  subtitle?: string
  children: ReactNode
}

export function SidePanel({ open, onClose, titleId, title, subtitle, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  useDialogFocus(open, onClose, panelRef)

  if (!open) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-modal-backdrop bg-brand-dark/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fixed inset-y-0 right-0 z-modal flex w-full max-w-xl flex-col overflow-y-auto bg-surface shadow-elevated outline-none"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-surface px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-text-primary break-words">
              {title}
            </h2>
            {subtitle !== undefined && <p className="text-xs text-text-secondary">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="inline-flex h-11 w-11 md:h-8 md:w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-background cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </header>

        {children}
      </div>
    </>,
    document.body,
  )
}
