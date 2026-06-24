'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { DocumentCategory } from '@/types/database'

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const MAX_SIZE = 52428800 // 50 MB

export type UploadResult = {
  uploaded: string[]
  failed: { name: string; reason: string }[]
  error?: string
}

export async function uploadDocumentiAdmin(formData: FormData): Promise<UploadResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { uploaded: [], failed: [], error: 'Non autenticato' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'super_admin') {
    return { uploaded: [], failed: [], error: 'Permessi insufficienti' }
  }

  const residenceId = (formData.get('residenceId') as string)?.trim()
  const unitId      = (formData.get('unitId') as string) || null
  const category    = formData.get('category') as DocumentCategory
  const fileDate    = (formData.get('fileDate') as string) || null

  if (!residenceId || !category) {
    return { uploaded: [], failed: [], error: 'Parametri obbligatori mancanti' }
  }

  const files = formData.getAll('files') as File[]
  const realFiles = files.filter(f => f && f.size > 0)
  if (!realFiles.length) {
    return { uploaded: [], failed: [], error: 'Nessun file selezionato' }
  }

  const uploaded: string[] = []
  const failed: { name: string; reason: string }[] = []

  for (const file of realFiles) {
    if (!ALLOWED_MIME.has(file.type)) {
      failed.push({ name: file.name, reason: 'Tipo file non supportato (PDF, immagini, Word)' })
      continue
    }
    if (file.size > MAX_SIZE) {
      failed.push({ name: file.name, reason: 'File troppo grande (max 50 MB)' })
      continue
    }

    const ext = file.name.split('.').pop() ?? 'bin'
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '')
    const safeTitle = nameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
    const storagePath = `${residenceId}/${category}/${Date.now()}_${safeTitle}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, arrayBuffer, { contentType: file.type })

    if (uploadError) {
      failed.push({ name: file.name, reason: `Errore upload: ${uploadError.message}` })
      continue
    }

    const { error: dbError } = await supabase.from('documents').insert({
      residence_id: residenceId,
      unit_id:      unitId,
      category,
      title:        nameWithoutExt || file.name,
      storage_path: storagePath,
      file_name:    file.name,
      file_date:    fileDate || new Date().toISOString().split('T')[0],
      uploaded_by:  user.id,
    })

    if (dbError) {
      // Cleanup file orfano se l'insert DB fallisce
      await supabase.storage.from('documents').remove([storagePath])
      failed.push({ name: file.name, reason: `Errore salvataggio: ${dbError.message}` })
      continue
    }

    uploaded.push(file.name)
  }

  if (uploaded.length > 0) {
    revalidatePath(`/admin/residences/${residenceId}/documenti`)
  }

  return { uploaded, failed }
}
