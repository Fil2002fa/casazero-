'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { logActivityEvent } from '@/lib/activity-log'
import type { UserRole } from '@/types/database'

// Identità del super_admin che compie l'atto, letta lato server dalla
// sessione: è ciò che il registro attività congela come attore
// (activity-log.ts:44-58). `fullName` viene da `profiles.full_name` al
// momento dell'atto, mai da input del client. Stessa forma di `requireCaller`
// in units/actions.ts:8.
type SuperAdminCaller =
  | { userId: string; role: UserRole; fullName: string | null }
  | { error: string }

async function assertSuperAdmin(): Promise<SuperAdminCaller> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()
  if (profileError) console.error('assertSuperAdmin: errore lettura profilo', { userId: user.id, profileError })
  if (profile?.role !== 'super_admin') return { error: 'Permessi insufficienti' }
  return { userId: user.id, role: profile.role, fullName: profile.full_name ?? null }
}

export async function assignAdmin(
  residenceId: string,
  profileId: string,
): Promise<{ error?: string }> {
  const caller = await assertSuperAdmin()
  if ('error' in caller) return { error: caller.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from('admin_assignments')
    .upsert({ profile_id: profileId, residence_id: residenceId }, { onConflict: 'residence_id' })

  if (error) {
    if (error.code === '23505') return { error: 'Amministratore già assegnato a questa residenza.' }
    return { error: 'Errore durante l\'assegnazione. Riprova.' }
  }
  revalidatePath(`/admin/residences/${residenceId}`)
  return {}
}

export async function removeAdminAssignment(
  residenceId: string,
): Promise<{ error?: string }> {
  const caller = await assertSuperAdmin()
  if ('error' in caller) return { error: caller.error }

  const supabase = await createClient()
  // .select('profile_id') sul delete: senza, la action non sa chi ha rimosso
  // né se ha rimosso qualcuno, e il registro non può descrivere l'atto.
  const { data: removed, error } = await supabase
    .from('admin_assignments')
    .delete()
    .eq('residence_id', residenceId)
    .select('profile_id')

  if (error) return { error: error.message }

  // Una riga per ATTO, solo se qualcosa è stato rimosso davvero: con
  // UNIQUE(residence_id) le righe sono al più una, ma un delete a vuoto (admin
  // già assente) non è un atto e la tabella è append-only.
  const removedIds = (removed ?? []).map(row => row.profile_id as string)
  if (removedIds.length > 0) {
    const svc = createServiceClient()
    const removedName = await readProfileName(svc, removedIds[0])

    await logActivityEvent(svc, {
      residenceId,
      unitId: null,
      eventType: 'admin_rimosso',
      // Attore dalla sessione (assertSuperAdmin), mai da input: il service
      // client bypassa le policy INSERT della 037, l'antispoofing vive qui.
      actorId: caller.userId,
      actorRole: caller.role,
      actorName: caller.fullName,
      payload: {
        removed_profile_id: removedIds[0],
        // Congelato come actor_name: il registro non deve cambiare di senso
        // se la persona rimossa cambia nome dopo.
        removed_name: removedName,
        count: removedIds.length,
      },
    })
  }

  revalidatePath(`/admin/residences/${residenceId}`)
  return {}
}

/**
 * Nome di un profilo per il payload del registro, letto con il service
 * client. Ritorna null su errore o profilo assente, e lo logga: il registro
 * non deve mai bloccare un atto già compiuto per un nome mancante.
 */
async function readProfileName(svc: ReturnType<typeof createServiceClient>, profileId: string): Promise<string | null> {
  const { data, error } = await svc
    .from('profiles')
    .select('full_name')
    .eq('id', profileId)
    .maybeSingle()
  if (error) console.error('readProfileName: errore lettura profilo', { profileId, error })
  return data?.full_name ?? null
}

export async function createAdminInvite(
  residenceId: string,
): Promise<{ error?: string; token?: string }> {
  const caller = await assertSuperAdmin()
  if ('error' in caller) return { error: caller.error }

  const svc = createServiceClient()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  const { data: invite, error } = await svc
    .from('invites')
    .insert({ residence_id: residenceId, role: 'admin', expires_at: expiresAt.toISOString() })
    .select('token')
    .single()

  if (error || !invite) return { error: error?.message ?? 'Errore generazione invito' }
  return { token: invite.token }
}

export async function getAdminEmail(
  profileId: string,
): Promise<{ email?: string; error?: string }> {
  const caller = await assertSuperAdmin()
  if ('error' in caller) return { error: caller.error }

  const svc = createServiceClient()
  const { data, error } = await svc.auth.admin.getUserById(profileId)
  if (error) return { error: error.message }
  return { email: data.user?.email }
}
