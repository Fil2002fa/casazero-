'use client'

import { useMemo, useState } from 'react'
import { AlertCircle, Eye, Upload } from 'lucide-react'
import { REVIEW_LABEL, type DocRow, type UnitRow } from '@/lib/document-rows'
import { pluralize } from '@/lib/pluralize'
import {
  UNIT_EXPECTATIONS,
  documentsMentioningUnitWithoutAssignment,
  formatCellKeyData,
  unitDocumentRows,
  type UnitDocState,
  type UnitDocumentCell,
  type UnitExpectation,
} from '@/lib/unit-documents'
import {
  effectiveIncompleteOnly,
  filterMatrixRows,
  formatMatrixCount,
  isCompactMatrix,
  matrixEmptyState,
  type MatrixEmptyKind,
} from '@/lib/unit-matrix-view'
import { compareUnitLabels } from '@/lib/unit-utils'

// Quadro unità × documenti attesi (E1a D1-D2, E1b). Un solo componente per
// admin e super_admin: nessun dato dipende dal ruolo. Il calcolo è in
// unitDocumentRows, la stessa fonte della scheda "Riepilogo unità" dell'Excel.
// Considera solo i documenti assegnati a un'unità (documents.unit_id): un
// documento senza unità non compare mai qui, e l'unità citata nel testo non
// conta (decisione D2).
//
// Ogni cella è UN <button> intero (mai elementi interattivi annidati):
//   presente        verde chiaro, occhio, dati chiave → apre il pannello
//   mancante        bordo tratteggiato, "Carica" → apre il caricamento con
//                   unità e voce già scelte
//   da verificare   ambra, "!" → apre il pannello (che si apre in revisione
//                   perché la classificazione non è chiusa)
// Hover: bordo pieno e ombra leggera; il cursore a mano viene dal <button>
// stesso. Il focus da tastiera è sempre visibile.
//
// Modalità compatta (E1b-10): oltre COMPACT_UNIT_THRESHOLD unità (regola in
// unit-matrix-view.ts, verify:unitmatrix) compaiono ricerca per unità, toggle
// "Solo unità incomplete" (acceso di default) e contatore "N di M unità"; le
// celle mostrano solo icona e stato (dati chiave e versioni stanno nel
// tooltip e nell'aria-label, le versioni anche nel pannello); intestazione e
// colonna unità restano sticky. Sticky richiede un contenitore che scorra
// davvero in verticale: un overflow-x-auto senza altezza massima non scorre,
// quindi in compatta il contenitore ha una max-h. Fino a 12 unità il
// markup è identico a prima. Stato di toggle e ricerca solo client, non
// persistito: sparisce con il cambio di tab.

const STATE_LABELS: Record<UnitDocState, string> = {
  presente: 'Presente',
  da_verificare: REVIEW_LABEL,
  mancante: 'Mancante',
}

// Stato ambra: token ambra (semantic-amber su semantic-amber-bg, contrasto 5,9:1, verify:contrast). Il rosso resta per gli errori veri.
const CELL_STYLES: Record<UnitDocState, string> = {
  presente: 'border-brand-medium/30 bg-brand-light/50 hover:border-brand-medium',
  da_verificare: 'border-semantic-amber/60 bg-semantic-amber-bg hover:border-semantic-amber',
  mancante: 'border-dashed border-border bg-surface text-text-secondary hover:border-solid hover:border-brand-medium',
}

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium focus-visible:ring-offset-1'

// Testo unico della cella per lettori di schermo e tooltip: nella compatta il
// title è identico all'aria-label. Chrome lo espone comunque anche come
// description (visto nello snapshot): un lettore di schermo potrebbe leggerlo
// due volte. Non verificato con un lettore reale.
function cellAriaLabel(unit: UnitRow, cell: UnitDocumentCell, facts: string | null): string {
  const extra = cell.versions.length > 0 ? `, ${pluralize(cell.versions.length, 'altra versione', 'altre versioni')}` : ''
  const base = `${cell.expectation.label}, ${unit.label}: ${STATE_LABELS[cell.state].toLowerCase()}${extra}`
  if (cell.state === 'mancante') return `${base}. Carica il documento`
  if (cell.state === 'da_verificare') return `${base}. Apri per rivedere`
  return `${base}${facts ? `, ${facts}` : ''}. Apri il documento`
}

