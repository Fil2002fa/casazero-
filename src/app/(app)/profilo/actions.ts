'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'

export async function createFamilyInvite(
  unitId: string,
  residenceId: string
): Promise<{ error?: string; token?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // Verifica che l'utente sia membro attivo dell'unità
  const { data: membership } = await supabase
    .from('unit_members')
    .select('unit_id')
    .eq('unit_id', unitId)
    .eq('profile_id', user.id)
    .is('ended_at', null)
    .single()

  if (!membership) return { error: 'Non sei membro di questa unità' }

  const admin = createServiceClient()

  // Max 5 inviti attivi per unità (anti-abuso)
  const now = new Date().toISOString()
  const { count } = await admin
    .from('invites')
    .select('id', { count: 'exact', head: true })
    .eq('unit_id', unitId)
    .is('used_at', null)
    .gt('expires_at', now)

  if ((count ?? 0) >= 5) return { error: 'Limite di 5 inviti attivi per unità raggiunto' }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  const { data: invite, error } = await admin
    .from('invites')
    .insert({ unit_id: unitId, residence_id: residenceId, role: 'client', expires_at: expiresAt.toISOString() })
    .select('token')
    .single()

  if (error || !invite) return { error: error?.message ?? 'Errore generazione invito' }

  revalidatePath('/profilo')
  return { token: invite.token }
}

export async function revokeFamilyInvite(
  inviteId: string,
  unitId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // Verifica che l'utente sia membro attivo dell'unità
  const { data: membership } = await supabase
    .from('unit_members')
    .select('unit_id')
    .eq('unit_id', unitId)
    .eq('profile_id', user.id)
    .is('ended_at', null)
    .single()

  if (!membership) return { error: 'Non sei membro di questa unità' }

  const admin = createServiceClient()

  // Verifica che l'invito appartenga all'unità (previene revoca cross-unit)
  const { data: invite } = await admin
    .from('invites')
    .select('id')
    .eq('id', inviteId)
    .eq('unit_id', unitId)
    .single()

  if (!invite) return { error: 'Invito non trovato' }

  const { error } = await admin.from('invites').delete().eq('id', inviteId)
  if (error) return { error: error.message }

  revalidatePath('/profilo')
  return {}
}

export async function updateNotificationPrefs(
  prefs: Record<string, boolean>
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase
    .from('profiles')
    .update({ notification_prefs: prefs, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) return { error: error.message }
  return {}
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/auth/login')
}
