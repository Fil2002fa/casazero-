'use client'

import { useState, useTransition } from 'react'
import { uploadDocument } from '@/app/(app)/documenti/actions'
import { Plus, X } from 'lucide-react'
import type { DocumentCategory } from '@/types/database'

const CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: 'proprieta',      label: 'Proprietà' },
  { value: 'tecnici',        label: 'Tecnici' },
  { value: 'energetici',     label: 'Energetici' },
  { value: 'conformita',     label: 'Conformità' },
  { value: 'amministrativi', label: 'Amministrativi' },
]

interface Props {
  residenceId: string
  unitId?: string
}

export function UploadDocumentForm({ residenceId, unitId }: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await uploadDocument(formData)
      if (result?.error) {
        setError(result.error)
      } else {
        setSuccess(true)
        setTimeout(() => { setSuccess(false); setOpen(false) }, 1500)
      }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-brand-dark text-white rounded-xl px-4 py-2.5 text-sm font-medium active:scale-[0.98] transition-transform"
      >
        <Plus className="w-4 h-4" strokeWidth={2} />
        Carica documento
      </button>
    )
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-primary">Carica documento</p>
        <button onClick={() => setOpen(false)} className="text-text-secondary p-1 rounded-lg">
          <X className="w-4 h-4" strokeWidth={1.6} />
        </button>
      </div>

      {success ? (
        <p className="text-sm text-brand-dark bg-brand-light rounded-lg px-3 py-2">
          Documento caricato correttamente.
        </p>
      ) : (
        <form action={handleSubmit} className="space-y-3">
          <input type="hidden" name="residenceId" value={residenceId} />
          {unitId && <input type="hidden" name="unitId" value={unitId} />}

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Titolo *</label>
            <input
              type="text"
              name="title"
              required
              placeholder="Es. Certificato energetico 2024"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Categoria *</label>
            <select
              name="category"
              required
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
            >
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">File *</label>
            <input
              type="file"
              name="file"
              required
              accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx"
              className="w-full text-sm text-text-secondary cursor-pointer file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-light file:text-brand-dark"
            />
            <p className="text-xs text-text-secondary mt-1">PDF, immagini, Word · max 50 MB</p>
          </div>

          {error && <p className="text-xs text-semantic-red">{error}</p>}

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-brand-dark text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {isPending ? 'Caricamento…' : 'Carica'}
          </button>
        </form>
      )}
    </div>
  )
}
