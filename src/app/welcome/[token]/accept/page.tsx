import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { InviteError } from '../InviteError'
import { checkInviteForUser, FORBIDDEN_ROLE, TEMPORARY_ERROR } from './accept-invite'
import { AcceptConfirm } from './AcceptConfirm'

type Params = Promise<{ token: string }>

// Solo lettura: le scritture partono dalla conferma esplicita (confirmInvite), mai dal render di una GET.
export default async function AcceptInvitePage({ params }: { params: Params }) {
  const { token } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect(`/auth/login?invite=${token}`)

  const check = await checkInviteForUser(token, user.id)

  if (check.status === 'error') return <InviteError message={TEMPORARY_ERROR} />

  // Token invalido, scaduto, o già usato — va bene lo stesso, mandiamo alla home
  if (check.status === 'invalid') redirect('/')

  if (check.status === 'forbidden') {
    return <InviteError message={FORBIDDEN_ROLE} loginHref={`/auth/login?invite=${token}`} />
  }

  return (
    <AcceptConfirm
      token={token}
      email={user.email ?? null}
      role={check.context.role}
      residenceName={check.context.residenceName}
      unitLabel={check.context.unitLabel}
    />
  )
}
