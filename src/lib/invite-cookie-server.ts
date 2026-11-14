import { cookies } from 'next/headers'
import { INVITE_COOKIE } from '@/lib/invite-cookie'

// Solo da server action / route handler (un Server Component non puo' scrivere
// cookie). Stesso path del cookie impostato dal middleware ('/').
export async function clearInviteCookie(): Promise<void> {
  const store = await cookies()
  store.delete(INVITE_COOKIE)
}
