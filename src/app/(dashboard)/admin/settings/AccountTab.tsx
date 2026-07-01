'use client'

import { useState, useTransition } from 'react'
import { Check, X, Edit2 } from 'lucide-react'
import { updateAccountProfile } from './actions'

export default function AccountTab({ initialName, email }: { initialName: string; email: string }) {
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(initialName)
  const [savedName, setSavedName] = useState(initialName)
  const [error, setError] = useState<string | null>(null)

  function handleSave() {
    setError(null)
    const fd = new FormData()
    fd.set('full_name', name)
    startTransition(async () => {
      const res = await updateAccountProfile(fd)
      if (res.error) setError(res.error)
      else {
        setSavedName(name)
        setEditing(false)
      }
    })
  }

  return (
    <section className="bg-surface rounded-xl border border-border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text-primary">Profilo account</h2>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs text-brand-medium font-medium cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5" strokeWidth={1.8} />
            Modifica
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs text-text-secondary mb-1">Nome</p>
          {editing ? (
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
              placeholder="Il tuo nome"
            />
          ) : (
            <p className="text-sm font-medium text-text-primary">{savedName || '—'}</p>
          )}
        </div>

        <div>
          <p className="text-xs text-text-secondary mb-1">Email</p>
          <p className="text-sm text-text-primary">{email}</p>
        </div>
      </div>

      {error && <p className="text-xs text-semantic-red">{error}</p>}

      {editing && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={pending}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-dark text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" strokeWidth={2} />
            Salva
          </button>
          <button
            onClick={() => { setEditing(false); setName(savedName); setError(null) }}
            className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-lg text-sm text-text-secondary cursor-pointer"
          >
            <X className="w-4 h-4" strokeWidth={1.8} />
            Annulla
          </button>
        </div>
      )}
    </section>
  )
}
