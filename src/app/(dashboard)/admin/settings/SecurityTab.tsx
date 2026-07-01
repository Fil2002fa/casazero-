'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const MIN_LENGTH = 8

export default function SecurityTab() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (password.length < MIN_LENGTH) {
      setError(`La password deve avere almeno ${MIN_LENGTH} caratteri.`)
      return
    }
    if (password !== confirm) {
      setError('Le due password non coincidono.')
      return
    }

    setPending(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setPending(false)

    if (error) {
      setError(error.message)
      return
    }
    setSuccess(true)
    setPassword('')
    setConfirm('')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-surface rounded-xl border border-border p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-brand-medium" strokeWidth={1.8} />
          <h2 className="text-sm font-medium text-text-primary">Cambio password</h2>
        </div>

        <div>
          <label className="text-xs text-text-secondary block mb-1">Nuova password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder={`Almeno ${MIN_LENGTH} caratteri`}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
        </div>

        <div>
          <label className="text-xs text-text-secondary block mb-1">Conferma password</label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            autoComplete="new-password"
            placeholder="Ripeti la nuova password"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
        </div>
      </div>

      {error && (
        <div className="bg-semantic-red-bg border border-semantic-red/20 rounded-xl p-3">
          <p className="text-sm text-semantic-red">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-brand-light border border-brand-medium/20 rounded-xl p-3">
          <p className="text-sm text-brand-dark">Password aggiornata correttamente.</p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !password || !confirm}
        className="w-full py-3 bg-brand-dark text-white rounded-xl font-medium text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? 'Aggiornamento…' : 'Aggiorna password'}
      </button>
    </form>
  )
}
