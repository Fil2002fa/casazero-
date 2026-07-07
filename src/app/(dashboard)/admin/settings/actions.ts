'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { AdminNotificationPrefs } from '@/types/database'

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

  const name     = (formData.get('name') as string)?.trim()
  const logoFile = formData.get('logo') as File | null

  // primary_color non più gestito: colore brand fisso CasaZero (#04342C), non dal form.
  // Campi contatto (contact_email/contact_phone) rimossi dal form in attesa del flusso
  // assistenza definitivo: le colonne restano nello schema ma non vengono più scritte.
  const updateData: Record<string, string | null> = {}
  if (name) updateData.name = name

  // Upload logo se fornito. Bucket 'builder-logos' (pubblico, dedicato al branding),
  // mai 'documents' (privato, contiene i documenti dei condomini).
  if (logoFile && logoFile.size > 0) {
    const ext = logoFile.name.split('.').pop() ?? 'png'
    const storagePath = `${profile.builder_id}/logo.${ext}`
    const arrayBuffer = await logoFile.arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from('builder-logos')
      .upload(storagePath, arrayBuffer, { contentType: logoFile.type, upsert: true })

    if (uploadError) return { error: `Errore upload logo: ${uploadError.message}` }

    const { data: { publicUrl } } = supabase.storage.from('builder-logos').getPublicUrl(storagePath)

    // Cache-buster: path storage deterministico (logo.<ext>) → publicUrl identico a
    // ogni salvataggio, altrimenti browser/CDN servirebbe il logo vecchio dalla cache.
    // Stesso pattern di updateResidencePhoto (residences/[id]/actions.ts).
    updateData.logo_url = `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}v=${Date.now()}`
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

// Tab 1 — Identità: rimuove il logo del builder (logo_url → null), tornando
// al fallback foglia CasaZero. Il file su storage non viene cancellato: non serve
// e resta innocuo (upsert lo sovrascrive al prossimo caricamento).
export async function removeBuilderLogo(): Promise<{ error?: string; success?: boolean }> {
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

  const { error } = await supabase
    .from('builders')
    .update({ logo_url: null })
    .eq('id', profile.builder_id)

  if (error) return { error: error.message }

  revalidatePath('/admin/settings')
  revalidatePath('/', 'layout')
  return { success: true }
}

// Tab 3 — Profilo account: aggiorna il nome dell'utente super_admin loggato
// (la persona, non il builder). Riadatta il pattern di updateProfile del residente.
export async function updateAccountProfile(
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

  const fullName = (formData.get('full_name') as string)?.trim() || null

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/admin/settings')
  return { success: true }
}

// Tab 2 — Notifiche ricevute: preferenze notifiche del super_admin.
// Stessa colonna profiles.notification_prefs, chiavi distinte (vedi AdminNotificationPrefs).
export async function updateAdminNotificationPrefs(
  prefs: AdminNotificationPrefs
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

  const { error } = await supabase
    .from('profiles')
    .update({ notification_prefs: prefs, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) return { error: error.message }
  return {}
}
