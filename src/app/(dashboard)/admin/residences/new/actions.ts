'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'

export async function createResidence(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, builder_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'super_admin') return { error: 'Permessi insufficienti' }
  if (!profile.builder_id) return { error: 'Nessun builder associato al tuo account' }

  const name         = (formData.get('name') as string)?.trim()
  const address      = (formData.get('address') as string)?.trim() || null
  const energyClass  = (formData.get('energy_class') as string)?.trim() || null
  const deliveryDate = formData.get('delivery_date') as string
  const unitCount    = parseInt(formData.get('unit_count') as string, 10) || 1

  if (!name || !deliveryDate) return { error: 'Nome e data di consegna obbligatori' }

  const admin = createServiceClient()

  const units = Array.from({ length: unitCount }, (_, i) => ({
    label: `Unità ${i + 1}`,
    floor: Math.floor(i / 2) + 1,
  }))

  // Il field name nel wizard è date_${category} con il valore esatto del template.
  const categoryDates: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('date_') && typeof value === 'string' && value.trim()) {
      categoryDates[key.slice('date_'.length)] = value.trim()
    }
  }

  // Residenza + unità + maintenance_items in un'unica transazione:
  // qualsiasi errore → ROLLBACK totale, nessuna residenza parziale.
  const { data: residenceId, error: rpcErr } = await admin.rpc('czero_create_residence_with_units', {
    p_builder_id: profile.builder_id,
    p_name: name,
    p_address: address,
    p_energy_class: energyClass,
    p_delivery_date: deliveryDate,
    p_units: units,
    p_category_dates: categoryDates,
  })

  if (rpcErr || !residenceId) return { error: rpcErr?.message ?? 'Errore creazione residenza' }

  revalidatePath('/admin/residences')
  redirect(`/admin/residences/${residenceId}`)
}
