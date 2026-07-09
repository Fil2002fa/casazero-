'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BrandMark } from '@/components/BrandMark'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'

export function LoginForm({ invite, error }: { invite: string | null; error: string | null }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(
    error === 'no_access'
      ? { text: 'Per accedere serve un invito. Contatta il tuo costruttore.', ok: false }
      : null
  )
  const supabase = createClient()

  const nextPath = invite ? `/welcome/${invite}/accept` : '/'
  const callbackUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback?next=${encodeURIComponent(nextPath)}`

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}` },
    })
    setMessage(
      error
        ? { text: error.message, ok: false }
        : { text: 'Controlla la tua email per il link di accesso.', ok: true }
    )
    setLoading(false)
  }

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl },
    })
  }

  return (
    <div className="min-h-svh flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <h1 className="sr-only">CasaZero — accesso</h1>
          <BrandMark iconSize={28} textClassName="text-xl font-semibold" />
          {invite && (
            <p className="text-sm text-text-primary mt-2">Accedi per accettare il tuo invito</p>
          )}
        </div>

        <div className="bg-surface rounded-xl border border-border p-8 space-y-4">
          <Button
            onClick={handleGoogle}
            type="button"
            variant="secondary"
            className="w-full gap-3"
          >
            <GoogleIcon />
            Continua con Google
          </Button>

          <div className="relative flex items-center gap-3">
            <div className="flex-1 border-t border-border" />
            <span className="text-xs text-text-secondary">oppure</span>
            <div className="flex-1 border-t border-border" />
          </div>

          <form onSubmit={handleMagicLink} className="space-y-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@esempio.com"
                required
              />
            </div>
            <Button type="submit" variant="primary" className="w-full" disabled={loading}>
              {loading ? 'Invio in corso…' : 'Accedi con email'}
            </Button>
          </form>

          {message && (
            <p className={`text-xs text-center ${message.ok ? 'text-brand-medium' : 'text-status-overdue'}`}>
              {message.text}
            </p>
          )}
        </div>

        <p className="text-xs text-center text-text-primary mt-6">
          Accesso solo su invito. Contatta il tuo costruttore.
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}
