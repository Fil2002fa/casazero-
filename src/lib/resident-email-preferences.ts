import type { SupabaseClient } from '@supabase/supabase-js'

// Solo eventi opzionali: avvisi obbligatori e solleciti restano invariati.
export async function allowsResidentEmail(client: SupabaseClient, profileId: string, category: 'email_reminders' | 'email_n3_status'): Promise<boolean> {
  try {
    const { data, error } = await client.from('profiles').select('notification_prefs').eq('id', profileId).maybeSingle()
    if (error || !data) {
      console.error('Preferenze email: destinatario escluso', { profileId, category, error: error ?? 'Profilo mancante' })
      return false
    }
    return data.notification_prefs?.[category] !== false
  } catch (error) {
    console.error('Preferenze email: lettura fallita, destinatario escluso', { profileId, category, error })
    return false
  }
}
