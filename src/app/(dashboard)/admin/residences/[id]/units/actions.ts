'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { logActivityEvent } from '@/lib/activity-log'
import { unitHasNoActiveAccount } from '@/lib/unit-utils'
import { requireCaller } from '@/lib/require-caller'
import { nextDueFrom } from '@/lib/maintenance-due'
import { planDeliveryRecalc, type DeliveryRecalcSummary } from '@/lib/delivery-recalc'
import {
  LIVE_STATUS_FIELDS, LIVE_STATUS_TEMPLATE_FIELDS,
  resolveCompletionMode, resolveFrequencyMonths, todayISO,
} from '@/lib/maintenance-status'
import { normalizeEmbed } from '@/lib/postgrest-embed'
import type { CompletionMode } from '@/types/database'

// Il perimetro lo decide la RLS su residences (czero_can_access_residence), non un confronto ricopiato qui.
async function requireResidenceAccess(action: string, residenceId: string): Promise<{ error: string } | null> {
  const supabase = await createClient()
  const { data: residence, error } = await supabase
    .from('residences')
    .select('id')
    .eq('id', residenceId)
    .maybeSingle()

  if (error) {
    console.error(`${action}: errore lettura residenza`, { residenceId, error })
    return { error: 'Errore temporaneo nella verifica della residenza, riprova.' }
  }
  if (!residence) {
    console.warn(`${action}: residenza fuori perimetro`, { residenceId })
    return { error: 'Residenza non trovata' }
  }
  return null
}

export async function createUnit(
  residenceId: string,
  label: string,
  floor: number | null
): Promise<{ error?: string; id?: string }> {
  const caller = await requireCaller('createUnit', ['super_admin'])
  if ('error' in caller) return { error: caller.error }

  const admin = createServiceClient()

  // Unità + maintenance_items scope='unit' in un'unica transazione:
  // qualsiasi errore → ROLLBACK totale, nessuna unità senza piano.
  const { data: unitId, error: rpcErr } = await admin.rpc('czero_add_unit_with_items', {
    p_residence_id: residenceId,
    p_label: label.trim(),
    p_floor: floor,
  })

  if (rpcErr || !unitId) return { error: rpcErr?.message ?? 'Errore creazione unità' }

  revalidatePath(`/admin/residences/${residenceId}/units`)
  return { id: unitId as string }
}

async function requireUnitsInResidence(
  action: string,
  residenceId: string,
  unitIds: string[]
): Promise<{ error: string } | null> {
  const denied = await requireResidenceAccess(action, residenceId)
  if (denied) return denied

  const wanted = [...new Set(unitIds)]
  const supabase = await createClient()
  const { data: units, error } = await supabase
    .from('units')
    .select('id')
    .eq('residence_id', residenceId)
    .in('id', wanted)

  if (error) {
    console.error(`${action}: errore lettura unità`, { residenceId, error })
    return { error: 'Errore temporaneo nella verifica delle unità, riprova.' }
  }
  if ((units ?? []).length !== wanted.length) {
    console.warn(`${action}: unità fuori residenza`, { residenceId, requested: wanted.length, found: units?.length ?? 0 })
    return { error: 'Unità non trovata in questa residenza' }
  }
  return null
}

export async function createInvite(
  unitId: string,
  residenceId: string
): Promise<{ error?: string; token?: string }> {
  const caller = await requireCaller('createInvite', ['super_admin'])
  if ('error' in caller) return { error: caller.error }

  const denied = await requireUnitsInResidence('createInvite', residenceId, [unitId])
  if (denied) return denied

  const admin = createServiceClient()

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  const { data: invite, error } = await admin
    .from('invites')
    .insert({
      unit_id: unitId,
      residence_id: residenceId,
      role: 'client',
      expires_at: expiresAt.toISOString(),
    })
    .select('id, token')
    .single()

  if (error || !invite) return { error: error?.message ?? 'Errore generazione invito' }

  // Atto di unità: unit_id valorizzato. Nel payload va l'id dell'invito, MAI
  // il token (è il segreto che apre l'accesso, il registro è leggibile dagli
  // admin). Nessuna email parte da qui: l'invito viene solo generato.
  await logActivityEvent(admin, {
    residenceId,
    unitId,
    eventType: 'invito_inviato',
    // Attore dalla sessione (requireCaller), mai da input: il service client
    // bypassa le policy INSERT della 037, l'antispoofing vive qui.
    actorId: caller.userId,
    actorRole: caller.role,
    actorName: caller.fullName,
    payload: {
      invite_id: invite.id as string,
      role: 'client',
      count: 1,
      expires_at: expiresAt.toISOString(),
    },
  })

  revalidatePath(`/admin/residences/${residenceId}/units`)
  return { token: invite.token }
}

