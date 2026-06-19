'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { sendEmail, emailN3StatusChanged } from '@/lib/notifications'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export async function takeChargeN3(
  itemId: string
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()

  // RLS verifica che l'admin abbia accesso alla residenza dell'item
  const { error } = await supabase
    .from('maintenance_items')
    .update({ status: 'in_corso' })
    .eq('id', itemId)

  if (error) return { error: error.message }

  revalidatePath('/admin/manutenzioni')
  revalidatePath(`/manutenzioni/${itemId}`)
  return { success: true }
}

export async function completeN3(
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const itemId         = formData.get('itemId') as string
  const residenceId    = formData.get('residenceId') as string
  const completedAt    = formData.get('completedAt') as string
  const notes          = (formData.get('notes') as string) || null
  const performedByName = (formData.get('performedByName') as string) || null
  const file           = formData.get('verbale') as File | null

  if (!itemId || !residenceId || !completedAt) {
    return { error: 'Dati obbligatori mancanti' }
  }

  // Ottieni titolo item per la notifica ai residenti
  const { data: item } = await supabase
    .from('maintenance_items')
    .select('maintenance_templates(title)')
    .eq('id', itemId)
    .single()

  const { data: completion, error } = await supabase
    .from('completions')
    .insert({
      item_id: itemId,
      residence_id: residenceId,
      completed_at: completedAt,
      performed_by_profile_id: user.id,
      performed_by_name: performedByName,
      notes,
    })
    .select('id')
    .single()

  if (error || !completion) return { error: error?.message ?? 'Errore nel salvataggio' }

  // Upload verbale opzionale
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

  // Notifica i residenti in background (fire and forget)
  const title = (item?.maintenance_templates as { title?: string } | null)?.title ?? 'Manutenzione condominiale'
  notifyResidents(residenceId, itemId, title).catch(console.error)

  revalidatePath('/admin/manutenzioni')
  revalidatePath('/manutenzioni')
  return { success: true }
}

async function notifyResidents(residenceId: string, itemId: string, title: string) {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: residence } = await admin
    .from('residences')
    .select('name')
    .eq('id', residenceId)
    .single()

  const { data: members } = await admin
    .from('unit_members')
    .select('profile_id, units!inner(residence_id)')
    .eq('units.residence_id', residenceId)
    .is('ended_at', null)

  for (const m of members ?? []) {
    await admin.from('notifications').insert({
      profile_id: m.profile_id,
      type: 'n3_status_changed',
      payload: { item_id: itemId, title, new_status: 'completata' },
      channel: 'email',
      status: 'pending',
    })
    const { data: authUser } = await admin.auth.admin.getUserById(m.profile_id)
    const email = authUser?.user?.email
    if (email) {
      await sendEmail({
        to: email,
        subject: `Manutenzione condominiale completata: "${title}"`,
        html: emailN3StatusChanged(title, 'Completata', residence?.name ?? 'la tua residenza', APP_URL),
      })
    }
  }
}
