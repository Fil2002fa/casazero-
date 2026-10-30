import Link from 'next/link'
import { ActiveSessionPanel } from '@/components/ActiveSessionPanel'
import { buttonVariants } from '@/components/ui/Button'
import { getProfile, getUser } from '@/lib/auth'

type SearchParams = Promise<{ reason?: string }>

// Codici di Supabase Auth (error_code) e nostri (callback): `reason` arriva
// dall'URL, quindi si confronta con questo elenco e non si mostra mai grezzo.
const REASON_MESSAGES: Record<string, string> = {
  flow_state_already_used: 'Questo link di accesso era già stato usato. Richiedine uno nuovo.',
  otp_expired: 'Il link di accesso è scaduto. Richiedine uno nuovo.',
  flow_state_expired: 'Il link di accesso è scaduto. Richiedine uno nuovo.',
  bad_code_verifier: 'Apri il link di accesso nello stesso browser in cui l\'hai richiesto.',
  flow_state_not_found: 'Apri il link di accesso nello stesso browser in cui l\'hai richiesto.',
  access_denied: 'L\'accesso è stato annullato o negato.',
}
const DEFAULT_MESSAGE = 'Il link potrebbe essere scaduto o già usato.'

export default async function AuthErrorPage({ searchParams }: { searchParams: SearchParams }) {
  const { reason } = await searchParams
  const [user, profile] = await Promise.all([getUser(), getProfile()])
  const detail = reason && Object.hasOwn(REASON_MESSAGES, reason) ? REASON_MESSAGES[reason] : DEFAULT_MESSAGE

  return (
    <div className="min-h-svh flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-semantic-red-bg mb-2">
          <span className="text-semantic-red text-xl">!</span>
        </div>
        <h1 className="text-xl font-medium text-text-primary">Accesso non riuscito, riprova</h1>
        <p className="text-sm text-text-secondary">{detail}</p>

        {user ? (
          <ActiveSessionPanel
            fullName={profile?.full_name ?? null}
            email={user.email ?? null}
            role={profile?.role ?? null}
          />
        ) : (
          <Link href="/auth/login" className={buttonVariants('primary', 'default', 'mt-2')}>
            Torna al login
          </Link>
        )}
      </div>
    </div>
  )
}