export async function createBulkInvites(
  unitIds: string[],
  residenceId: string
): Promise<{ count: number; skipped: number; error?: string }> {
  if (unitIds.length === 0) return { count: 0, skipped: 0 }

  const caller = await requireCaller('createBulkInvites', ['super_admin'])
  if ('error' in caller) return { count: 0, skipped: 0, error: caller.error }

  const denied = await requireUnitsInResidence('createBulkInvites', residenceId, unitIds)
  if (denied) return { count: 0, skipped: 0, error: denied.error }

  const admin = createServiceClient()
  const now = new Date().toISOString()

  // Idempotency: skip units that already have an active invite
  const { data: existing, error: existingError } = await admin
    .from('invites')
    .select('unit_id')
    .in('unit_id', unitIds)
    .is('used_at', null)
    .gt('expires_at', now)

  if (existingError) {
    console.error('createBulkInvites: errore lettura inviti esistenti', { residenceId, existingError })
    return { count: 0, skipped: 0, error: 'Errore temporaneo nella verifica degli inviti esistenti, riprova.' }
  }

  const alreadyInvited = new Set((existing ?? []).map(i => i.unit_id as string))

  // Safety net: solo unità senza account cliente attivo, indipendentemente da cosa
  // ha già filtrato il chiamante (stesso helper condiviso usato lato client).
  const { data: memberRows, error: memberError } = await admin
    .from('unit_members')
    .select('unit_id, ended_at')
    .in('unit_id', unitIds)

  if (memberError) {
    console.error('createBulkInvites: errore lettura membri unità', { residenceId, memberError })
    return { count: 0, skipped: 0, error: 'Errore temporaneo nella verifica degli account esistenti, riprova.' }
  }

  const membersByUnit = new Map<string, { ended_at: string | null }[]>()
  for (const row of memberRows ?? []) {
    const list = membersByUnit.get(row.unit_id as string) ?? []
    list.push({ ended_at: row.ended_at as string | null })
    membersByUnit.set(row.unit_id as string, list)
  }

  const toInvite = unitIds.filter(id =>
    !alreadyInvited.has(id) && unitHasNoActiveAccount(membersByUnit.get(id) ?? [])
  )

  if (toInvite.length === 0) return { count: 0, skipped: unitIds.length }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  const rows = toInvite.map(unitId => ({
    unit_id: unitId,
    residence_id: residenceId,
    role: 'client',
    expires_at: expiresAt.toISOString(),
  }))

  const { error } = await admin.from('invites').insert(rows)
  if (error) return { count: 0, skipped: unitIds.length - toInvite.length, error: error.message }

  // Una riga per ATTO, non per invito (037_activity_events.sql:48-52, stessa
  // regola dell'archiviazione): unit_id null perché l'atto attraversa più
  // unità, `count` e `unit_ids` nel payload. L'insert è unico e atomico,
  // quindi `count` è il numero di inviti creati davvero, non richiesti; la
  // riga si scrive solo dopo il successo. Niente token nel payload.
  await logActivityEvent(admin, {
    residenceId,
    unitId: null,
    eventType: 'invito_inviato',
    // Attore dalla sessione (requireCaller), mai da input: il service client
    // bypassa le policy INSERT della 037, l'antispoofing vive qui.
    actorId: caller.userId,
    actorRole: caller.role,
    actorName: caller.fullName,
    payload: {
      role: 'client',
      count: toInvite.length,
      unit_ids: toInvite,
      skipped: unitIds.length - toInvite.length,
      expires_at: expiresAt.toISOString(),
    },
  })

  revalidatePath(`/admin/residences/${residenceId}/units`)
  return { count: toInvite.length, skipped: unitIds.length - toInvite.length }
}

