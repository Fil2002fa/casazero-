'use client'

import { useMemo } from 'react'
import type { DocRow, UnitRow } from '@/lib/document-rows'
import { pluralize } from '@/lib/pluralize'
import {
  UNIT_EXPECTATIONS,
  documentsMentioningUnitWithoutAssignment,
  formatKeyData,
  unitDocumentRows,
  type UnitDocState,
} from '@/lib/unit-documents'
import { compareUnitLabels } from '@/lib/unit-utils'

// Quadro unità × documenti attesi (E1a, D1-D2). Un solo componente per admin e
// super_admin: nessun dato dipende dal ruolo. Il calcolo è in unitDocumentRows,
// la stessa fonte della scheda "Riepilogo unità" dell'Excel. Considera solo i
// documenti assegnati a un'unità (documents.unit_id): l'unità citata nel testo
// del documento non conta, e i documenti che la citano senza essere assegnati
// si contano a parte.

const STATE_LABELS: Record<UnitDocState, string> = {
  presente: 'Presente',
  da_verificare: 'Da verificare',
  mancante: 'Mancante',
}

// Famiglia di seconda generazione (status-*/brand/neutral), come i badge della
// pagina: mai semantic-*.
const STATE_STYLES: Record<UnitDocState, string> = {
  presente: 'bg-brand-dark/8 text-brand-dark',
  da_verificare: 'bg-status-inprogress/8 text-status-inprogress',
  mancante: 'bg-neutral-600/7 text-neutral-600',
}

export function UnitDocumentMatrix({ docs, units }: { docs: DocRow[]; units: UnitRow[] }) {
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

      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-3 text-xs font-medium text-text-secondary whitespace-nowrap">Unità</th>
              {UNIT_EXPECTATIONS.map(exp => (
                <th key={exp.key} scope="col" className="py-2 pr-3 text-xs font-medium text-text-secondary min-w-40">
                  {exp.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.unit.id} className="border-b border-border last:border-b-0 align-top">
                <th scope="row" className="py-2.5 pr-3 text-sm font-medium text-text-primary whitespace-nowrap">
                  {row.unit.label}
                </th>
                {row.cells.map(cell => {
                  const facts = formatKeyData(cell.keyData)
                  return (
                    <td key={cell.expectation.key} className="py-2.5 pr-3 space-y-1">
                      <span className={`inline-flex items-center rounded-full h-[22px] px-2.5 text-xs font-medium ${STATE_STYLES[cell.state]}`}>
                        {STATE_LABELS[cell.state]}
                      </span>
                      {facts && <p className="text-xs text-text-secondary break-words">{facts}</p>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
