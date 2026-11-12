'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'

export async function createFamilyInvite(
  unitId: string
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

  // La residenza NON arriva dal client: si deriva qui dall'unità appena
  // verificata, perché l'insert sotto usa il service client e un residence_id
  // contraffatto renderebbe il token dell'invito leggibile (e revocabile) dal
  // tenant sbagliato — le policy su invites matchano anche su residence_id.
  const { data: unit, error: unitError } = await supabase
    .from('units')
    .select('residence_id')
    .eq('id', unitId)
    .maybeSingle()

  if (unitError) {
    console.error('createFamilyInvite: errore lettura unità', { unitId, unitError })
    return { error: 'Errore temporaneo, riprova tra poco.' }
  }
  if (!unit) return { error: 'Unità non trovata' }

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
    .insert({ unit_id: unitId, residence_id: unit.residence_id, role: 'client', expires_at: expiresAt.toISOString() })
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

export async function updateResidentProfile(input: { fullName: string }): Promise<{ error?: string; fullName?: string }> {
  if (typeof input?.fullName !== 'string') return { error: 'Inserisci un nome valido.' }
  const fullName = input.fullName.trim().replace(/\s+/g, ' ')
  if (fullName.length < 2 || fullName.length > 100 || /[\u0000-\u001f\u007f]/.test(fullName)) return { error: 'Inserisci un nome tra 2 e 100 caratteri.' }
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Sessione non disponibile. Accedi di nuovo.' }
  const { data, error } = await supabase.from('profiles').update({
    full_name: fullName,
    updated_at: new Date().toISOString(),
  }).eq('id', user.id).select('full_name').single()
  if (error || !data) {
    console.error('updateResidentProfile: salvataggio fallito', error)
    return { error: 'Impossibile salvare il nome. Riprova.' }
  }
  revalidatePath('/profilo')
  revalidatePath('/profilo/dati-personali')
  return { fullName: data.full_name }
}

export async function updateNotificationPrefs(
  prefs: Record<string, boolean>
): Promise<{ error?: string }> {
  if (!prefs || typeof prefs.email_reminders !== 'boolean' || typeof prefs.email_n3_status !== 'boolean') return { error: 'Preferenze non valide.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: profile, error: readError } = await supabase.from('profiles').select('notification_prefs').eq('id', user.id).single()
  if (readError) {
    console.error('updateNotificationPrefs: lettura fallita', readError)
    return { error: 'Impossibile leggere le preferenze. Riprova.' }
  }
  const { data, error } = await supabase
    .from('profiles')
    .update({ notification_prefs: { ...profile.notification_prefs, email_reminders: prefs.email_reminders, email_n3_status: prefs.email_n3_status }, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select('id').single()

  if (error || !data) {
    console.error('updateNotificationPrefs: salvataggio fallito', error)
    return { error: 'Impossibile salvare le preferenze. Riprova.' }
  }
  revalidatePath('/profilo')
  return {}
}
