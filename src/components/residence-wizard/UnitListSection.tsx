'use client'

import type { ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { UnitRow } from './shared'

// Lista editabile delle unità — fonte di verità. Controllata dal chiamante:
// units e rowErrors arrivano da fuori (wizard: lista vuota; revisione: proposta).
export function UnitListSection({
  units,
  rowErrors,
  onUpdate,
  onAdd,
  onRemove,
  rowNote,
}: {
  units: UnitRow[]
  rowErrors: Record<number, string>
  onUpdate: (index: number, patch: Partial<UnitRow>) => void
  onAdd: () => void
  onRemove: (index: number) => void
  // Sotto la riga: nella revisione da documento, provenienza della singola unità.
  rowNote?: (index: number) => ReactNode
}) {
  // Il riepilogo conta solo le righe con un nome compilato: una riga appena
  // aggiunta e ancora vuota non è un'unità.
  const filledUnits = units.filter(u => u.label.trim())
  const floorCount = new Set(filledUnits.map(u => u.floor.trim())).size

  return (
    <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text-primary">Unità</h2>
        {filledUnits.length > 0 && (
          <p className="text-xs text-text-secondary">
            {filledUnits.length} unità su {floorCount} {floorCount === 1 ? 'piano' : 'piani'}
          </p>
        )}
      </div>

      {units.length === 0 && (
        <p className="text-xs text-text-secondary">
          Nessuna unità in lista. Usa il generatore qui sopra o aggiungile una a una.
        </p>
      )}

      {units.map((unit, i) => (
        <div key={i}>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={unit.label}
              onChange={e => onUpdate(i, { label: e.target.value })}
              placeholder={`es. Int. ${i + 1}`}
              maxLength={60}
              aria-label={`Nome unità ${i + 1}`}
              className={`flex-1 min-w-0 border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium ${rowErrors[i] ? 'border-semantic-red' : 'border-border'}`}
            />
            <input
              type="number"
              value={unit.floor}
              onChange={e => onUpdate(i, { floor: e.target.value })}
              placeholder="Piano"
              min="0"
              aria-label={`Piano unità ${i + 1}`}
              className={`w-20 border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium ${rowErrors[i] ? 'border-semantic-red' : 'border-border'}`}
            />
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label={`Rimuovi unità ${i + 1}`}
              className="p-2 rounded-lg text-text-secondary hover:text-semantic-red transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          {rowErrors[i] && (
            <p className="text-xs text-semantic-red mt-1">{rowErrors[i]}</p>
          )}
          {rowNote?.(i)}
        </div>
      ))}

      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1.5 text-sm text-brand-medium font-medium"
      >
        <Plus className="w-4 h-4" strokeWidth={2} />
        Aggiungi unità
      </button>
    </section>
  )
}
