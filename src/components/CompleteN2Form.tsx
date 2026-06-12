'use client'

import { useRef, useState, useTransition } from 'react'
import { completeN2 } from '@/app/(app)/manutenzioni/actions'

interface Props {
  itemId: string
  unitId: string
  residenceId: string
}

export function CompleteN2Form({ itemId, unitId, residenceId }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await completeN2(formData)
      if (result?.error) {
        setError(result.error)
      } else {
        setSuccess(true)
      }
    })
  }

  if (success) {
    return (
      <div className="bg-brand-light rounded-xl p-4">
        <p className="text-sm font-medium text-brand-dark">Manutenzione registrata correttamente.</p>
        <p className="text-xs text-brand-medium mt-1">La scadenza è stata ricalcolata automaticamente.</p>
      </div>
    )
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-4">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="residenceId" value={residenceId} />

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">
          Data intervento <span className="text-semantic-red">*</span>
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
          Note <span className="text-text-secondary font-normal">(facoltative)</span>
        </label>
        <textarea
          name="notes"
          rows={3}
          placeholder="Descrivi brevemente l'intervento…"
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">
          Foto o fattura <span className="text-text-secondary font-normal">(facoltativa)</span>
        </label>
        <input
          type="file"
          name="attachment"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="w-full text-sm text-text-secondary cursor-pointer file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-light file:text-brand-dark"
        />
        <p className="text-xs text-text-secondary mt-1">JPEG, PNG, WebP o PDF · max 10 MB</p>
      </div>

      {error && <p className="text-sm text-semantic-red">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-brand-dark text-white rounded-xl py-3 text-sm font-medium disabled:opacity-50 active:scale-[0.98] transition-transform"
      >
        {isPending ? 'Salvataggio in corso…' : 'Segna completata'}
      </button>
    </form>
  )
}
