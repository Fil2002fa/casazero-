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

  // 1. Crea residenza
  const { data: residence, error: resErr } = await admin
    .from('residences')
    .insert({ builder_id: profile.builder_id, name, address, energy_class: energyClass, delivery_date: deliveryDate })
    .select('id')
    .single()

  if (resErr || !residence) return { error: resErr?.message ?? 'Errore creazione residenza' }

  // 2. Crea unità
  const unitInserts = Array.from({ length: unitCount }, (_, i) => ({
    residence_id: residence.id,
    label: `Unità ${i + 1}`,
    floor: Math.floor(i / 2) + 1,
  }))
  const { data: units, error: unitsErr } = await admin.from('units').insert(unitInserts).select('id')
  if (unitsErr) return { error: unitsErr.message }

  // 3. Leggi template con categoria
  const { data: templates } = await admin
    .from('maintenance_templates')
    .select('id, scope, frequency_months, category')
    .order('sort_order')

  if (!templates?.length) {
    revalidatePath('/admin/residences')
    redirect(`/admin/residences/${residence.id}`)
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Calcola next_due_date e status iniziale.
  // Se la data calcolata è già nel passato → 'scaduta', altrimenti 'in_attesa'.
  // Il field name nel wizard è date_${category} con il valore esatto del template.
  function calcDue(category: string, freqMonths: number): { date: string; status: 'in_attesa' | 'scaduta' } {
    const override = formData.get(`date_${category}`) as string | null
    const base = override?.trim() ? override.trim() : deliveryDate
    const d = new Date(base)
    d.setMonth(d.getMonth() + freqMonths)
    return {
      date: d.toISOString().split('T')[0],
      status: d < today ? 'scaduta' : 'in_attesa',
    }
  }

  // 4. Crea maintenance_items
  const itemInserts: object[] = []
  for (const tpl of templates) {
    const { date: nextDue, status } = calcDue(tpl.category, tpl.frequency_months)
    if (tpl.scope === 'condominium') {
      itemInserts.push({
        template_id: tpl.id,
        residence_id: residence.id,
        unit_id: null,
        next_due_date: nextDue,
        status,
      })
    } else {
      for (const unit of (units ?? [])) {
        itemInserts.push({
          template_id: tpl.id,
          residence_id: residence.id,
          unit_id: unit.id,
          next_due_date: nextDue,
          status,
        })
      }
    }
  }

  if (itemInserts.length > 0) {
    await admin.from('maintenance_items').insert(itemInserts)
  }

  revalidatePath('/admin/residences')
  redirect(`/admin/residences/${residence.id}`)
}
