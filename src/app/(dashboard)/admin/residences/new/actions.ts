'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { RESIDENCE_FEATURES, featureFieldName, type FeatureKey } from '@/lib/residence-features'
import { prepareResidenceInput, residenceCreatorGate, residenceRpcParams } from '@/lib/residence-input'

export async function createResidence(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // maybeSingle: l'assenza di riga è un esito di dominio (data null, nessun
  // error); qualunque error è un fallimento tecnico e non va mai mostrato
  // come "Permessi insufficienti".
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role, builder_id')
    .eq('id', user.id)
    .maybeSingle()
  if (profileErr) console.error('[createResidence] lettura profilo fallita', profileErr)

  const gate = residenceCreatorGate(profile, profileErr)
  if ('error' in gate) return { error: gate.error }

  // Adattatore: legge il FormData e passa valori grezzi al modulo condiviso,
  // che applica le regole (src/lib/residence-input.ts).
  //
  // Date per categoria: il field name nel wizard è date_${category} con il
  // valore esatto del template; si toglie il prefisso e il modulo scarta i
  // vuoti.
  const categoryDates: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('date_')) categoryDates[key.slice('date_'.length)] = value
  }

  // Dotazioni: si itera la COSTANTE, mai le chiavi del FormData (una chiave
  // mancante o rinominata passerebbe in silenzio). Una checkbox non spuntata
  // non compare affatto nel FormData, quindi l'assenza vale false, ed è un
  // false DICHIARATO: chi ha attraversato il passo 2 ha risposto, e un "no"
  // dichiarato è un dato che vale. Il terzo stato della RPC (p_features NULL
  // = "dotazioni non dichiarate", 034 righe 33-44) resta riservato a chi crea
  // residenze senza passare dal wizard.
  const features = Object.fromEntries(
    RESIDENCE_FEATURES.map(f => [f.key, formData.get(featureFieldName(f.key)) !== null])
  ) as Record<FeatureKey, boolean>

  const prepared = prepareResidenceInput({
    name: formData.get('name'),
    address: formData.get('address'),
    energyClass: formData.get('energy_class'),
    deliveryDate: formData.get('delivery_date'),
    unitsDeliveryDate: formData.get('units_delivery_date'),
    units: formData.get('units'),
    categoryDates,
    features,
  })
  if ('error' in prepared) return { error: prepared.error }

  const admin = createServiceClient()

  // Residenza + unità + maintenance_items in un'unica transazione:
  // qualsiasi errore → ROLLBACK totale, nessuna residenza parziale.
  const { data: residenceId, error: rpcErr } = await admin.rpc(
    'czero_create_residence_with_units',
    residenceRpcParams(gate.builderId, prepared.input),
  )

  if (rpcErr || !residenceId) return { error: rpcErr?.message ?? 'Errore creazione residenza' }

  revalidatePath('/admin/residences')
  redirect(`/admin/residences/${residenceId}/documenti?onboarding=1`)
}
