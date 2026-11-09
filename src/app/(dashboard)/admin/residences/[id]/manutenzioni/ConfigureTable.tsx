'use client'

import { useRef } from 'react'
import { cn } from '@/lib/cn'
import { formatFrequency } from '@/lib/formatFrequency'
import type { ConfigRow, Uniform } from '@/lib/maintenance-config'
import { MODE_LABELS } from '@/lib/maintenance-labels'
import { Cell, Dash, Mixed, ObligationCell } from './MaintenanceList'

// Tab Configura: una riga per voce del piano attivo. Regola e valori stanno in
// src/lib/maintenance-config.ts (verify:maintconfig): qui solo lo schermo. Un
// campo diverso tra le unità si legge "Valori diversi", mai uniformato.
// Stesso schema di click della lista: il click vive sulla <li>, il bottone col
// nome serve alla tastiera (nessun elemento interattivo ne contiene un altro).

const COLS =
  'grid grid-cols-[minmax(13rem,2.4fr)_9rem_8rem_8rem_10rem_minmax(9rem,1.4fr)] gap-x-3 px-4'

type Props = {
  rows: readonly ConfigRow[]
  /** Apre il pannello Configura della voce. */
  onOpen: (templateId: string) => void
}

export function ConfigureTable({ rows, onOpen }: Props) {
  if (rows.length === 0) {
    return (
      <div className="bg-surface rounded-xl border border-border p-8 text-center">
        <p className="text-sm text-text-secondary">Nessuna voce nel piano attivo.</p>
      </div>
    )
  }
  return (
    <section className="relative overflow-x-auto rounded-xl border border-border bg-surface" aria-label="Configurazione delle voci del piano">
      <div className="min-w-[64rem]">
        <div aria-hidden="true" className={cn(COLS, 'py-2 border-b border-border bg-background text-xs font-medium text-text-secondary')}>
          <span>Voce</span>
          <span>Obbligo</span>
          <span>Chi la chiude</span>
          <span>Frequenza</span>
          <span>Fornitore</span>
          <span>Garanzia</span>
        </div>
        <ul className="divide-y divide-border">
          {rows.map(row => <ConfigureRow key={row.templateId} row={row} onOpen={onOpen} />)}
        </ul>
      </div>
    </section>
  )
}

const SCOPE_LABEL = { unit: 'Unità', common: 'Parti comuni', mixed: 'Unità e parti comuni' } as const

function ConfigureRow({ row, onOpen }: { row: ConfigRow; onOpen: (templateId: string) => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  // Il focus va sul bottone PRIMA di aprire il pannello: alla chiusura
  // useDialogFocus lo restituisce a questa riga e non al body.
  function open() {
    buttonRef.current?.focus()
    onOpen(row.templateId)
  }
  return (
    <li onClick={open} className="cursor-pointer py-3 transition-colors hover:bg-background">
      <div className={cn(COLS, 'items-center')}>
        <div className="min-w-0">
          <button
            ref={buttonRef}
            type="button"
            className="block max-w-full text-left text-sm font-medium text-text-primary break-words cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium rounded"
          >
            {row.title}
          </button>
          <span className="block text-xs text-text-secondary">{row.category} · {SCOPE_LABEL[row.scope]}</span>
        </div>
        <Cell label="Obbligo">
          <Field u={row.obligation} render={v => v === null ? <Dash /> : <ObligationCell obligations={[v]} />} />
        </Cell>
        <Cell label="Chi la chiude">
          <Field u={row.mode} render={v => <span className="text-sm text-text-primary">{MODE_LABELS[v]}</span>} />
        </Cell>
        <Cell label="Frequenza">
          <Field u={row.frequency} render={v => v === null ? <Dash /> : <span className="text-sm text-text-primary whitespace-nowrap">{formatFrequency(v)}</span>} />
        </Cell>
        <Cell label="Fornitore">
          <Field u={row.supplier} render={v => v === null ? <Dash /> : <span className="block text-sm text-text-primary truncate" title={row.supplierName ?? undefined}>{row.supplierName ?? '—'}</span>} />
        </Cell>
        <Cell label="Garanzia">
          <Field u={row.warranty} render={v => v === null ? <Dash /> : <span className="block text-sm text-text-primary truncate" title={v}>{v}</span>} />
        </Cell>
      </div>
    </li>
  )
}

/** Un campo: nessun dato, uguale ovunque, oppure "Valori diversi". */
function Field<T>({ u, render }: { u: Uniform<T>; render: (v: T) => React.ReactNode }) {
  if (u.kind === 'empty') return <Dash />
  if (u.kind === 'mixed') return <Mixed />
  return <>{render(u.value)}</>
}
