'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/safe-next-path'

// Logout unico per tutte le superfici (PWA, dashboard, pagine di accesso).
// `returnTo` permette di tornare al login conservando invito o deep link
// (es. `/auth/login?invite=…`): ammesso solo un path interno che resta sul
// login, mai una destinazione arbitraria. Si usa con bind:
//   <form action={signOut.bind(null, null)}>
export async function signOut(returnTo: string | null): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()
  if (error) console.error('signOut: errore logout', error)

  const safe = safeNextPath(returnTo)
  redirect(safe && (safe === '/auth/login' || safe.startsWith('/auth/login?')) ? safe : '/auth/login')
}
