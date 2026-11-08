'use client'

import { useMemo, useRef, useState } from 'react'
import { AwaitingDeliveryChip } from '@/components/AwaitingDelivery'
import { PromemoriaBadge } from '@/components/ui/Badge'
import { Input, Select } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { formatDateIT } from '@/lib/formatDate'
import { formatFrequency } from '@/lib/formatFrequency'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import {
  buildMaintenanceList, filterRows, groupRows, hasActiveFilters, itemsForUnit, listSummary, rowScopeLabel, summaryPills,
  type ListCompletion, type ListGroupKey, type ListItem, type ListPillKind, type MaintenanceListRow,
} from '@/lib/maintenance-list'
import { MODE_LABELS, OBLIGATION_LABELS } from '@/lib/maintenance-labels'
import type { ObligationType } from '@/types/database'
import { StateBadge } from './StateBadge'

// Lista del piano per voce (tab Attive). Regola, ordine e testi stanno in
// src/lib/maintenance-list.ts (verify:maintlist): qui solo lo schermo.
//
// Una riga è una VOCE (template), non una unità. Le colonne sono le stesse in
// tutti i gruppi: l'intestazione compare una volta sola e i gruppi sono righe
// di separazione. Su schermi stretti la griglia scorre in orizzontale dentro il
// suo box, il resto della pagina no.
//
// Promemoria: stanno nel gruppo "Consigliate" e in Stato, Prossima e Ultima
// hanno un trattino neutro. Il componente non legge status né date di quelle
// righe, che il helper ha già lasciato a null.
//
// Tutta la riga è cliccabile. Il click vive sulla <li>; il bottone col nome
// serve alla tastiera e agli screen reader (Invio e Spazio generano un click
// che risale alla riga): nessun elemento interattivo ne contiene un altro.
// L'intestazione è aria-hidden: ogni cella porta la sua etichetta per gli
// screen reader (sr-only).

const COLS =
  'grid grid-cols-[minmax(13rem,2.4fr)_9rem_7.5rem_12rem_9rem_7rem_6rem] gap-x-3 px-4'

const PILL_STYLES: Record<ListPillKind, string> = {
  overdue: 'bg-semantic-red-bg text-semantic-red',
  soon: 'bg-semantic-amber-bg text-semantic-amber',
  clear: 'bg-brand-light text-brand-dark',
}

const GROUP_TITLE_STYLES: Partial<Record<ListGroupKey, string>> = {
  scaduta: 'text-semantic-red',
  entro_30: 'text-semantic-amber',
}

const TOGGLE_BASE =
  'flex-shrink-0 rounded-lg border px-3 h-11 md:h-9 text-sm font-medium transition-colors cursor-pointer ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium'

type Props = {
  items: readonly ListItem[]
  completions: readonly ListCompletion[]
  /** Data di oggi (ISO), calcolata dal server: stessa per server e client. */
  today: string
  unitOptions: readonly { id: string; label: string }[]
  selectedUnitId: string | null
  onSelectUnit: (unitId: string | null) => void
  /** Apre il pannello di dettaglio della voce. */
  onOpen: (templateId: string) => void
  /** Azione a destra delle pillole (oggi: il passaggio alla vista per unità). */
  headerAction?: React.ReactNode
}

