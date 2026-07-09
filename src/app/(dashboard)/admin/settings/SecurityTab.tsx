'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Input, Label } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

const MIN_LENGTH = 8

export default function SecurityTab() {
  const { showToast } = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (password.length < MIN_LENGTH) {
      showToast('error', `La password deve avere almeno ${MIN_LENGTH} caratteri.`)
      return
    }
    if (password !== confirm) {
      showToast('error', 'Le due password non coincidono.')
      return
    }

    setPending(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setPending(false)

    if (error) {
      showToast('error', error.message)
      return
    }
    showToast('success', 'Password aggiornata correttamente.')
    setPassword('')
    setConfirm('')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-brand-medium" strokeWidth={1.8} />
          <h2 className="text-lg font-semibold text-neutral-900">Cambio password</h2>
        </div>

        <div>
          <Label htmlFor="new-password">Nuova password</Label>
          <Input
            id="new-password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder={`Almeno ${MIN_LENGTH} caratteri`}
          />
        </div>

        <div>
          <Label htmlFor="confirm-password">Conferma password</Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            autoComplete="new-password"
            placeholder="Ripeti la nuova password"
          />
        </div>
      </div>

      <Button type="submit" disabled={pending || !password || !confirm} className="w-full">
        {pending ? 'Aggiornamento…' : 'Aggiorna password'}
      </Button>
    </form>
  )
}
