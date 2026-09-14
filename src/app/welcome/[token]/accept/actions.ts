'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  activateInvite,
  checkInviteForUser,
  FORBIDDEN_ROLE,
  INVALID_INVITE,
  TEMPORARY_ERROR,
} from './accept-invite'

export async function confirmInvite(token: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) console.error('confirmInvite: errore lettura sessione', authError)
  if (!user) redirect(`/auth/login?invite=${encodeURIComponent(token)}`)

  const check = await checkInviteForUser(token, user.id)
  if (check.status === 'error') return { error: TEMPORARY_ERROR }
  if (check.status === 'invalid') return { error: INVALID_INVITE }
  if (check.status === 'forbidden') return { error: FORBIDDEN_ROLE }

  const failed = await activateInvite(check.context, user.id)
  if (failed) return failed

  redirect('/')
}

export async function signOutForInvite(token: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()
  if (error) console.error('signOutForInvite: errore logout', error)
  redirect(`/auth/login?invite=${encodeURIComponent(token)}`)
}
