'use client'

import type { KeyboardEvent } from 'react'

// Tab della pagina Documenti.
// Tastiera come da pattern WAI-ARIA: frecce e Home/End spostano la selezione,
// e solo il tab attivo è raggiungibile con Tab.
// "Da rivedere" (E1b-8) mostra il numero di documenti da rivedere, se ce ne sono:
// non confonderlo con "Da verificare" (classificazione aperta).
// "Parti comuni" mostra caricati/totale come testo (es. "2/16"), anche a zero: non è
// un avviso, quindi nessun colore d'allerta.
const TABS = [
  { id: 'panoramica', label: 'Panoramica' },
  { id: 'tutti', label: 'Tutti i documenti' },
  { id: 'parti-comuni', label: 'Parti comuni' },
  { id: 'da-rivedere', label: 'Da rivedere' },
] as const

export type DocumentTabId = (typeof TABS)[number]['id']

export const tabId = (id: DocumentTabId) => `documenti-tab-${id}`
export const tabPanelId = (id: DocumentTabId) => `documenti-tabpanel-${id}`

function badgeVisible(count: number | string | undefined): boolean {
  return typeof count === 'string' ? count !== '' : (count ?? 0) > 0
}

export function DocumentTabs({ value, onChange, counts }: {
  value: DocumentTabId
  onChange: (id: DocumentTabId) => void
  // numero: mostrato se maggiore di zero; testo: mostrato se non vuoto (es. "2/16").
  counts?: Partial<Record<DocumentTabId, number | string>>
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
            {badgeVisible(counts?.[t.id]) && (
              <span className="ml-2 inline-flex min-w-5 justify-center rounded-full bg-brand-light px-1.5 text-xs font-medium text-brand-dark">
                {counts?.[t.id]}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
