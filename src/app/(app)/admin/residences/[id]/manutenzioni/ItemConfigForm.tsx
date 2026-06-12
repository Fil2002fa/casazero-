'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { updateMaintenanceItemConfig } from '../fornitori/actions'
import type { MaintenancePriority } from '@/types/database'

export function ItemConfigForm({
  itemId, residenceId, currentPriority, currentFrequency, currentWarranty, currentSupplierId, suppliers,
}: {
  itemId: string
  residenceId: string
  currentPriority: MaintenancePriority
  currentFrequency: number | null
  currentWarranty: string | null
  currentSupplierId: string | null
  suppliers: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [priority, setPriority] = useState(currentPriority)
  const [frequency, setFrequency] = useState(currentFrequency?.toString() ?? '')
  const [warranty, setWarranty] = useState(currentWarranty ?? '')
  const [supplierId, setSupplierId] = useState(currentSupplierId ?? '')

  function handleSave() {
    startTransition(async () => {
      await updateMaintenanceItemConfig(itemId, residenceId, {
        priority: priority || null,
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
              <label className="text-[10px] text-text-secondary block mb-0.5">Priorità</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as MaintenancePriority)}
                className="w-full border border-border rounded-md px-2 py-1.5 text-xs bg-surface text-text-primary focus:outline-none"
              >
                <option value="N1">N1 — Consigliata</option>
                <option value="N2">N2 — Obbligatoria (cliente)</option>
                <option value="N3">N3 — Amministratore</option>
              </select>
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
            </div>
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