export function MaintenanceList({ items, completions, today, unitOptions, selectedUnitId, onSelectUnit, onOpen, headerAction }: Props) {
  const [query, setQuery] = useState('')
  const [lawOnly, setLawOnly] = useState(false)
  const [adminOnly, setAdminOnly] = useState(false)

  // Pillole: sulle righe INTERE di tutta la residenza, mai filtrate da unità,
  // ricerca e toggle.
  const allRows = useMemo(() => buildMaintenanceList(items, completions, today), [items, completions, today])
  const scopedRows = useMemo(
    () => (selectedUnitId === null ? allRows : buildMaintenanceList(itemsForUnit(items, selectedUnitId), completions, today)),
    [allRows, items, completions, today, selectedUnitId],
  )
  const filters = { query, unitId: selectedUnitId, lawOnly, adminOnly }
  const groups = groupRows(filterRows(scopedRows, filters))
  const pills = summaryPills(listSummary(allRows))
  const filtered = hasActiveFilters(filters)

  function showAll() {
    setQuery('')
    setLawOnly(false)
    setAdminOnly(false)
    onSelectUnit(null)
  }

  return (
    <section className="space-y-4" aria-label="Voci del piano di manutenzione">
      {(pills.length > 0 || headerAction) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {pills.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="Riepilogo del piano">
              {pills.map(p => (
                <li key={p.kind} className={`rounded-full px-3 py-1 text-xs font-medium ${PILL_STYLES[p.kind]}`}>
                  {p.text}
                </li>
              ))}
            </ul>
          ) : <span />}
          {headerAction}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[12rem]">
          <Input
            type="search"
            name="cerca-voce"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cerca una voce o un sistema…"
            aria-label="Cerca una voce o un sistema"
          />
        </div>
        {unitOptions.length > 0 && (
          <div className="min-w-[10rem]">
            <Select
              name="filtra-unita"
              value={selectedUnitId ?? ''}
              onChange={e => onSelectUnit(e.target.value || null)}
              aria-label="Filtra per unità"
            >
              <option value="">Tutte le unità</option>
              {unitOptions.map(u => (
                <option key={u.id} value={u.id}>{formatUnitLabel(u.label)}</option>
              ))}
            </Select>
          </div>
        )}
        <button
          type="button"
          onClick={() => setLawOnly(v => !v)}
          aria-pressed={lawOnly}
          className={cn(TOGGLE_BASE, lawOnly
            ? 'border-brand-medium bg-brand-light/40 text-brand-dark'
            : 'border-border bg-surface text-text-secondary hover:bg-background')}
        >
          Solo obblighi di legge
        </button>
        <button
          type="button"
          onClick={() => setAdminOnly(v => !v)}
          aria-pressed={adminOnly}
          className={cn(TOGGLE_BASE, adminOnly
            ? 'border-brand-medium bg-brand-light/40 text-brand-dark'
            : 'border-border bg-surface text-text-secondary hover:bg-background')}
        >
          Solo dell’amministratore
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-8 text-center space-y-3">
          <p className="text-sm text-text-secondary">
            {filtered ? 'Nessuna voce corrisponde ai filtri.' : 'Nessuna voce nel piano attivo.'}
          </p>
          {filtered && (
            <button
              type="button"
              onClick={showAll}
              className="rounded-lg border border-border bg-surface px-3 h-11 md:h-9 text-sm font-medium text-brand-dark hover:bg-background cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium"
            >
              Mostra tutte
            </button>
          )}
        </div>
      ) : (
        // relative: gli span sr-only sono assoluti; senza un antenato posizionato
        // sfuggono al box e allargano lo scorrimento di tutta la pagina.
        <div className="relative overflow-x-auto rounded-xl border border-border bg-surface">
          <div className="min-w-[70rem]">
            <div aria-hidden="true" className={cn(COLS, 'py-2 border-b border-border bg-background text-xs font-medium text-text-secondary')}>
              <span>Voce</span>
              <span>Obbligo</span>
              <span>Chi la chiude</span>
              <span>Frequenza</span>
              <span>Stato</span>
              <span>Prossima</span>
              <span>Ultima</span>
            </div>
            {groups.map(g => (
              <section key={g.key} aria-label={g.label}>
                <h3 className={cn(
                  'px-4 py-2 border-b border-border bg-background/60 text-xs font-medium',
                  GROUP_TITLE_STYLES[g.key] ?? 'text-text-secondary',
                )}>
                  {g.label} · {g.rows.length}
                </h3>
                <ul className="divide-y divide-border border-b border-border">
                  {g.rows.map(row => (
                    <ListRow key={row.templateId} row={row} onOpen={onOpen} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function ListRow({ row, onOpen }: { row: MaintenanceListRow; onOpen: (templateId: string) => void }) {
  const scope = rowScopeLabel(row)
  const buttonRef = useRef<HTMLButtonElement>(null)
  // Un clic sulla <li> non focalizza niente (e Safari non focalizza il bottone
  // al clic): il focus va sul bottone PRIMA di aprire il pannello, così alla
  // chiusura useDialogFocus lo restituisce a questa riga e non al body.
  function open() {
    buttonRef.current?.focus()
    onOpen(row.templateId)
  }
  return (
    <li
      onClick={open}
      className="cursor-pointer py-3 transition-colors hover:bg-background"
    >
      <div className={cn(COLS, 'items-center')}>
        <div className="min-w-0">
          <button
            ref={buttonRef}
            type="button"
            className="block max-w-full text-left text-sm font-medium text-text-primary break-words cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium rounded"
          >
            {row.title}
          </button>
          <span className="block text-xs text-text-secondary">{row.category} · {scope}</span>
        </div>

        <Cell label="Obbligo"><ObligationCell obligations={row.obligations} /></Cell>

        <Cell label="Chi la chiude">
          {row.modes.length === 0 ? <Dash /> : row.modes.length > 1 ? <Mixed /> : (
            <span className="text-sm text-text-primary">{MODE_LABELS[row.modes[0]]}</span>
          )}
        </Cell>

        <Cell label="Frequenza"><FrequencyCell row={row} /></Cell>

        <Cell label="Stato">
          {row.group === 'consigliate' ? <Dash /> : (
            <div className="space-y-1">
              <StateBadge state={row.group} />
              {row.awaitingCount > 0 && row.awaitingCount < row.timedCount && (
                <div><AwaitingDeliveryChip count={row.awaitingCount} total={row.timedCount} /></div>
              )}
            </div>
          )}
        </Cell>

        <Cell label="Prossima">
          {row.next === null ? <Dash /> : (
            <>
              <span className="block text-sm text-text-primary whitespace-nowrap">{formatDateIT(row.next.date)}</span>
              {row.next.unitLabel !== null && row.unitCount > 1 && (
                <span className="block text-xs text-text-secondary truncate" title={formatUnitLabel(row.next.unitLabel)}>
                  {formatUnitLabel(row.next.unitLabel)}
                </span>
              )}
            </>
          )}
        </Cell>

        <Cell label="Ultima">
          {row.last === null ? <Dash /> : (
            <span className="block text-sm text-text-primary whitespace-nowrap">{formatDateIT(row.last)}</span>
          )}
        </Cell>
      </div>
    </li>
  )
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="sr-only">{label}: </span>
      {children}
    </div>
  )
}

/** Trattino neutro: cella non applicabile o senza dato. Mai un testo di scadenza. */
function Dash() {
  return (
    <>
      <span aria-hidden="true" className="text-sm text-text-secondary">—</span>
      <span className="sr-only">non disponibile</span>
    </>
  )
}

function Mixed() {
  return (
    <span className="text-xs text-text-secondary" title="Valori diversi tra le unità">
      Valori diversi
    </span>
  )
}

// Obbligo di legge = badge pieno scuro con §; Raccomandata = badge a contorno;
// Consiglio = solo testo grigio.
function ObligationCell({ obligations }: { obligations: readonly ObligationType[] }) {
  if (obligations.length === 0) return <Dash />
  if (obligations.length > 1) return <Mixed />
  const type = obligations[0]
  if (type === 'A') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-dark h-[22px] px-2.5 text-xs font-medium text-white whitespace-nowrap">
        <span aria-hidden="true">§</span>{OBLIGATION_LABELS.A}
      </span>
    )
  }
  if (type === 'B') {
    return (
      <span className="inline-flex items-center rounded-full border border-neutral-600/40 bg-transparent h-[22px] px-2.5 text-xs font-medium text-neutral-600 whitespace-nowrap">
        {OBLIGATION_LABELS.B}
      </span>
    )
  }
  return <span className="text-xs text-text-secondary">{OBLIGATION_LABELS.C}</span>
}

// Le consigliate mostrano sempre "Consigliata · ogni X mesi", in blu: unico
// testo possibile (PromemoriaBadge non ha prop di stato).
function FrequencyCell({ row }: { row: MaintenanceListRow }) {
  if (row.frequencies.length === 0) return <Dash />
  if (row.frequencies.length > 1) return <Mixed />
  const months = row.frequencies[0]
  if (row.group === 'consigliate') return <PromemoriaBadge frequencyMonths={months} />
  return <span className="text-sm text-text-primary whitespace-nowrap">{formatFrequency(months)}</span>
}
