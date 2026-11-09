// Validazione e preparazione dell'input per la creazione di una residenza.
//
// FONTE UNICA delle regole di merito applicate prima di chiamare la RPC
// czero_create_residence_with_units. Prima vivevano dentro la server action
// createResidence, legate a FormData; ora la action è un adattatore (legge il
// FormData e passa qui valori grezzi) e chiunque altro costruisca una residenza
// — la bozza da documento — passa dalla STESSA funzione, quindi dalle stesse
// regole e dagli stessi messaggi. Nessun secondo percorso di validazione.
//
// Modulo puro: niente I/O, niente FormData, niente Supabase. L'autenticazione
// e il builder restano alla action.

import { RESIDENCE_FEATURES, type FeatureKey } from './residence-features'

export const MAX_UNITS = 200

export type ResidenceUnitInput = { label: string; floor: number }

// Valori grezzi, come arrivano dal chiamante: nessuna ipotesi sul tipo.
// `unitsDeliveryDate` è null/undefined quando il campo è ASSENTE (unità non
// consegnate) ed è una stringa (anche vuota) quando il campo esiste.
// `categoryDates` è indicizzato per nome categoria, senza prefisso del form.
// `features` ha SEMPRE tutte le chiavi: un "no" è una risposta dichiarata.
export type ResidenceInputRaw = {
  name: unknown
  address: unknown
  energyClass: unknown
  deliveryDate: unknown
  unitsDeliveryDate: unknown
  units: unknown
  categoryDates: Record<string, unknown>
  features: Record<FeatureKey, boolean>
}

export type ResidenceInput = {
  name: string
  address: string
  energyClass: string | null
  deliveryDate: string
  unitsDeliveryDate: string | null
  units: ResidenceUnitInput[]
  categoryDates: Record<string, string>
  features: Record<FeatureKey, boolean>
}

export type ResidenceInputResult = { input: ResidenceInput } | { error: string }

function trimmedString(v: unknown): string | undefined {
  return typeof v === 'string' ? v.trim() : undefined
}

export function prepareResidenceInput(raw: ResidenceInputRaw): ResidenceInputResult {
  const name = trimmedString(raw.name)
  const address = trimmedString(raw.address) || null
  const energyClass = trimmedString(raw.energyClass) || null
  const deliveryDate = raw.deliveryDate as string | null | undefined

  if (!name || !address || !deliveryDate) return { error: 'Nome, indirizzo e data di consegna obbligatori' }

  // Opzione "Unità già consegnate tutte il <data>" (edificio esistente): campo
  // assente = unità non consegnate, p_units_delivery_date NULL (044). Formato
  // controllato qui perché un valore malformato arriverebbe alla RPC come
  // errore di cast generico.
  const unitsDeliveryRaw = raw.unitsDeliveryDate ?? null
  const unitsDeliveryDate = typeof unitsDeliveryRaw === 'string' && unitsDeliveryRaw.trim()
    ? unitsDeliveryRaw.trim()
    : null
  if (unitsDeliveryRaw !== null && !unitsDeliveryDate) return { error: 'Indica la data di consegna delle unità' }
  if (unitsDeliveryDate && !/^\d{4}-\d{2}-\d{2}$/.test(unitsDeliveryDate)) {
    return { error: 'Data di consegna delle unità non valida' }
  }

  // Stringa JSON (hidden field del wizard) o null se assente → parseUnitsJson;
  // array già parsato (chi non passa da FormData) → validateUnits.
  const unitsResult = Array.isArray(raw.units) ? validateUnits(raw.units) : parseUnitsJson(raw.units)
  if ('error' in unitsResult) return { error: unitsResult.error }

  // La RPC le salva in residence_category_dates (044), solo le categorie esistenti.
  const categoryDates: Record<string, string> = {}
  for (const [category, value] of Object.entries(raw.categoryDates)) {
    if (typeof value === 'string' && value.trim()) categoryDates[category] = value.trim()
  }

  // Si itera la COSTANTE, mai le chiavi dell'input: derivare l'oggetto
  // dall'input significa che una chiave mancante o rinominata passa in
  // silenzio e la dotazione sparisce dal piano (la classe di bug per cui
  // RESIDENCE_FEATURES esiste). Qui una risposta mancante o non booleana è
  // un errore, mai un "no" implicito.
  const features = {} as Record<FeatureKey, boolean>
  for (const f of RESIDENCE_FEATURES) {
    const answer = raw.features[f.key]
    if (typeof answer !== 'boolean') return { error: 'Dotazioni incomplete' }
    features[f.key] = answer
  }

  return {
    input: {
      name,
      address,
      energyClass,
      deliveryDate,
      unitsDeliveryDate,
      units: unitsResult.units,
      categoryDates,
      features,
    },
  }
}

// Parametri della RPC. Vivono qui perché sono il contratto con la 044: i nomi
// p_* scritti in un solo posto.
export function residenceRpcParams(builderId: string, input: ResidenceInput) {
  return {
    p_builder_id: builderId,
    p_name: input.name,
    p_address: input.address,
    p_energy_class: input.energyClass,
    p_delivery_date: input.deliveryDate,
    p_units: input.units,
    p_category_dates: input.categoryDates,
    p_features: input.features,
    p_units_delivery_date: input.unitsDeliveryDate,
  }
}

// Per chi riceve le unità come stringa JSON (hidden field del wizard,
// manipolabile dai DevTools).
export function parseUnitsJson(raw: unknown): ResidenceUnitsResult {
  if (typeof raw !== 'string') return { error: 'Dati unità mancanti' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { error: 'Dati unità non validi' }
  }
  return validateUnits(parsed)
}

export type ResidenceUnitsResult = { units: ResidenceUnitInput[] } | { error: string }

// Prima la shape (array di {label: string, floor: number}), poi le regole di
// merito del client: ≥1 unità, label non vuote e uniche senza distinzione di
// maiuscole, floor intero ≥ 0.
export function validateUnits(parsed: unknown): ResidenceUnitsResult {
  if (!Array.isArray(parsed)) return { error: 'Dati unità non validi' }
  if (parsed.length === 0) return { error: 'Serve almeno una unità' }
  if (parsed.length > MAX_UNITS) return { error: `Massimo ${MAX_UNITS} unità per residenza` }

  const units: ResidenceUnitInput[] = []
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

// Esito della lettura del profilo di chi crea la residenza. Un errore della
// query (permessi di DB, rete, credenziali d'ambiente) NON è "permessi
// insufficienti": è un fallimento tecnico, e collassarlo in un messaggio di
// dominio impedisce a chi guarda lo schermo di distinguere "non puoi" da "il
// server ha un problema". Solo l'assenza vera di una riga (data null, nessun
// error) o un ruolo diverso da super_admin sono esiti di dominio.
export const CREATOR_TECHNICAL_ERROR = 'Errore tecnico nel leggere il tuo profilo, riprova'

export function residenceCreatorGate(
  profile: { role?: string | null; builder_id?: string | null } | null | undefined,
  queryError: unknown,
): { builderId: string } | { error: string } {
  if (queryError) return { error: CREATOR_TECHNICAL_ERROR }
  if (profile?.role !== 'super_admin') return { error: 'Permessi insufficienti' }
  if (!profile.builder_id) return { error: 'Nessun builder associato al tuo account' }
  return { builderId: profile.builder_id }
}
