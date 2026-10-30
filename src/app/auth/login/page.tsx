import { LoginForm } from './LoginForm'
import { ActiveSessionPanel } from '@/components/ActiveSessionPanel'
import { getProfile, getUser } from '@/lib/auth'
import { safeNextPath } from '@/lib/safe-next-path'

type SearchParams = Promise<{ invite?: string; error?: string; next?: string }>

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { invite, error, next } = await searchParams
  const [user, profile] = await Promise.all([getUser(), getProfile()])

  // Sessione gia' aperta: niente login silenzioso sopra l'account in uso. Si
  // dichiara chi e' connesso e si sceglie: continuare, o uscire e tornare a
  // questo stesso login conservando invito e deep link.
  let activeSession: React.ReactNode = null
  if (user) {
    const loginQuery = new URLSearchParams()
    if (invite) loginQuery.set('invite', invite)
    if (next) loginQuery.set('next', next)
    const returnTo = loginQuery.size > 0 ? `/auth/login?${loginQuery}` : '/auth/login'

    // Stessa precedenza del form: l'invito, poi il deep link validato, poi la
    // home del ruolo (default del pannello).
    const continueHref = invite
      ? `/welcome/${encodeURIComponent(invite)}/accept`
      : (safeNextPath(next) ?? undefined)

    activeSession = (
      <ActiveSessionPanel
        fullName={profile?.full_name ?? null}
        email={user.email ?? null}
        role={profile?.role ?? null}
        returnTo={returnTo}
        continueHref={continueHref}
      />
    )
  }

  return (
    <LoginForm
      invite={invite ?? null}
      error={error ?? null}
      next={next ?? null}
      activeSession={activeSession}
    />
  )
}