function GridCell({ unit, cell, selected, compact, onOpenDoc, onUpload }: {
  unit: UnitRow
  cell: UnitDocumentCell
  selected: boolean
  compact: boolean
  onOpenDoc: (docId: string) => void
  onUpload: (unitId: string, expectation: UnitExpectation) => void
}) {
  const facts = formatCellKeyData(cell.expectation.key, cell.keyData)
  const doc = cell.doc
  const ariaLabel = cellAriaLabel(unit, cell, facts)

  function handleClick() {
    if (cell.state === 'mancante' || !doc) onUpload(unit.id, cell.expectation)
    else onOpenDoc(doc.id)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      title={compact ? ariaLabel : undefined}
      aria-pressed={cell.state === 'mancante' ? undefined : selected}
      className={`w-full ${compact ? 'min-h-9' : 'min-h-[4.25rem]'} rounded-lg border ${compact ? 'px-2 py-1.5' : 'p-2.5'} text-left transition-shadow hover:shadow-sm cursor-pointer ${CELL_STYLES[cell.state]} ${selected ? 'ring-2 ring-brand-medium' : ''} ${FOCUS}`}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium">
        {cell.state === 'presente' && <Eye className="w-3.5 h-3.5 text-brand-dark" strokeWidth={1.8} aria-hidden="true" />}
        {cell.state === 'da_verificare' && <AlertCircle className="w-3.5 h-3.5 text-semantic-amber" strokeWidth={1.8} aria-hidden="true" />}
        {cell.state === 'mancante' && <Upload className="w-3.5 h-3.5" strokeWidth={1.8} aria-hidden="true" />}
        <span className={cell.state === 'presente' ? 'text-brand-dark' : cell.state === 'da_verificare' ? 'text-semantic-amber' : ''}>
          {cell.state === 'mancante' ? 'Carica' : STATE_LABELS[cell.state]}
        </span>
      </span>
      {!compact && cell.state === 'presente' && facts && (
        <span className="mt-1 block text-xs text-text-secondary break-words">{facts}</span>
      )}
      {/* Più documenti sullo stesso slot: la cella mostra il più recente, le altre
          versioni si aprono dal pannello. Nessuna sostituzione automatica.
          Nella compatta restano solo nel tooltip e nell'aria-label. */}
      {!compact && cell.versions.length > 0 && (
        <span className="mt-1 block text-xs font-medium text-text-secondary">
          +{pluralize(cell.versions.length, 'versione', 'versioni')}
        </span>
      )}
    </button>
  )
}

// Testo della lista vuota: la scelta del caso è in matrixEmptyState (verificata).
function emptyMessage(kind: MatrixEmptyKind, query: string): string {
  const q = query.trim()
  switch (kind) {
    case 'all_complete': return 'Tutte le unità hanno i documenti attesi.'
    case 'no_incomplete_match': return `Nessuna unità incompleta corrisponde a «${q}».`
    case 'no_match': return `Nessuna unità corrisponde a «${q}».`
    case 'no_units': return 'Nessuna unità in questa residenza.'
  }
}

