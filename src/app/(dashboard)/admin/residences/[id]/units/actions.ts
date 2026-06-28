'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'

export async function createUnit(
  residenceId: string,
  label: string,
  floor: number | null
): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, builder_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'super_admin') return { error: 'Permessi insufficienti' }

  const admin = createServiceClient()

  // Crea l'unità
  const { data: unit, error: unitErr } = await admin
    .from('units')
    .insert({ residence_id: residenceId, label: label.trim(), floor })
    .select('id')
    .single()

  if (unitErr || !unit) return { error: unitErr?.message ?? 'Errore creazione unità' }

  // Crea gli item per i template scope=unit
  const { data: templates } = await admin
    .from('maintenance_templates')
    .select('id, frequency_months')
    .eq('scope', 'unit')

  if (templates?.length) {
    const { data: residence } = await admin
      .from('residences')
      .select('delivery_date')
      .eq('id', residenceId)
      .single()

    const base = residence?.delivery_date ?? new Date().toISOString().split('T')[0]

    const items = templates.map(t => {
      const d = new Date(base)
      d.setMonth(d.getMonth() + t.frequency_months)
      return {
        template_id: t.id,
        residence_id: residenceId,
        unit_id: unit.id,
        next_due_date: d.toISOString().split('T')[0],
        status: 'in_attesa',
      }
    })

    await admin.from('maintenance_items').insert(items)
  }

  revalidatePath(`/admin/residences/${residenceId}/units`)
  return { id: unit.id }
}

export async function createInvite(
  unitId: string,
  residenceId: string
): Promise<{ error?: string; token?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { error: 'Permessi insufficienti' }
  }

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

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { count: 0, skipped: 0, error: 'Non autenticato' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { count: 0, skipped: 0, error: 'Permessi insufficienti' }
  }

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
  const toInvite = unitIds.filter(id => !alreadyInvited.has(id))

  if (toInvite.length === 0) return { count: 0, skipped: alreadyInvited.size }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  const rows = toInvite.map(unitId => ({
    unit_id: unitId,
    residence_id: residenceId,
    role: 'client',
    expires_at: expiresAt.toISOString(),
  }))

  const { error } = await admin.from('invites').insert(rows)
  if (error) return { count: 0, skipped: alreadyInvited.size, error: error.message }

  revalidatePath(`/admin/residences/${residenceId}/units`)
  return { count: toInvite.length, skipped: alreadyInvited.size }
}

export async function updateUnitLabel(
  unitId: string,
  label: string,
  residenceId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'super_admin') return { error: 'Permessi insufficienti' }

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
