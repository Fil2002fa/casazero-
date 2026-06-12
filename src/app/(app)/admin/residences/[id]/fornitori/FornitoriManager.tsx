'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, Phone, Mail, Tag } from 'lucide-react'
import { createSupplier, deleteSupplier } from './actions'

type Supplier = { id: string; name: string; phone: string | null; email: string | null; categories: string[] }

export function FornitoriManager({
  residenceId,
  suppliers,
}: {
  residenceId: string
  suppliers: Supplier[]
}) {
  const [pending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await createSupplier(residenceId, formData)
      if (res.error) setError(res.error)
      else {
        setShowForm(false)
        window.location.reload()
      }
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Rimuovere questo fornitore?')) return
    startTransition(async () => {
      await deleteSupplier(id, residenceId)
      window.location.reload()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-primary">{suppliers.length} fornitore/i</p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-dark text-white rounded-lg text-xs font-medium"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2} />
          Aggiungi
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-surface rounded-xl border border-border p-4 space-y-3">
          <p className="text-sm font-medium text-text-primary">Nuovo fornitore</p>
          <input
            type="text"
            name="name"
            placeholder="Nome fornitore *"
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
          <input
            type="tel"
            name="phone"
            placeholder="Telefono"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
          <input
            type="email"
            name="email"
            placeholder="Email"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
          <div>
            <label className="text-xs text-text-secondary block mb-1">Categorie (virgola separata)</label>
            <input
              type="text"
              name="categories"
              placeholder="es. Termico, Elettrico, Fotovoltaico"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>
          {error && <p className="text-xs text-semantic-red">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="flex-1 py-2 bg-brand-dark text-white rounded-lg text-sm disabled:opacity-50">
              {pending ? '…' : 'Salva'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-border rounded-lg text-sm text-text-secondary">
              Annulla
            </button>
          </div>
        </form>
      )}

      {suppliers.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-text-secondary">Nessun fornitore. Aggiungine uno per associarlo alle manutenzioni.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suppliers.map(s => (
            <div key={s.id} className="bg-surface rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{s.name}</p>
                  {s.phone && (
                    <a href={`tel:${s.phone}`} className="flex items-center gap-1.5 text-xs text-text-secondary mt-1.5">
                      <Phone className="w-3 h-3" strokeWidth={1.6} />
                      {s.phone}
                    </a>
                  )}
                  {s.email && (
                    <a href={`mailto:${s.email}`} className="flex items-center gap-1.5 text-xs text-text-secondary mt-1">
                      <Mail className="w-3 h-3" strokeWidth={1.6} />
                      {s.email}
                    </a>
                  )}
                  {s.categories.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap mt-2">
                      <Tag className="w-3 h-3 text-text-secondary" strokeWidth={1.6} />
                      {s.categories.map(c => (
                        <span key={c} className="text-[10px] bg-brand-light text-brand-dark px-1.5 py-0.5 rounded-full">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(s.id)}
                  disabled={pending}
                  className="p-1.5 text-text-secondary hover:text-semantic-red transition-colors"
                  title="Rimuovi"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.6} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
