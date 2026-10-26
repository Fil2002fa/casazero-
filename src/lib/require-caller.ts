import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/database'

// NON è un modulo 'use server': in un file 'use server' ogni export diventa
// una server action chiamabile dal client, e questo helper non deve esserlo.
// Lo importano le action, che restano l'unico ingresso.

// `fullName` viene da `profiles.full_name` al momento dell'atto, letto lato
// server e mai da input: è ciò che il registro attività congela come attore
// (activity-log.ts:44-58). Stessa forma di `assertSuperAdmin` in admin-actions.ts.
export type Caller = { userId: string; role: UserRole; fullName: string | null } | { error: string }

export async function requireCaller(action: string, roles: string[]): Promise<Caller> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) console.error(`${action}: errore lettura sessione`, authError)
  if (!user) return { error: 'Non autenticato' }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error(`${action}: errore lettura profilo`, { userId: user.id, profileError })
    return { error: 'Errore temporaneo nella verifica dei permessi, riprova.' }
  }
  if (!profile) {
    console.error(`${action}: profilo non leggibile`, { userId: user.id })
    return { error: 'Profilo non leggibile per questo account, esci e rientra.' }
  }
  if (!roles.includes(profile.role)) {
    console.warn(`${action}: ruolo non ammesso`, { userId: user.id, role: profile.role })
    return { error: 'Permessi insufficienti' }
  }

  return { userId: user.id, role: profile.role, fullName: profile.full_name ?? null }
}
