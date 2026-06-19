'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createSupplier(
  residenceId: string,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
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

  const name  = (formData.get('name') as string)?.trim()
  const phone = (formData.get('phone') as string)?.trim() || null
  const email = (formData.get('email') as string)?.trim() || null
  const categoriesRaw = (formData.get('categories') as string)?.trim() || ''
  const categories = categoriesRaw.split(',').map(c => c.trim()).filter(Boolean)

  if (!name) return { error: 'Nome fornitore obbligatorio' }

  const { error } = await supabase
    .from('suppliers')
    .insert({ residence_id: residenceId, name, phone, email, categories })

  if (error) return { error: error.message }

  revalidatePath(`/admin/residences/${residenceId}/fornitori`)
  return { success: true }
}

export async function deleteSupplier(
  supplierId: string,
  residenceId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase
    .from('suppliers')
    .delete()
    .eq('id', supplierId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/residences/${residenceId}/fornitori`)
  return {}
}

export async function updateMaintenanceItemConfig(
  itemId: string,
  residenceId: string,
  data: {
    frequency_months?: number | null
    priority?: string | null
    warranty_info?: string | null
    supplier_id?: string | null
  }
): Promise<{ error?: string; success?: boolean }> {
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

  const { error } = await supabase
    .from('maintenance_items')
    .update(data)
    .eq('id', itemId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/residences/${residenceId}/manutenzioni`)
  return { success: true }
}
