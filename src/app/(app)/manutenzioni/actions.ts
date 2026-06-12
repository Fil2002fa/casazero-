'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function completeN2(
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const itemId      = formData.get('itemId') as string
  const unitId      = formData.get('unitId') as string
  const residenceId = formData.get('residenceId') as string
  const completedAt = formData.get('completedAt') as string
  const notes       = (formData.get('notes') as string) || null
  const file        = formData.get('attachment') as File | null

  if (!itemId || !unitId || !residenceId || !completedAt) {
    return { error: 'Dati obbligatori mancanti' }
  }

  // RLS verifica che il client abbia accesso all'unità
  const { data: completion, error: completionError } = await supabase
    .from('completions')
    .insert({
      item_id: itemId,
      unit_id: unitId,
      residence_id: residenceId,
      completed_at: completedAt,
      performed_by_profile_id: user.id,
      notes,
    })
    .select('id')
    .single()

  if (completionError || !completion) {
    return { error: completionError?.message ?? 'Errore nel salvataggio' }
  }

  // Upload allegato opzionale su Storage
  if (file && file.size > 0) {
    const ext = file.name.split('.').pop() ?? 'bin'
    const storagePath = `${completion.id}/${Date.now()}.${ext}`
    const arrayBuffer = await file.arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(storagePath, arrayBuffer, { contentType: file.type })

    if (!uploadError) {
      await supabase.from('attachments').insert({
        completion_id: completion.id,
        storage_path:  storagePath,
        file_name:     file.name,
        file_size:     file.size,
        mime_type:     file.type,
      })
    }
  }

  revalidatePath('/manutenzioni')
  revalidatePath(`/manutenzioni/${itemId}`)
  return { success: true }
}

export async function addComment(
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const itemId = formData.get('itemId') as string
  const body   = (formData.get('body') as string)?.trim()

  if (!itemId || !body) return { error: 'Il commento non può essere vuoto' }

  const { error } = await supabase
    .from('comments')
    .insert({ item_id: itemId, profile_id: user.id, body })

  if (error) return { error: error.message }

  revalidatePath(`/manutenzioni/${itemId}`)
  return { success: true }
}
