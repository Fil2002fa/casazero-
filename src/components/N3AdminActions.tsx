'use client'

import { useState, useTransition } from 'react'
import { takeChargeN3, completeN3 } from '@/app/(app)/admin/manutenzioni/actions'
import type { MaintenanceStatus } from '@/types/database'

interface Props {
  itemId: string
  residenceId: string
  status: MaintenanceStatus
}

export function N3AdminActions({ itemId, residenceId, status }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showCompleteForm, setShowCompleteForm] = useState(false)

  function handleTakeCharge() {
    setError(null)
    startTransition(async () => {
      const result = await takeChargeN3(itemId)
      if (result?.error) setError(result.error)
    })
  }

  function handleCompleteSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await completeN3(formData)
      if (result?.error) setError(result.error)
      else setShowCompleteForm(false)
    })
  }

  if (status === 'scaduta') {
    return (
      <div className="space-y-2">
        {error && <p className="text-sm text-semantic-red">{error}</p>}
        <button
          onClick={handleTakeCharge}
          disabled={isPending}
          className="w-full bg-semantic-amber-bg text-semantic-amber border border-semantic-amber/30 rounded-xl py-3 text-sm font-medium disabled:opacity-50 active:scale-[0.98] transition-transform"
        >
          {isPending ? 'Caricamento…' : 'Prendi in carico'}
        </button>
      </div>
    )
  }

  if (status === 'in_corso') {
    if (showCompleteForm) {
      return (
        <form action={handleCompleteSubmit} className="space-y-4">
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="residenceId" value={residenceId} />

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Data completamento <span className="text-semantic-red">*</span>
            </label>
            <input
              type="date"
              name="completedAt"
              required
              defaultValue={new Date().toISOString().split('T')[0]}
              max={new Date().toISOString().split('T')[0]}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Eseguito da <span className="text-text-secondary font-normal">(facoltativo)</span>
            </label>
            <input
              type="text"
              name="performedByName"
              placeholder="Nome fornitore o ditta"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Note <span className="text-text-secondary font-normal">(facoltative)</span>
            </label>
            <textarea
              name="notes"
              rows={3}
              placeholder="Descrivi l'intervento…"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Verbale / foto <span className="text-text-secondary font-normal">(facoltativo)</span>
            </label>
            <input
              type="file"
              name="verbale"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="w-full text-sm text-text-secondary cursor-pointer file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-light file:text-brand-dark"
            />
          </div>

          {error && <p className="text-sm text-semantic-red">{error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowCompleteForm(false)}
              className="flex-1 border border-border rounded-xl py-3 text-sm font-medium text-text-secondary"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-brand-dark text-white rounded-xl py-3 text-sm font-medium disabled:opacity-50"
            >
              {isPending ? 'Salvataggio…' : 'Conferma'}
            </button>
          </div>
        </form>
      )
    }

    return (
      <div className="space-y-2">
        {error && <p className="text-sm text-semantic-red">{error}</p>}
        <div className="flex items-center gap-2 text-sm text-semantic-amber bg-semantic-amber-bg rounded-lg px-3 py-2 mb-2">
          <span>In carico all&apos;amministratore</span>
        </div>
        <button
          onClick={() => setShowCompleteForm(true)}
          disabled={isPending}
          className="w-full bg-brand-dark text-white rounded-xl py-3 text-sm font-medium disabled:opacity-50 active:scale-[0.98] transition-transform"
        >
          Segna completata
        </button>
      </div>
    )
  }

  return null
}
