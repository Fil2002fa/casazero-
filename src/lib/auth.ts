import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile, UserRole } from '@/types/database'

export function homePathForRole(role: string | null | undefined): string {
  if (role === 'admin' || role === 'super_admin') return '/admin'
  return '/'
}

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  return data
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile()
  if (!profile) redirect('/auth/login')
  return profile
}

export async function requireRole(roles: UserRole[], fallbackPath = '/'): Promise<Profile> {
  const profile = await requireProfile()
  if (!roles.includes(profile.role)) redirect(fallbackPath)
  return profile
}
