import { createServiceClient } from '@/lib/supabase/admin'

export const TEMPORARY_ERROR = 'Errore temporaneo, riprova tra poco.'
export const ACTIVATION_ERROR = 'Errore temporaneo durante l\'attivazione, riprova tra poco.'
export const INVALID_INVITE = 'Questo invito non è più valido: potrebbe essere già stato usato o essere scaduto.'
export const FORBIDDEN_ROLE = 'Questo account ha già un ruolo di gestione su CasaZero e l\'invito non può cambiarlo. Accedi con un altro indirizzo email.'

export type AcceptContext = {
  inviteId: string
  unitId: string | null
  role: string
  builderId: string | null
  residenceId: string | null
  residenceName: string | null
  unitLabel: string | null
}

export type AcceptCheck =
  | { status: 'ok'; context: AcceptContext }
  | { status: 'invalid' }
  | { status: 'forbidden' }
  | { status: 'error' }

export async function checkInviteForUser(token: string, userId: string): Promise<AcceptCheck> {
  const admin = createServiceClient()

  const { data: invite, error: inviteError } = await admin
    .from('invites')
    .select('id, unit_id, residence_id, role, expires_at, units(label, residence_id, residences(name, builder_id)), residences(name)')
    .eq('token', token)
    .is('used_at', null)
    .maybeSingle()

  if (inviteError) {
    console.error('accept: errore lettura invito', inviteError)
    return { status: 'error' }
  }
  if (!invite || new Date(invite.expires_at) < new Date()) return { status: 'invalid' }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (profileError || !profile) {
    console.error('accept: errore lettura profilo', profileError ?? 'profilo assente')
    return { status: 'error' }
  }

  // Un invito può solo far salire un client: mai cambiare il ruolo di un account di gestione.
  if (profile.role !== 'client' && profile.role !== invite.role) return { status: 'forbidden' }

  const unitData = invite.units as unknown as {
    label: string
    residence_id: string
    residences: { name: string; builder_id: string } | null
  } | null
  const directResidence = invite.residences as unknown as { name: string } | null

  return {
    status: 'ok',
    context: {
      inviteId: invite.id,
      unitId: invite.unit_id,
      role: invite.role,
      builderId: unitData?.residences?.builder_id ?? null,
      residenceId: unitData?.residence_id ?? invite.residence_id,
      residenceName: unitData?.residences?.name ?? directResidence?.name ?? null,
      unitLabel: unitData?.label ?? null,
    },
  }
}

// Ogni scrittura fallita si ferma prima di used_at: l'invito resta riutilizzabile per riprovare.
export async function activateInvite(context: AcceptContext, userId: string): Promise<{ error: string } | null> {
  const admin = createServiceClient()

  const { error: profileUpdateError } = await admin.from('profiles').update({
    role: context.role,
    ...(context.builderId ? { builder_id: context.builderId } : {}),
  }).eq('id', userId)

  if (profileUpdateError) {
    console.error('accept: errore aggiornamento profilo', profileUpdateError)
    return { error: ACTIVATION_ERROR }
  }

  if (context.unitId) {
    const { data: existing, error: existingError } = await admin
      .from('unit_members')
      .select('id')
      .eq('unit_id', context.unitId)
      .eq('profile_id', userId)
      .is('ended_at', null)
      .maybeSingle()

    if (existingError) {
      console.error('accept: errore lettura membership', existingError)
      return { error: ACTIVATION_ERROR }
    }

    if (!existing) {
      const { error: memberError } = await admin.from('unit_members').insert({
        unit_id: context.unitId,
        profile_id: userId,
        started_at: new Date().toISOString().split('T')[0],
        is_primary: true,
      })

      if (memberError) {
        console.error('accept: errore collegamento unità', memberError)
        return { error: ACTIVATION_ERROR }
      }
    }
  }

  if ((context.role === 'admin' || context.role === 'super_admin') && context.residenceId) {
    const { error: assignmentError } = await admin.from('admin_assignments').upsert({
      profile_id: userId,
      residence_id: context.residenceId,
    }, { onConflict: 'profile_id,residence_id', ignoreDuplicates: true })

    if (assignmentError) {
      console.error('accept: errore assegnazione residenza', assignmentError)
      return { error: ACTIVATION_ERROR }
    }
  }

  const { error: usedError } = await admin
    .from('invites')
    .update({ used_at: new Date().toISOString() })
    .eq('id', context.inviteId)

  if (usedError) {
    console.error('accept: errore chiusura invito', usedError)
    return { error: ACTIVATION_ERROR }
  }

  return null
}