export async function updateUnitLabel(
  unitId: string,
  label: string,
  residenceId: string
): Promise<{ error?: string }> {
  const caller = await requireCaller('updateUnitLabel', ['super_admin'])
  if ('error' in caller) return { error: caller.error }

  const trimmed = label.trim()
  if (!trimmed) return { error: 'L\'etichetta non può essere vuota' }
  if (trimmed.length > 60) return { error: 'Etichetta troppo lunga (max 60 caratteri)' }

  const admin = createServiceClient()
  const { error } = await admin.from('units').update({ label: trimmed }).eq('id', unitId)
  if (error) return { error: error.message }

  revalidatePath(`/admin/residences/${residenceId}/units`)
  return {}
}

export async function revokeInvite(inviteId: string, residenceId: string): Promise<{ error?: string }> {
  const caller = await requireCaller('revokeInvite', ['super_admin'])
  if ('error' in caller) return { error: caller.error }

  const denied = await requireResidenceAccess('revokeInvite', residenceId)
  if (denied) return denied

  const admin = createServiceClient()
  const { data: invite, error: readError } = await admin
    .from('invites')
    .select('id, residence_id, units(residence_id)')
    .eq('id', inviteId)
    .maybeSingle()

  if (readError) {
    console.error('revokeInvite: errore lettura invito', { inviteId, readError })
    return { error: 'Errore temporaneo nella lettura dell\'invito, riprova.' }
  }

  const unitResidenceId = (invite?.units as unknown as { residence_id: string } | null)?.residence_id ?? null
  if (!invite || (invite.residence_id ?? unitResidenceId) !== residenceId) {
    return { error: 'Invito non trovato' }
  }

  const { error } = await admin.from('invites').delete().eq('id', inviteId)
  if (error) return { error: error.message }

  revalidatePath(`/admin/residences/${residenceId}/units`)
  return {}
}

// Codici d'errore della RPC (045, testata): l'esito si decide sul SQLSTATE,
// mai sul testo del messaggio. Ogni altro codice è un guasto tecnico, non un
// esito di dominio, e il messaggio lo dice.
function registerDeliveryErrorMessage(code: string | undefined): string {
  switch (code) {
    case '42501': return 'Permessi insufficienti per registrare la consegna.'
    case 'P0002': return 'Unità non trovata.'
    case '40001': return 'La data è stata cambiata da qualcun altro: ricarica la pagina.'
    case '22023': return 'Piano di ricalcolo non valido: ricarica la pagina e riprova.'
    default:      return 'Errore temporaneo nella registrazione della consegna, riprova.'
  }
}

/** ISO 'YYYY-MM-DD' validata, o null; undefined = data malformata. */
function normalizeDeliveryDate(value: string | null): string | null | undefined {
  if (value === null) return null
  try {
    // nextDueFrom(x, 0) è la validazione della data già esistente: nessun parser nuovo.
    return nextDueFrom(value, 0)
  } catch {
    return undefined
  }
}

/**
 * Registra (o rimuove, con `newDate` null) la data di consegna di un'unità.
 *
 * `expectedOldDate` è la data che l'utente ha visto nell'anteprima: la RPC la
 * confronta con quella in DB sotto lock e, se diverge, non scrive niente
 * (40001). Il piano invece si ricalcola qui su dati freschi: ciò che si scrive
 * corrisponde al DB di adesso, non a quello dell'anteprima.
 *
 * Tutte le letture e la RPC passano dal client di SESSIONE, non dal service
 * client: la RPC è SECURITY INVOKER e riconosce l'attore da auth.uid(), e la
 * RLS del super_admin è il perimetro (un'unità di un altro costruttore
 * risulta "non trovata").
 */
