'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { updateMaintenanceItemConfig } from '../fornitori/actions'
import type { CompletionMode, ObligationType } from '@/types/database'

export function ItemConfigForm({
  itemId, residenceId, currentMode, currentObligation, currentFrequency, currentWarranty, currentSupplierId, suppliers,
}: {
  itemId: string
  residenceId: string
  currentMode: CompletionMode
  currentObligation: ObligationType
  currentFrequency: number | null
  currentWarranty: string | null
  currentSupplierId: string | null
  suppliers: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [mode, setMode] = useState(currentMode)
  const [obligation, setObligation] = useState(currentObligation)
  const [frequency, setFrequency] = useState(currentFrequency?.toString() ?? '')
  const [warranty, setWarranty] = useState(currentWarranty ?? '')
  const [supplierId, setSupplierId] = useState(currentSupplierId ?? '')

  function handleSave() {
    startTransition(async () => {
      await updateMaintenanceItemConfig(itemId, residenceId, {
        completion_mode: mode,
        obligation_type: obligation,
        frequency_months: frequency ? parseInt(frequency) : null,
        warranty_info: warranty || null,
        supplier_id: supplierId || null,
      })
      setSaved(true)
      setTimeout(() => { setSaved(false); setOpen(false) }, 1200)
    })
  }

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-text-secondary"
      >
        <span>Configura</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2 bg-background">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-text-secondary block mb-0.5">Modalità</label>
              <select
                value={mode}
                onChange={e => setMode(e.target.value as CompletionMode)}
                className="w-full border border-border rounded-md px-2 py-1.5 text-xs bg-surface text-text-primary focus:outline-none"
              >
                <option value="residente">Residente</option>
                <option value="amministratore">Amministratore</option>
                <option value="promemoria">Promemoria</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-text-secondary block mb-0.5">Tipo</label>
              <select
                value={obligation}
                onChange={e => setObligation(e.target.value as ObligationType)}
                className="w-full border border-border rounded-md px-2 py-1.5 text-xs bg-surface text-text-primary focus:outline-none"
              >
                <option value="A">Obbligo di legge</option>
                <option value="B">Raccomandata</option>
                <option value="C">Consiglio</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-text-secondary block mb-0.5">Freq. (mesi)</label>
            <input
              type="number"
              value={frequency}
              onChange={e => setFrequency(e.target.value)}
              placeholder="es. 12"
              min="1"
              className="w-full border border-border rounded-md px-2 py-1.5 text-xs bg-surface text-text-primary focus:outline-none"
            />
            {obligation === 'A' && (
              <p className="mt-0.5 text-[10px] text-semantic-amber">
                Frequenza ancorata a una norma di legge. Modificala solo dopo verifica tecnica.
              </p>
            )}
          </div>

          {suppliers.length > 0 && (
            <div>
              <label className="text-[10px] text-text-secondary block mb-0.5">Fornitore</label>
              <select
                value={supplierId}
                onChange={e => setSupplierId(e.target.value)}
                className="w-full border border-border rounded-md px-2 py-1.5 text-xs bg-surface text-text-primary focus:outline-none"
              >
                <option value="">— nessuno —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="text-[10px] text-text-secondary block mb-0.5">Info garanzia</label>
            <input
              type="text"
              value={warranty}
              onChange={e => setWarranty(e.target.value)}
              placeholder="es. Garanzia 10 anni fornitore X"
              className="w-full border border-border rounded-md px-2 py-1.5 text-xs bg-surface text-text-primary focus:outline-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={pending}
            className={`w-full py-1.5 rounded-md text-xs font-medium transition-colors ${
              saved ? 'bg-brand-medium text-white' : 'bg-brand-dark text-white disabled:opacity-50'
            }`}
          >
            {saved ? 'Salvato' : pending ? '…' : 'Salva configurazione'}
          </button>
        </div>
      )}
    </div>
  )
}
