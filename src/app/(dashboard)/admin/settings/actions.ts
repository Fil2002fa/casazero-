'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function updateBuilderSettings(
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, builder_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'super_admin') return { error: 'Permessi insufficienti' }
  if (!profile.builder_id) return { error: 'Nessun builder associato' }

  const name         = (formData.get('name') as string)?.trim()
  const primaryColor = (formData.get('primary_color') as string)?.trim()
  const contactEmail = (formData.get('contact_email') as string)?.trim()
  const contactPhone = (formData.get('contact_phone') as string)?.trim()
  const logoFile     = formData.get('logo') as File | null

  const updateData: Record<string, string | null> = {}
  if (name) updateData.name = name
  if (primaryColor && /^#[0-9A-Fa-f]{6}$/.test(primaryColor)) {
    updateData.primary_color = primaryColor
  }
  // Campi contatto: opzionali e svuotabili (stringa vuota → null)
  if (formData.has('contact_email')) updateData.contact_email = contactEmail || null
  if (formData.has('contact_phone')) updateData.contact_phone = contactPhone || null

  // Upload logo se fornito
  if (logoFile && logoFile.size > 0) {
    const ext = logoFile.name.split('.').pop() ?? 'png'
    const storagePath = `${profile.builder_id}/logo.${ext}`
    const arrayBuffer = await logoFile.arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, arrayBuffer, { contentType: logoFile.type, upsert: true })

    if (uploadError) return { error: `Errore upload logo: ${uploadError.message}` }

    const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(storagePath)
    updateData.logo_url = publicUrl
  }

  if (Object.keys(updateData).length === 0) return { error: 'Nessuna modifica da salvare' }

  const { error } = await supabase
    .from('builders')
    .update(updateData)
    .eq('id', profile.builder_id)

  if (error) return { error: error.message }

  revalidatePath('/admin/settings')
  revalidatePath('/', 'layout')
  return { success: true }
}
