import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Profilo' }

export default async function ProfiloPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-medium text-text-primary">Profilo</h1>
      <div className="bg-surface rounded-xl border border-border p-4 space-y-2">
        <p className="text-sm text-text-secondary">Email</p>
        <p className="text-sm font-medium text-text-primary">{user?.email ?? '—'}</p>
      </div>
      <p className="text-xs text-text-secondary">
        Preferenze notifiche e gestione accessi familiari in arrivo con M4.
      </p>
    </div>
  )
}
