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

  if (!name || !deliveryDate) return { error: 'Nome e data di consegna obbligatori' }

  const unitsResult = parseUnits(formData.get('units'))
  if ('error' in unitsResult) return { error: unitsResult.error }
  const units = unitsResult.units

  const admin = createServiceClient()

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
  redirect(`/admin/residences/${residenceId}/documenti?onboarding=1`)
}

const MAX_UNITS = 200

// Valida il JSON delle unità arrivato dal client. L'hidden field è manipolabile
// dai DevTools: prima la shape (array di {label: string, floor: number}), poi le
// stesse regole di merito del client (≥1 unità, label non vuote e uniche
// case-insensitive, floor intero ≥ 0).
function parseUnits(raw: FormDataEntryValue | null):
  { units: { label: string; floor: number }[] } | { error: string } {
  if (typeof raw !== 'string') return { error: 'Dati unità mancanti' }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { error: 'Dati unità non validi' }
  }

  if (!Array.isArray(parsed)) return { error: 'Dati unità non validi' }
  if (parsed.length === 0) return { error: 'Serve almeno una unità' }
  if (parsed.length > MAX_UNITS) return { error: `Massimo ${MAX_UNITS} unità per residenza` }

  const units: { label: string; floor: number }[] = []
  const seen = new Set<string>()
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) return { error: 'Dati unità non validi' }
    const { label, floor } = entry as Record<string, unknown>
    if (typeof label !== 'string' || typeof floor !== 'number') return { error: 'Dati unità non validi' }
    const trimmed = label.trim()
    if (!trimmed) return { error: 'Ogni unità deve avere un nome' }
    if (!Number.isInteger(floor) || floor < 0) {
      return { error: `Piano non valido per "${trimmed}": serve un numero intero da 0 in su` }
    }
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return { error: `Nome unità duplicato: "${trimmed}"` }
    seen.add(key)
    units.push({ label: trimmed, floor })
  }
  return { units }
}
