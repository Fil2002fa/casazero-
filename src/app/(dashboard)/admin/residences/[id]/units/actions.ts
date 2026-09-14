'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { unitHasNoActiveAccount } from '@/lib/unit-utils'

type Caller = { userId: string; role: string } | { error: string }

async function requireCaller(action: string, roles: string[]): Promise<Caller> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) console.error(`${action}: errore lettura sessione`, authError)
  if (!user) return { error: 'Non autenticato' }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
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

  return { userId: user.id, role: profile.role }
}

export async function createUnit(
  residenceId: string,
  label: string,
  floor: number | null
): Promise<{ error?: string; id?: string }> {
  const caller = await requireCaller('createUnit', ['super_admin'])
  if ('error' in caller) return { error: caller.error }

  const admin = createServiceClient()

  // Unità + maintenance_items scope='unit' in un'unica transazione:
  // qualsiasi errore → ROLLBACK totale, nessuna unità senza piano.
  const { data: unitId, error: rpcErr } = await admin.rpc('czero_add_unit_with_items', {
    p_residence_id: residenceId,
    p_label: label.trim(),
    p_floor: floor,
  })

  if (rpcErr || !unitId) return { error: rpcErr?.message ?? 'Errore creazione unità' }

  revalidatePath(`/admin/residences/${residenceId}/units`)
  return { id: unitId as string }
}

export async function createInvite(
  unitId: string,
  residenceId: string
): Promise<{ error?: string; token?: string }> {
  const caller = await requireCaller('createInvite', ['admin', 'super_admin'])
  if ('error' in caller) return { error: caller.error }

  const admin = createServiceClient()

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  const { data: invite, error } = await admin
    .from('invites')
    .insert({
      unit_id: unitId,
      residence_id: residenceId,
      role: 'client',
      expires_at: expiresAt.toISOString(),
    })
    .select('token')
    .single()

  if (error || !invite) return { error: error?.message ?? 'Errore generazione invito' }

  revalidatePath(`/admin/residences/${residenceId}/units`)
  return { token: invite.token }
}

export async function createBulkInvites(
  unitIds: string[],
  residenceId: string
): Promise<{ count: number; skipped: number; error?: string }> {
  if (unitIds.length === 0) return { count: 0, skipped: 0 }

  const caller = await requireCaller('createBulkInvites', ['admin', 'super_admin'])
  if ('error' in caller) return { count: 0, skipped: 0, error: caller.error }

  const admin = createServiceClient()
  const now = new Date().toISOString()

  // Idempotency: skip units that already have an active invite
  const { data: existing } = await admin
    .from('invites')
    .select('unit_id')
    .in('unit_id', unitIds)
    .is('used_at', null)
    .gt('expires_at', now)

  const alreadyInvited = new Set((existing ?? []).map(i => i.unit_id as string))

  // Safety net: solo unità senza account cliente attivo, indipendentemente da cosa
  // ha già filtrato il chiamante (stesso helper condiviso usato lato client).
  const { data: memberRows } = await admin
    .from('unit_members')
    .select('unit_id, ended_at')
    .in('unit_id', unitIds)

  const membersByUnit = new Map<string, { ended_at: string | null }[]>()
  for (const row of memberRows ?? []) {
    const list = membersByUnit.get(row.unit_id as string) ?? []
    list.push({ ended_at: row.ended_at as string | null })
    membersByUnit.set(row.unit_id as string, list)
  }

  const toInvite = unitIds.filter(id =>
    !alreadyInvited.has(id) && unitHasNoActiveAccount(membersByUnit.get(id) ?? [])
  )

  if (toInvite.length === 0) return { count: 0, skipped: unitIds.length }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  const rows = toInvite.map(unitId => ({
    unit_id: unitId,
    residence_id: residenceId,
    role: 'client',
    expires_at: expiresAt.toISOString(),
  }))

  const { error } = await admin.from('invites').insert(rows)
  if (error) return { count: 0, skipped: unitIds.length - toInvite.length, error: error.message }

  revalidatePath(`/admin/residences/${residenceId}/units`)
  return { count: toInvite.length, skipped: unitIds.length - toInvite.length }
}

export async function updateUnitLabel(
  unitId: string,
  label: string,
  residenceId: string
): Promise<{ error?: string }> {
  const caller = await requireCaller('updateUnitLabel', ['super_admin'])
  if ('error' in caller) return { error: caller.error }

  const trimmed = label.trim()
  if (!trimmed) return { error: 'L\'etichetta non può essere vuota' }
  if (trimmed.length > 60) return { error: 'Etichetta troppo lunga (max 60 caratteri)' }

  const admin = createServiceClient()
  const { error } = await admin.from('units').update({ label: trimmed }).eq('id', unitId)
  if (error) return { error: error.message }

  revalidatePath(`/admin/residences/${residenceId}/units`)
  return {}
}

export async function revokeInvite(inviteId: string, residenceId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const admin = createServiceClient()
  const { error } = await admin.from('invites').delete().eq('id', inviteId)
  if (error) return { error: error.message }

  revalidatePath(`/admin/residences/${residenceId}/units`)
  return {}
}
