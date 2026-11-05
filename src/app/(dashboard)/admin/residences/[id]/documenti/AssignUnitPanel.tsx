'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DocRow, UnitRow } from '@/lib/document-rows'
import { setDocumentUnit } from './actions'

// Pannello "Assegna unità" / "Cambia unità" (E1a, D2). Un solo componente per
// admin e super_admin: il perimetro sta nella action setDocumentUnit. Scegliere
// "Nessuna unità" riporta il documento alla residenza. Il file non si sposta:
// cambia solo documents.unit_id.

const INPUT_CLASS =
  'w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium'

export function AssignUnitPanel({ doc, units, onDone }: {
  doc: DocRow
  units: UnitRow[]
  onDone: () => void
}) {
  const router = useRouter()
  const [selected, setSelected] = useState(doc.unit_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectId = `unit-${doc.id}`
  const dirty = selected !== (doc.unit_id ?? '')

  async function handleSave() {
    setSaving(true)
    setError(null)
    const res = await setDocumentUnit({ documentId: doc.id, unitId: selected === '' ? null : selected })
    setSaving(false)
    if ('error' in res) {
      setError(res.error)
    } else {
      onDone()
      router.refresh()
    }
  }

  return (
    <div className="mt-2 space-y-2 max-w-xl">
      <p className="text-xs text-text-secondary">
        Un documento assegnato a un’unità non conta per i documenti attesi delle parti comuni e
        dell’amministrazione, e segue le regole di lettura di quell’unità. Il file non viene spostato.
      </p>
      <div className="space-y-1">
        <label htmlFor={selectId} className="text-xs font-medium text-text-secondary block">Unità</label>
        <select
          id={selectId}
          name="unitId"
          value={selected}
          onChange={e => { setSelected(e.target.value); setError(null) }}
          className={INPUT_CLASS}
        >
          <option value="">Nessuna unità (documento della residenza)</option>
          {units.map(u => (
            <option key={u.id} value={u.id}>{u.label}</option>
          ))}
        </select>
      </div>
      {error && <p className="text-xs text-semantic-red">{error}</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={!dirty || saving}
        className="inline-flex items-center h-9 max-lg:h-11 px-3 rounded-lg bg-brand-dark text-white text-xs font-medium disabled:opacity-50"
      >
        {saving ? 'Salvataggio…' : 'Salva'}
      </button>
    </div>
  )
}
