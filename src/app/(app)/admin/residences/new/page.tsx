'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { createResidence } from './actions'

const CATEGORIES = [
  'Coperture', 'Ventilazione', 'Termico e clima', 'Elettrico',
  'Fotovoltaico', 'Finiture e serramenti', 'Sicurezza in copertura', 'Scarichi e spurghi',
]

export default function NewResidencePage() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [existingBuilding, setExistingBuilding] = useState(false)
  const [showDateWizard, setShowDateWizard] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await createResidence(formData)
      if (res?.error) setError(res.error)
    })
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="bg-surface border-b border-border px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/admin/residences" className="text-text-secondary p-1 -ml-1 rounded-lg">
          <ChevronLeft className="w-5 h-5" strokeWidth={1.6} />
        </Link>
        <h1 className="text-base font-medium text-text-primary">Nuova residenza</h1>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-5">
        {/* Dati base */}
        <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
          <h2 className="text-sm font-medium text-text-primary">Dati residenza</h2>

          <Field label="Nome *" name="name" placeholder="es. Residenza Cavaccio" required />
          <Field label="Indirizzo" name="address" placeholder="Via Roma 1, Padova" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Classe energetica" name="energy_class" placeholder="es. A4" />
            <Field label="N. unità *" name="unit_count" type="number" placeholder="14" required min="1" max="200" />
          </div>
          <Field label="Data consegna *" name="delivery_date" type="date" required />
        </section>

        {/* Edificio esistente */}
        <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={existingBuilding}
              onChange={e => {
                setExistingBuilding(e.target.checked)
                setShowDateWizard(e.target.checked)
              }}
              className="w-4 h-4 rounded accent-brand-dark"
            />
            <div>
              <p className="text-sm font-medium text-text-primary">Edificio esistente</p>
              <p className="text-xs text-text-secondary">Imposta date diverse per categoria</p>
            </div>
          </label>

          {existingBuilding && (
            <div>
              <button
                type="button"
                onClick={() => setShowDateWizard(!showDateWizard)}
                className="flex items-center gap-2 text-sm text-brand-medium"
              >
                {showDateWizard ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showDateWizard ? 'Nascondi' : 'Mostra'} wizard date per categoria
              </button>

              {showDateWizard && (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-text-secondary">
                    Lascia vuoto per usare la data di consegna come base. La scadenza sarà calcolata
                    come <em>data base + frequenza template</em>.
                  </p>
                  {CATEGORIES.map(cat => (
                    <div key={cat} className="flex items-center gap-3">
                      <label className="text-xs text-text-secondary w-40 flex-shrink-0">{cat}</label>
                      <input
                        type="date"
                        name={`date_${cat}`}
                        className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {error && (
          <div className="bg-semantic-red-bg border border-semantic-red/20 rounded-xl p-3">
            <p className="text-sm text-semantic-red">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 bg-brand-dark text-white rounded-xl font-medium text-sm disabled:opacity-50"
        >
          {pending ? 'Creazione in corso…' : 'Crea residenza'}
        </button>
      </form>
    </div>
  )
}

function Field({
  label, name, placeholder, required, type = 'text', min, max,
}: {
  label: string; name: string; placeholder?: string; required?: boolean
  type?: string; min?: string; max?: string
}) {
  return (
    <div>
      <label className="text-xs text-text-secondary mb-1 block">{label}</label>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        required={required}
        min={min}
        max={max}
        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
      />
    </div>
  )
}
