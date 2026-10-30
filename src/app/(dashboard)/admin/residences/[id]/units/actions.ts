'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { logActivityEvent } from '@/lib/activity-log'
import { unitHasNoActiveAccount, unitNotDelivered } from '@/lib/unit-utils'
import { requireCaller } from '@/lib/require-caller'
import { nextDueFrom } from '@/lib/maintenance-due'
import { planDeliveryRecalc, type DeliveryRecalcItem, type DeliveryRecalcSummary } from '@/lib/delivery-recalc'
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

// Codici d'errore della RPC (044/047, testati): l'esito si decide sul
// SQLSTATE, mai sul testo del messaggio. Ogni altro codice è un guasto
// tecnico, non un esito di dominio.
function createUnitErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'P0002': return 'Residenza non trovata.'
    case '42501': return 'Permessi insufficienti per aggiungere un\'unità.'
    default:      return 'Errore temporaneo nella creazione dell\'unità, riprova.'
  }
}

export async function createUnit(
  residenceId: string,
  label: string,
  floor: number | null
): Promise<{ error?: string; id?: string }> {
  const caller = await requireCaller('createUnit', ['super_admin'])
  if ('error' in caller) return { error: caller.error }

  // Il service client scavalca la RLS: senza questo controllo un super_admin
  // aggiungerebbe unità alla residenza di un altro costruttore.
  const denied = await requireResidenceAccess('createUnit', residenceId)
  if (denied) return denied

  const admin = createServiceClient()

  // Unità + maintenance_items scope='unit' in un'unica transazione:
  // qualsiasi errore → ROLLBACK totale, nessuna unità senza piano.
  const { data: unitId, error: rpcErr } = await admin.rpc('czero_add_unit_with_items', {
    p_residence_id: residenceId,
    p_label: label.trim(),
    p_floor: floor,
  })

  if (rpcErr) {
    console.error('createUnit: RPC czero_add_unit_with_items', { residenceId, rpcErr })
    return { error: createUnitErrorMessage(rpcErr.code) }
  }
  if (!unitId) {
    console.error('createUnit: RPC senza id e senza errore', { residenceId })
    return { error: createUnitErrorMessage(undefined) }
  }

  revalidatePath(`/admin/residences/${residenceId}/units`)
  return { id: unitId as string }
}

async function requireUnitsInResidence(
  action: string,
  residenceId: string,
  unitIds: string[]
): Promise<{ error: string } | { units: { id: string; delivery_date: string | null }[] }> {
  const denied = await requireResidenceAccess(action, residenceId)
  if (denied) return denied

  const wanted = [...new Set(unitIds)]
  const supabase = await createClient()
  const { data: units, error } = await supabase
    .from('units')
    .select('id, delivery_date')
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
  return { units: (units ?? []).map(u => ({ id: u.id as string, delivery_date: u.delivery_date as string | null })) }
}

const NOT_DELIVERED_INVITE_ERROR = 'Registra prima la consegna dell\'unità: l\'invito si genera solo per unità consegnate.'

/**
 * Invito per un'unità: se ne esiste già uno attivo (non usato, non scaduto)
 * restituisce quello, mai un secondo. L'unità deve essere consegnata.
 */
