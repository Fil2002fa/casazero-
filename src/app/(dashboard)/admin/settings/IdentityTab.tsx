'use client'

import { useState, useTransition } from 'react'
import { updateBuilderSettings } from './actions'

interface Props {
  initialName: string
  initialEmail: string
  initialPhone: string
}

// Colore brand fisso CasaZero (design system §3 "Verde brand scuro").
const BRAND_DARK = '#04342C'

export default function IdentityTab({ initialName, initialEmail, initialPhone }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await updateBuilderSettings(formData)
      if (res.error) setError(res.error)
      else setSuccess(true)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-surface rounded-xl border border-border p-4 space-y-4">
        <h2 className="text-sm font-medium text-text-primary">Identità costruttore</h2>

        <div>
          <label className="text-xs text-text-secondary block mb-1">Nome costruttore</label>
          <input
            type="text"
            name="name"
            defaultValue={initialName}
            placeholder="es. Furlan Costruzioni"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
        </div>

        <div>
          <label className="text-xs text-text-secondary block mb-1">Email di contatto</label>
          <input
            type="email"
            name="contact_email"
            defaultValue={initialEmail}
            placeholder="es. assistenza@furlan.it"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
        </div>

        <div>
          <label className="text-xs text-text-secondary block mb-1">Telefono assistenza</label>
          <input
            type="tel"
            name="contact_phone"
            defaultValue={initialPhone}
            placeholder="es. 0432 123456"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
        </div>

        {/* Preview */}
        <div>
          <p className="text-xs text-text-secondary mb-2">Anteprima</p>
          <div
            className="rounded-xl px-4 py-3 flex items-center justify-between"
            style={{ backgroundColor: BRAND_DARK }}
          >
            <span className="text-white text-sm font-medium">Header app</span>
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
            >
              <span className="text-white text-xs font-bold">C</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border p-4 space-y-4">
        <h2 className="text-sm font-medium text-text-primary">Logo</h2>
        <p className="text-xs text-text-secondary">
          Carica il logo del costruttore (PNG o SVG, max 2 MB). Verrà mostrato nell&apos;app al posto del testo &ldquo;CasaZero&rdquo;.
        </p>
        <input
          type="file"
          name="logo"
          accept="image/png,image/svg+xml,image/jpeg"
          className="w-full text-sm text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-brand-dark file:text-white"
        />
      </div>

      {error && (
        <div className="bg-semantic-red-bg border border-semantic-red/20 rounded-xl p-3">
          <p className="text-sm text-semantic-red">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-brand-light border border-brand-medium/20 rounded-xl p-3">
          <p className="text-sm text-brand-dark">Impostazioni salvate. Ricarica l&apos;app per vedere le modifiche.</p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-3 bg-brand-dark text-white rounded-xl font-medium text-sm disabled:opacity-50"
      >
        {pending ? 'Salvataggio…' : 'Salva impostazioni'}
      </button>
    </form>
  )
}