export function UnitDocumentMatrix({ docs, units, selectedDocId, onOpenDoc, onUpload }: {
  docs: DocRow[]
  units: UnitRow[]
  selectedDocId: string | null
  onOpenDoc: (docId: string) => void
  onUpload: (unitId: string, expectation: UnitExpectation) => void
}) {
  const rows = useMemo(
    () => unitDocumentRows(docs, [...units].sort((a, b) => compareUnitLabels(a.label, b.label))),
    [docs, units],
  )
  const unassigned = useMemo(() => documentsMentioningUnitWithoutAssignment(docs).length, [docs])

  // Toggle: null = mai toccato, il valore effettivo si ricalcola dal numero di
  // unità (nessuno stato da sincronizzare). Sotto o pari alla soglia non filtra.
  const [incompleteOverride, setIncompleteOverride] = useState<boolean | null>(null)
  const [query, setQuery] = useState('')
  const compact = isCompactMatrix(units.length)
  const incompleteOnly = effectiveIncompleteOnly(incompleteOverride, units.length)
  const activeQuery = compact ? query : ''
  const visibleRows = useMemo(
    () => filterMatrixRows(rows, { incompleteOnly, query: activeQuery }),
    [rows, incompleteOnly, activeQuery],
  )
  const empty = matrixEmptyState(rows, { incompleteOnly, query: activeQuery })

  if (units.length === 0) return null

  return (
    <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
      <div className="space-y-0.5">
        <h2 className="text-sm font-medium text-text-primary">Documenti per unità</h2>
        <p className="text-xs text-text-secondary">
          Considera solo i documenti assegnati a un’unità.
          {unassigned > 0 && (
            <> Da assegnare a un’unità: {pluralize(unassigned, 'documento', 'documenti')}.</>
          )}
        </p>
      </div>

      {compact && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Cerca unità"
            placeholder="Cerca unità…"
            className="flex-1 min-w-[10rem] border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
          <button
            type="button"
            onClick={() => setIncompleteOverride(!incompleteOnly)}
            aria-pressed={incompleteOnly}
            className={`flex-shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium ${
              incompleteOnly
                ? 'bg-brand-light text-brand-dark border-brand-medium/50'
                : 'bg-surface text-text-secondary border-border hover:border-brand-medium'
            }`}
          >
            Solo unità incomplete
          </button>
          <p aria-live="polite" className="text-xs text-text-secondary">
            {formatMatrixCount(visibleRows.length, rows.length)}
          </p>
        </div>
      )}

      {empty ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-text-secondary space-y-2">
          <p>{emptyMessage(empty.kind, query)}</p>
          {empty.offerShowAll && (
            <button
              type="button"
              onClick={() => setIncompleteOverride(false)}
              className={`rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-primary cursor-pointer hover:border-brand-medium ${FOCUS}`}
            >
              Mostra tutte
            </button>
          )}
        </div>
      ) : (
        <div
          className={compact ? 'overflow-auto max-h-[min(36rem,70vh)]' : 'overflow-x-auto'}
          {...(compact ? { role: 'region', 'aria-label': 'Documenti per unità', tabIndex: 0 } : {})}
        >
          <table className={`w-full text-left border-separate ${compact ? 'border-spacing-0' : 'border-spacing-y-2'}`}>
            <thead>
              <tr>
                <th
                  scope="col"
                  className={`pr-3 text-xs font-medium text-text-secondary whitespace-nowrap${compact ? ' sticky top-0 left-0 z-30 bg-surface py-2 pl-0.5' : ''}`}
                >
                  Unità
                </th>
                {UNIT_EXPECTATIONS.map(exp => (
                  <th
                    key={exp.key}
                    scope="col"
                    className={`pr-2 text-xs font-medium text-text-secondary ${compact ? 'sticky top-0 z-20 bg-surface py-2 min-w-32' : 'min-w-44'}`}
                  >
                    {exp.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(row => (
                <tr key={row.unit.id} className={compact ? 'align-middle' : 'align-top'}>
                  <th
                    scope="row"
                    className={`pr-3 ${compact ? 'sticky left-0 z-10 bg-surface py-1 pl-0.5 text-left' : 'pt-2.5'} text-sm font-medium text-text-primary whitespace-nowrap`}
                  >
                    {row.unit.label}
                  </th>
                  {row.cells.map(cell => (
                    <td key={cell.expectation.key} className={compact ? 'py-1 pr-2' : 'pr-2'}>
                      <GridCell
                        unit={row.unit}
                        cell={cell}
                        selected={cell.doc !== null && cell.doc.id === selectedDocId}
                        compact={compact}
                        onOpenDoc={onOpenDoc}
                        onUpload={onUpload}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
