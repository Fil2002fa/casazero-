'use client'

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { PANEL_DRAWER_BREAKPOINT_PX } from '@/lib/document-panel'

// Involucro del pannello laterale (E1b, 6c-4). Da 1280px in su il pannello sta
// AFFIANCATO al contenuto (nessun involucro). Sotto 1280px diventa un CASSETTO
// sopra il contenuto: sfondo scuro, chiusura con la X del pannello, clic fuori
// o Esc. La scelta è fatta in JavaScript con la stessa soglia delle classi
// `xl:` del layout (PANEL_DRAWER_BREAKPOINT_PX), così il ruolo "dialog" c'è solo
// quando il pannello è davvero modale.

const QUERY = `(max-width: ${PANEL_DRAWER_BREAKPOINT_PX - 1}px)`

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function useIsDrawer(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false)
}

export function PanelShell({ onClose, label, children }: {
  onClose: () => void
  label: string
  children: ReactNode
}) {
  const drawer = useIsDrawer()
  const panelRef = useRef<HTMLDivElement>(null)
  // onClose cambia identità a ogni render del padre: letto da un ref perché
  // l'effetto (focus all'apertura, Esc) non deve rieseguirsi e rubare il focus
  // a un campo che si sta compilando.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    if (!drawer) return
    panelRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [drawer])

  if (!drawer) return <>{children}</>

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Clic fuori: lo sfondo non è un controllo da tastiera (la tastiera ha Esc e la X). */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="relative h-full w-full max-w-[640px] overflow-y-auto bg-surface shadow-elevated focus:outline-none"
      >
        {children}
      </div>
    </div>
  )
}