export async function createInvite(
  unitId: string,
  residenceId: string
): Promise<{ error?: string; token?: string; expiresAt?: string; existing?: boolean }> {
  const caller = await requireCaller('createInvite', ['super_admin'])
  if ('error' in caller) return { error: caller.error }

  const checked = await requireUnitsInResidence('createInvite', residenceId, [unitId])
  if ('error' in checked) return checked
  if (unitNotDelivered(checked.units[0]?.delivery_date ?? null)) return { error: NOT_DELIVERED_INVITE_ERROR }

  const admin = createServiceClient()

  const { data: active, error: activeError } = await admin
    .from('invites')
    .select('token, expires_at')
    .eq('unit_id', unitId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (activeError) {
    console.error('createInvite: errore lettura inviti attivi', { unitId, activeError })
    return { error: 'Errore temporaneo nella verifica degli inviti esistenti, riprova.' }
  }
  if (active) return { token: active.token as string, expiresAt: active.expires_at as string, existing: true }

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
  return { token: invite.token, expiresAt: expiresAt.toISOString(), existing: false }
}

export async function createBulkInvites(
  unitIds: string[],
  residenceId: string
): Promise<{ count: number; skipped: number; notDelivered: number; error?: string }> {
  if (unitIds.length === 0) return { count: 0, skipped: 0, notDelivered: 0 }

  const caller = await requireCaller('createBulkInvites', ['super_admin'])
  if ('error' in caller) return { count: 0, skipped: 0, notDelivered: 0, error: caller.error }

  const checked = await requireUnitsInResidence('createBulkInvites', residenceId, unitIds)
  if ('error' in checked) return { count: 0, skipped: 0, notDelivered: 0, error: checked.error }

  // Consegna prima dell'invito: le unità non consegnate si saltano qui,
  // qualunque cosa abbia filtrato il chiamante, e si contano a parte.
  const notDeliveredIds = new Set(checked.units.filter(u => unitNotDelivered(u.delivery_date)).map(u => u.id))
  const notDelivered = unitIds.filter(id => notDeliveredIds.has(id)).length

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
    return { count: 0, skipped: 0, notDelivered: 0, error: 'Errore temporaneo nella verifica degli inviti esistenti, riprova.' }
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
    return { count: 0, skipped: 0, notDelivered: 0, error: 'Errore temporaneo nella verifica degli account esistenti, riprova.' }
  }

  const membersByUnit = new Map<string, { ended_at: string | null }[]>()
  for (const row of memberRows ?? []) {
    const list = membersByUnit.get(row.unit_id as string) ?? []
    list.push({ ended_at: row.ended_at as string | null })
    membersByUnit.set(row.unit_id as string, list)
  }

  const toInvite = unitIds.filter(id =>
    !notDeliveredIds.has(id) && !alreadyInvited.has(id) && unitHasNoActiveAccount(membersByUnit.get(id) ?? [])
  )

  if (toInvite.length === 0) return { count: 0, skipped: unitIds.length, notDelivered }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  const rows = toInvite.map(unitId => ({
    unit_id: unitId,
    residence_id: residenceId,
    role: 'client',
    expires_at: expiresAt.toISOString(),
  }))

  const { error } = await admin.from('invites').insert(rows)
  if (error) return { count: 0, skipped: unitIds.length - toInvite.length, notDelivered, error: error.message }

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
  return { count: toInvite.length, skipped: unitIds.length - toInvite.length, notDelivered }
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

// Codici d'errore della RPC (045, conflitto dalla 046, testati): l'esito si
// decide sul SQLSTATE, mai sul testo del messaggio. Ogni altro codice è un
// guasto tecnico, non un esito di dominio, e il messaggio lo dice.
// Il conflitto è PT409, mai 40001: PostgREST ritenta 40001 all'infinito e la
// richiesta non torna più (046_register_delivery_pt409.sql).
function registerDeliveryErrorMessage(code: string | undefined): string {
  switch (code) {
    case '42501': return 'Permessi insufficienti per registrare la consegna.'
    case 'P0002': return 'Unità non trovata.'
    case 'PT409': return 'La data è stata cambiata da qualcun altro: ricarica la pagina.'
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

export type DeliveryPreviewItem = DeliveryRecalcItem & {
  title: string
  /** next_due_date attuale, per mostrare vecchia → nuova scadenza. */
  currentDueDate: string | null
}

/** Ingresso di planDeliveryRecalc letto dal DB, più i campi per l'anteprima. */
export type DeliveryPreview = {
  residenceId: string
  /** units.delivery_date attuale: è l'`expectedOldDate` di registerDelivery. */
  deliveryDate: string | null
  items: DeliveryPreviewItem[]
  categoryDates: { category: string; deliveryDate: string }[]
  today: string
}

// Unica lettura dell'ingresso del ricalcolo: la usano sia l'anteprima della
// modale sia registerDelivery, così le due non possono divergere nel select o
// nella mappatura riga → DeliveryRecalcItem. Client di SESSIONE: la RLS del
// super_admin è il perimetro (un'unità di un altro costruttore è "non trovata").
async function loadDeliveryPreview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  action: string,
  unitId: string,
): Promise<{ error: string } | { preview: DeliveryPreview }> {
  const { data: unit, error: unitError } = await supabase
    .from('units')
    .select('id, residence_id, delivery_date')
    .eq('id', unitId)
    .maybeSingle()
  if (unitError) {
    console.error(`${action}: errore lettura unità`, { unitId, unitError })
    return { error: 'Errore temporaneo nella lettura dell\'unità, riprova.' }
  }
  if (!unit) return { error: 'Unità non trovata.' }

  // completions(count) e non la lista dei completamenti: un conteggio non
  // incontra il limite di righe per richiesta di PostgREST.
  const [itemsRes, categoryRes] = await Promise.all([
    supabase
      .from('maintenance_items')
      .select(`id, frequency_months, due_basis_override, ${LIVE_STATUS_FIELDS}, maintenance_templates!inner(${LIVE_STATUS_TEMPLATE_FIELDS}, frequency_months, category, title), completions(count)`)
      .eq('unit_id', unitId),
    supabase
      .from('residence_category_dates')
      .select('category, delivery_date')
      .eq('residence_id', unit.residence_id),
  ])
  if (itemsRes.error) {
    console.error(`${action}: errore lettura voci`, { unitId, error: itemsRes.error })
    return { error: 'Errore temporaneo nella lettura delle voci, riprova.' }
  }
  if (categoryRes.error) {
    console.error(`${action}: errore lettura date di categoria`, { unitId, error: categoryRes.error })
    return { error: 'Errore temporaneo nella lettura delle date di categoria, riprova.' }
  }

  const items = (itemsRes.data ?? []).map((row): DeliveryPreviewItem => {
    const template = normalizeEmbed<{
      completion_mode: CompletionMode | null
      is_active: boolean
      frequency_months: number | null
      category: string
      title: string
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
      title: template?.title ?? '',
      currentDueDate: row.next_due_date as string | null,
    }
  })

  return {
    preview: {
      residenceId: unit.residence_id as string,
      deliveryDate: unit.delivery_date as string | null,
      items,
      categoryDates: (categoryRes.data ?? []).map(c => ({
        category: c.category as string,
        deliveryDate: c.delivery_date as string,
      })),
      today: todayISO(),
    },
  }
}

/**
 * Sola lettura: l'ingresso del ricalcolo per l'anteprima della modale
 * "Registra consegna". Il piano lo calcola il client con planDeliveryRecalc;
 * al salvataggio registerDelivery lo ricalcola su dati freschi.
 */
export async function getDeliveryPreview(
  unitId: string,
): Promise<{ error?: string; preview?: DeliveryPreview }> {
  const caller = await requireCaller('getDeliveryPreview', ['super_admin'])
  if ('error' in caller) return { error: caller.error }

  const supabase = await createClient()
  const res = await loadDeliveryPreview(supabase, 'getDeliveryPreview', unitId)
  if ('error' in res) return { error: res.error }
  return { preview: res.preview }
}

export type DeliveryPreviewResult = { unitId: string } & ({ error: string } | { preview: DeliveryPreview })

/**
 * Sola lettura: l'ingresso del ricalcolo per più unità della stessa
 * residenza, per l'anteprima della consegna multipla. Una lettura per unità
 * con lo stesso loader della modale singola (niente select su tutte le voci
 * della residenza: resterebbe sotto il limite di righe di PostgREST solo per
 * caso). L'errore di un'unità non ferma le altre: torna nella sua riga.
 */
export async function getDeliveryPreviews(
  unitIds: string[],
  residenceId: string,
): Promise<{ error?: string; results?: DeliveryPreviewResult[] }> {
  const caller = await requireCaller('getDeliveryPreviews', ['super_admin'])
  if ('error' in caller) return { error: caller.error }

  if (unitIds.length === 0) return { results: [] }
  const scope = await requireUnitsInResidence('getDeliveryPreviews', residenceId, unitIds)
  if ('error' in scope) return { error: scope.error }

  const supabase = await createClient()
  const wanted = [...new Set(unitIds)]
  // Solo letture: in parallelo. Le scritture (registerDelivery) restano una
  // chiamata per unità, in serie, decise dal client.
  const results = await Promise.all(wanted.map(async (unitId): Promise<DeliveryPreviewResult> => {
    const res = await loadDeliveryPreview(supabase, 'getDeliveryPreviews', unitId)
    return 'error' in res ? { unitId, error: res.error } : { unitId, preview: res.preview }
  }))
  return { results }
}

/**
 * Registra (o rimuove, con `newDate` null) la data di consegna di un'unità.
 *
 * `expectedOldDate` è la data che l'utente ha visto nell'anteprima: la RPC la
 * confronta con quella in DB sotto lock e, se diverge, non scrive niente
 * (PT409). Il piano invece si ricalcola qui su dati freschi: ciò che si scrive
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
): Promise<{ error?: string; riepilogo?: DeliveryRecalcSummary; revokedInvites?: number; revokeError?: string }> {
  const caller = await requireCaller('registerDelivery', ['super_admin'])
  if ('error' in caller) return { error: caller.error }

  const nuova = normalizeDeliveryDate(newDate)
  const attesa = normalizeDeliveryDate(expectedOldDate)
  if (nuova === undefined || attesa === undefined) return { error: 'Data di consegna non valida.' }
  if (nuova === attesa) return { error: 'La data di consegna è già questa: nessuna modifica.' }

  const supabase = await createClient()

  const loaded = await loadDeliveryPreview(supabase, 'registerDelivery', unitId)
  if ('error' in loaded) return { error: loaded.error }
  const source = loaded.preview

  let plan
  try {
    plan = planDeliveryRecalc({
      unitDeliveryDate: nuova,
      items: source.items,
      categoryDates: source.categoryDates,
      today: source.today,
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

  // Regola: un'unità non consegnata non ha inviti attivi. Dopo la rimozione
  // della consegna si revocano (DELETE, come revokeInvite) gli inviti non usati
  // e non scaduti; quelli usati restano, e un residente già attivo non si
  // tocca. Service client come revokeInvite: il perimetro l'ha già provato la
  // RPC, che con il client di sessione ha trovato e scritto l'unità.
  let revokedInvites = 0
  let revokeError: string | undefined
  if (nuova === null) {
    const { data: revoked, error: delError } = await createServiceClient()
      .from('invites')
      .delete()
      .eq('unit_id', unitId)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('id')
    if (delError) {
      console.error('registerDelivery: revoca inviti attivi', { unitId, delError })
      revokeError = `Consegna rimossa, ma gli inviti non sono stati revocati: ${delError.message}`
    } else {
      revokedInvites = (revoked ?? []).length
    }
  }

  revalidatePath(`/admin/residences/${source.residenceId}/units`)
  revalidatePath(`/admin/residences/${source.residenceId}/manutenzioni`)
  return { riepilogo: plan.riepilogo, revokedInvites, revokeError }
}
