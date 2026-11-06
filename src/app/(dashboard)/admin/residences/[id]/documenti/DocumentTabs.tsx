'use client'

import type { KeyboardEvent } from 'react'

// Tab della pagina Documenti. Oggi due; i commit 8 (Da rivedere) e 9 (Parti
// comuni) aggiungono una voce a TABS e il pannello corrispondente.
// Tastiera come da pattern WAI-ARIA: frecce e Home/End spostano la selezione,
// e solo il tab attivo è raggiungibile con Tab.
const TABS = [
  { id: 'panoramica', label: 'Panoramica' },
  { id: 'tutti', label: 'Tutti i documenti' },
] as const

export type DocumentTabId = (typeof TABS)[number]['id']

export const tabId = (id: DocumentTabId) => `documenti-tab-${id}`
export const tabPanelId = (id: DocumentTabId) => `documenti-tabpanel-${id}`

export function DocumentTabs({ value, onChange }: {
  value: DocumentTabId
  onChange: (id: DocumentTabId) => void
}) {
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index
    if (e.key === 'ArrowRight') next = (index + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    else return
    e.preventDefault()
    onChange(TABS[next].id)
    document.getElementById(tabId(TABS[next].id))?.focus()
  }

  return (
    <div role="tablist" aria-label="Sezioni dei documenti" className="flex gap-1 border-b border-border">
      {TABS.map((t, i) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            id={tabId(t.id)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={tabPanelId(t.id)}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={e => onKeyDown(e, i)}
            className={`-mb-px px-4 py-2 text-sm font-medium border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium rounded-t ${
              active
                ? 'border-brand-medium text-brand-dark'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
