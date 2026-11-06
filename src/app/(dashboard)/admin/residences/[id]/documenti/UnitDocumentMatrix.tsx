'use client'

import { useMemo } from 'react'
import { AlertCircle, Eye, Upload } from 'lucide-react'
import type { DocRow, UnitRow } from '@/lib/document-rows'
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

const STATE_LABELS: Record<UnitDocState, string> = {
  presente: 'Presente',
  da_verificare: 'Da verificare',
  mancante: 'Mancante',
}

// Famiglia di seconda generazione (status-*/brand/neutral), mai semantic-*.
const CELL_STYLES: Record<UnitDocState, string> = {
  presente: 'border-brand-medium/30 bg-brand-light/50 hover:border-brand-medium',
  da_verificare: 'border-status-inprogress/40 bg-status-inprogress/8 hover:border-status-inprogress',
  mancante: 'border-dashed border-border bg-surface text-text-secondary hover:border-solid hover:border-brand-medium',
}

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium focus-visible:ring-offset-1'

function cellAriaLabel(unit: UnitRow, cell: UnitDocumentCell, facts: string | null): string {
  const base = `${cell.expectation.label}, ${unit.label}: ${STATE_LABELS[cell.state].toLowerCase()}`
  if (cell.state === 'mancante') return `${base}. Carica il documento`
  if (cell.state === 'da_verificare') return `${base}. Apri per rivedere`
  return `${base}${facts ? `, ${facts}` : ''}. Apri il documento`
}

function GridCell({ unit, cell, selected, onOpenDoc, onUpload }: {
  unit: UnitRow
  cell: UnitDocumentCell
  selected: boolean
  onOpenDoc: (docId: string) => void
  onUpload: (unitId: string, expectation: UnitExpectation) => void
}) {
  const facts = formatCellKeyData(cell.expectation.key, cell.keyData)
  const doc = cell.doc

  function handleClick() {
    if (cell.state === 'mancante' || !doc) onUpload(unit.id, cell.expectation)
    else onOpenDoc(doc.id)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={cellAriaLabel(unit, cell, facts)}
      aria-pressed={cell.state === 'mancante' ? undefined : selected}
      className={`w-full min-h-[4.25rem] rounded-lg border p-2.5 text-left transition-shadow hover:shadow-sm cursor-pointer ${CELL_STYLES[cell.state]} ${selected ? 'ring-2 ring-brand-medium' : ''} ${FOCUS}`}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium">
        {cell.state === 'presente' && <Eye className="w-3.5 h-3.5 text-brand-dark" strokeWidth={1.8} aria-hidden="true" />}
        {cell.state === 'da_verificare' && <AlertCircle className="w-3.5 h-3.5 text-status-inprogress" strokeWidth={1.8} aria-hidden="true" />}
        {cell.state === 'mancante' && <Upload className="w-3.5 h-3.5" strokeWidth={1.8} aria-hidden="true" />}
        <span className={cell.state === 'presente' ? 'text-brand-dark' : cell.state === 'da_verificare' ? 'text-status-inprogress' : ''}>
          {cell.state === 'mancante' ? 'Carica' : STATE_LABELS[cell.state]}
        </span>
      </span>
      {cell.state === 'presente' && facts && (
        <span className="mt-1 block text-xs text-text-secondary break-words">{facts}</span>
      )}
    </button>
  )
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

      <div className="overflow-x-auto">
        <table className="w-full text-left border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th scope="col" className="pr-3 text-xs font-medium text-text-secondary whitespace-nowrap">Unità</th>
              {UNIT_EXPECTATIONS.map(exp => (
                <th key={exp.key} scope="col" className="pr-2 text-xs font-medium text-text-secondary min-w-44">
                  {exp.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.unit.id} className="align-top">
                <th scope="row" className="pr-3 pt-2.5 text-sm font-medium text-text-primary whitespace-nowrap">
                  {row.unit.label}
                </th>
                {row.cells.map(cell => (
                  <td key={cell.expectation.key} className="pr-2">
                    <GridCell
                      unit={row.unit}
                      cell={cell}
                      selected={cell.doc !== null && cell.doc.id === selectedDocId}
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
    </section>
  )
}
