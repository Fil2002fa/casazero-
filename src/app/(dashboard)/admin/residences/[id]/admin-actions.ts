'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'

async function assertSuperAdmin(): Promise<{ error: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'super_admin') return { error: 'Permessi insufficienti' }
  return null
}

export async function assignAdmin(
  residenceId: string,
  profileId: string,
): Promise<{ error?: string }> {
  const authErr = await assertSuperAdmin()
  if (authErr) return authErr

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
  const authErr = await assertSuperAdmin()
  if (authErr) return authErr

  const supabase = await createClient()
  const { error } = await supabase
    .from('admin_assignments')
    .delete()
    .eq('residence_id', residenceId)

  if (error) return { error: error.message }
  revalidatePath(`/admin/residences/${residenceId}`)
  return {}
}

export async function createAdminInvite(
  residenceId: string,
): Promise<{ error?: string; token?: string }> {
  const authErr = await assertSuperAdmin()
  if (authErr) return authErr

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
  const authErr = await assertSuperAdmin()
  if (authErr) return authErr

  const svc = createServiceClient()
  const { data, error } = await svc.auth.admin.getUserById(profileId)
  if (error) return { error: error.message }
  return { email: data.user?.email }
}
