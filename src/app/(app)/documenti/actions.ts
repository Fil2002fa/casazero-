'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { DocumentCategory } from '@/types/database'
import { ALLOWED_DOCUMENT_MIME, MAX_DOCUMENT_SIZE } from '@/lib/document-upload'

export async function uploadDocument(
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // Solo admin e super_admin possono caricare documenti
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role === 'client') {
    return { error: 'Permessi insufficienti' }
  }

  const residenceId = formData.get('residenceId') as string
  const unitId      = (formData.get('unitId') as string) || null
  const title       = (formData.get('title') as string)?.trim()
  const category    = formData.get('category') as DocumentCategory
  const file        = formData.get('file') as File | null

  if (!residenceId || !title || !category || !file || file.size === 0) {
    return { error: 'Tutti i campi obbligatori devono essere compilati' }
  }

  if (file.size > MAX_DOCUMENT_SIZE) return { error: 'File troppo grande (max 50 MB)' }
  if (!ALLOWED_DOCUMENT_MIME.has(file.type)) {
    return { error: 'Tipo file non supportato (PDF, immagini, Word)' }
  }

  const ext = file.name.split('.').pop() ?? 'bin'
  const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
  const storagePath = `${residenceId}/${category}/${Date.now()}_${safeTitle}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, arrayBuffer, { contentType: file.type })

  if (uploadError) return { error: `Errore upload: ${uploadError.message}` }

  const { error: dbError } = await supabase.from('documents').insert({
    residence_id: residenceId,
    unit_id:      unitId,
    category,
    title,
    storage_path: storagePath,
    file_name:    file.name,
    file_date:    new Date().toISOString().split('T')[0],
    uploaded_by:  user.id,
  })

  if (dbError) {
    // Rimuovi il file già caricato se il DB fallisce
    await supabase.storage.from('documents').remove([storagePath])
    return { error: `Errore salvataggio: ${dbError.message}` }
  }

  revalidatePath('/documenti')
  return { success: true }
}
