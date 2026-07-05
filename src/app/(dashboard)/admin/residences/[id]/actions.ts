'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Carica/sostituisce la foto (facciata) di una residenza. Specchia la forma di
// updateBuilderSettings (gate super_admin, upload, getPublicUrl, update, revalidate)
// ma su bucket PUBBLICO 'residence-photos' e con scope per residenza (.eq('id', …)),
// mai builder_id. Path deterministico → l'upload sovrascrive, niente file orfani.
export async function updateResidencePhoto(
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

  if (profile?.role !== 'super_admin') return { error: 'Permessi insufficienti' }

  const residenceId = (formData.get('residence_id') as string)?.trim()
  if (!residenceId) return { error: 'Residenza non specificata' }

  const photoFile = formData.get('photo') as File | null
  if (!photoFile || photoFile.size === 0) return { error: 'Nessuna foto selezionata' }

  const ext = photoFile.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const storagePath = `${residenceId}/facade.${ext}`
  const arrayBuffer = await photoFile.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from('residence-photos')
    .upload(storagePath, arrayBuffer, { contentType: photoFile.type, upsert: true })

  if (uploadError) {
    // Il bucket accetta solo image/jpeg|png|webp: un MIME rifiutato torna qui.
    const rejectedMime = /mime type|not supported|invalid_mime/i.test(uploadError.message)
    if (rejectedMime) return { error: 'Formato non supportato: usa JPG, PNG o WEBP' }
    return { error: `Errore upload foto: ${uploadError.message}` }
  }

  const { data: { publicUrl } } = supabase.storage
    .from('residence-photos')
    .getPublicUrl(storagePath)

  const { error } = await supabase
    .from('residences')
    .update({ photo_url: publicUrl })
    .eq('id', residenceId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/residences/${residenceId}`)
  revalidatePath('/', 'layout')
  return { success: true }
}