export async function registerDelivery(
  unitId: string,
  expectedOldDate: string | null,
  newDate: string | null,
): Promise<{ error?: string; riepilogo?: DeliveryRecalcSummary }> {
  const caller = await requireCaller('registerDelivery', ['super_admin'])
  if ('error' in caller) return { error: caller.error }

  const nuova = normalizeDeliveryDate(newDate)
  const attesa = normalizeDeliveryDate(expectedOldDate)
  if (nuova === undefined || attesa === undefined) return { error: 'Data di consegna non valida.' }
  if (nuova === attesa) return { error: 'La data di consegna è già questa: nessuna modifica.' }

  const supabase = await createClient()

  const { data: unit, error: unitError } = await supabase
    .from('units')
    .select('id, residence_id')
    .eq('id', unitId)
    .maybeSingle()
  if (unitError) {
    console.error('registerDelivery: errore lettura unità', { unitId, unitError })
    return { error: 'Errore temporaneo nella lettura dell\'unità, riprova.' }
  }
  if (!unit) return { error: 'Unità non trovata.' }

  // completions(count) e non la lista dei completamenti: un conteggio non
  // incontra il limite di righe per richiesta di PostgREST.
  const [itemsRes, categoryRes] = await Promise.all([
    supabase
      .from('maintenance_items')
      .select(`id, frequency_months, due_basis_override, ${LIVE_STATUS_FIELDS}, maintenance_templates!inner(${LIVE_STATUS_TEMPLATE_FIELDS}, frequency_months, category), completions(count)`)
      .eq('unit_id', unitId),
    supabase
      .from('residence_category_dates')
      .select('category, delivery_date')
      .eq('residence_id', unit.residence_id),
  ])
  if (itemsRes.error) {
    console.error('registerDelivery: errore lettura voci', { unitId, error: itemsRes.error })
    return { error: 'Errore temporaneo nella lettura delle voci, riprova.' }
  }
  if (categoryRes.error) {
    console.error('registerDelivery: errore lettura date di categoria', { unitId, error: categoryRes.error })
    return { error: 'Errore temporaneo nella lettura delle date di categoria, riprova.' }
  }

  const items = (itemsRes.data ?? []).map(row => {
    const template = normalizeEmbed<{
      completion_mode: CompletionMode | null
      is_active: boolean
      frequency_months: number | null
      category: string
    }>(row.maintenance_templates)
    const resolvable = { ...row, maintenance_templates: template }
    return {
      id: row.id as string,
      frequencyMonths: resolveFrequencyMonths(resolvable),
      completionMode: resolveCompletionMode(resolvable),
      activationStatus: row.activation_status,
      dueBasisOverride: row.due_basis_override as string | null,
      category: template?.category ?? '',
      hasCompletions: (normalizeEmbed<{ count: number }>(row.completions)?.count ?? 0) > 0,
    }
  })

  let plan
  try {
    plan = planDeliveryRecalc({
      unitDeliveryDate: nuova,
      items,
      categoryDates: (categoryRes.data ?? []).map(c => ({
        category: c.category as string,
        deliveryDate: c.delivery_date as string,
      })),
      today: todayISO(),
    })
  } catch (err) {
    // Dato corrotto (frequenza mancante, data malformata, categoria doppia):
    // non è un errore transitorio, riprovare non cambia l'esito.
    console.error('registerDelivery: piano non calcolabile', { unitId, err })
    return { error: 'Dati del piano non coerenti per questa unità: nessuna modifica salvata.' }
  }

  const { error: rpcError } = await supabase.rpc('czero_register_delivery', {
    p_unit_id: unitId,
    p_old_date: attesa,
    p_new_date: nuova,
    p_plan: plan.voci
      .filter(v => v.esito === 'ricalcola')
      .map(v => ({ item_id: v.item_id, nuova_data: v.nuova_data })),
  })
  if (rpcError) {
    console.error('registerDelivery: RPC czero_register_delivery', { unitId, rpcError })
    return { error: registerDeliveryErrorMessage(rpcError.code) }
  }

  revalidatePath(`/admin/residences/${unit.residence_id}/units`)
  revalidatePath(`/admin/residences/${unit.residence_id}/manutenzioni`)
  return { riepilogo: plan.riepilogo }
}
