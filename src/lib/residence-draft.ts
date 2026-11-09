// Bozza di residenza proposta dall'AI a partire da un documento.
//
// Modulo puro: niente I/O, niente rete, niente Supabase. Vive tra la route AI
// (che produce una proposta grezza) e la creazione (che passa SEMPRE da
// prepareResidenceInput, quindi dalla stessa validazione del wizard manuale).
//
// REGOLA CENTRALE — "non trovato" non diventa mai "no" in silenzio.
// Ogni campo proposto ha uno di tre stati espliciti (FieldState):
//   · dal_documento  valore + confidenza alta + citazione: proposta solida
//   · da_verificare  valore presente ma confidenza non alta o citazione
//                    assente: l'umano deve guardarlo
//   · non_trovato    il documento non lo dice: NESSUN valore
// Per le dotazioni un "non trovato" resta senza risposta finché l'umano non
// risponde sì o no (resolveFeatures lo lascia in `unresolved`, e
// prepareDraftCreation rifiuta di creare). L'unica strada verso un "no" è un
// gesto esplicito: markUnresolvedAsNo, il bottone "Segna le rimanenti come No".
// Il silenzio del documento non vale mai "no": una dotazione assente dalla
// proposta, o con valore null, è non_trovato; un "no" dell'AI senza
// citazione non è mai dal_documento.
//
// Cosa NON è estraibile e non entra mai da qui: la data di consegna (al più un
// suggerimento da_verificare che non viene mai usato per la creazione), la
// data di consegna delle unità, le date per categoria.

import { RESIDENCE_FEATURES, type FeatureKey } from './residence-features'
import { pluralize } from './pluralize'
import {
  prepareResidenceInput,
  type ResidenceInput,
  type ResidenceInputRaw,
} from './residence-input'

// ── Stati e campi ─────────────────────────────────────────────────────────

export type FieldState = 'dal_documento' | 'da_verificare' | 'non_trovato'
export type Confidence = 'alta' | 'media' | 'bassa'

export const FIELD_STATE_LABEL: Record<FieldState, string> = {
  dal_documento: 'Dal documento',
  da_verificare: 'Da verificare',
  non_trovato: 'Non trovato',
}

// Unione discriminata: un campo non_trovato NON HA valore (value: null), così
// non esiste un percorso di tipo che lo tratti come un valore.
export type DraftField<T> =
  | { state: 'dal_documento'; value: T; confidence: 'alta'; citation: string }
  | { state: 'da_verificare'; value: T; confidence: Confidence | null; citation: string | null }
  | { state: 'non_trovato'; value: null; confidence: null; citation: null }

const NOT_FOUND: DraftField<never> = { state: 'non_trovato', value: null, confidence: null, citation: null }

export type DraftUnit = { label: string; floor: number | null }

export type ResidenceDraft = {
  name: DraftField<string>
  address: DraftField<string>
  energyClass: DraftField<string>
  // Numero di unità DICHIARATO nel documento (es. "n. 15 alloggi").
  declaredUnitCount: DraftField<number>
  units: DraftField<DraftUnit>[]
  // Suggerimento (data dell'agibilità): mai dal_documento, mai usato per creare.
  deliveryDateSuggestion: DraftField<string>
  features: Record<FeatureKey, DraftField<boolean>>
}

// ── Schema AI (consumato dalla route) ─────────────────────────────────────
// Forma grezza prodotta dal modello: { valore, confidenza, citazione } per
// campo. `valore: null` significa "il documento non lo dice".

const FIELD_STRING = {
  type: 'object',
  additionalProperties: false,
  required: ['valore', 'confidenza', 'citazione'],
  properties: {
    valore: { type: ['string', 'null'] },
    confidenza: { type: ['string', 'null'], enum: ['alta', 'media', 'bassa', null] },
    citazione: { type: ['string', 'null'] },
  },
} as const
const FIELD_NUMBER = {
  ...FIELD_STRING,
  properties: { ...FIELD_STRING.properties, valore: { type: ['number', 'null'] } },
} as const
const FIELD_BOOLEAN = {
  ...FIELD_STRING,
  properties: { ...FIELD_STRING.properties, valore: { type: ['boolean', 'null'] } },
} as const

export const DRAFT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['nome', 'indirizzo', 'classe_energetica', 'unita_dichiarate', 'data_agibilita', 'unita', 'dotazioni'],
  properties: {
    nome: FIELD_STRING,
    indirizzo: FIELD_STRING,
    classe_energetica: FIELD_STRING,
    unita_dichiarate: FIELD_NUMBER,
    data_agibilita: FIELD_STRING,
    unita: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['etichetta', 'scala', 'piano', 'confidenza', 'citazione'],
        properties: {
          etichetta: { type: 'string' },
          scala: { type: ['string', 'null'] },
          piano: { type: ['number', 'null'] },
          confidenza: { type: ['string', 'null'], enum: ['alta', 'media', 'bassa', null] },
          citazione: { type: ['string', 'null'] },
        },
      },
    },
    // Una chiave per dotazione, tutte obbligatorie: l'AI deve rispondere per
    // ognuna, con valore null quando il documento non ne parla.
    dotazioni: {
      type: 'object',
      additionalProperties: false,
      required: RESIDENCE_FEATURES.map(f => f.key),
      properties: Object.fromEntries(RESIDENCE_FEATURES.map(f => [f.key, FIELD_BOOLEAN])),
    },
  },
} as const

// ── Normalizzazione (type guard a mano, zod non è installato) ─────────────

const CONFIDENCES: readonly string[] = ['alta', 'media', 'bassa']

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function confidenceOf(v: unknown): Confidence | null {
  return typeof v === 'string' && CONFIDENCES.includes(v) ? (v as Confidence) : null
}
function citationOf(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

// Costruisce un campo dal valore già controllato. Regola dei tre stati:
// valore assente → non_trovato; valore + confidenza alta + citazione →
// dal_documento; ogni altro caso con valore → da_verificare.
function makeField<T>(value: T | null, confidenceRaw: unknown, citationRaw: unknown, cap: 'none' | 'verify' = 'none'): DraftField<T> {
  if (value === null) return NOT_FOUND
  const confidence = confidenceOf(confidenceRaw)
  const citation = citationOf(citationRaw)
  if (cap === 'none' && confidence === 'alta' && citation) {
    return { state: 'dal_documento', value, confidence, citation }
  }
  return { state: 'da_verificare', value, confidence, citation }
}

function stringField(raw: unknown, cap: 'none' | 'verify' = 'none'): DraftField<string> {
  if (!isRecord(raw)) return NOT_FOUND
  const v = typeof raw.valore === 'string' && raw.valore.trim() ? raw.valore.trim() : null
  return makeField(v, raw.confidenza, raw.citazione, cap)
}
function numberField(raw: unknown): DraftField<number> {
  if (!isRecord(raw)) return NOT_FOUND
  const v = typeof raw.valore === 'number' && Number.isFinite(raw.valore) ? raw.valore : null
  return makeField(v, raw.confidenza, raw.citazione)
}
function booleanField(raw: unknown): DraftField<boolean> {
  if (!isRecord(raw)) return NOT_FOUND
  const v = typeof raw.valore === 'boolean' ? raw.valore : null
  return makeField(v, raw.confidenza, raw.citazione)
}

// "Scala A – Int. 3": la scala sta nell'etichetta (decisione 2 del 7/11),
// nessuna colonna nuova. Se l'etichetta la contiene già non si ripete.
export function unitLabelWithStaircase(label: string, staircase: string | null): string {
  const l = label.trim()
  const s = staircase?.trim()
  if (!s) return l
  const prefix = /^scala\s/i.test(s) ? s : `Scala ${s}`
  if (l.toLowerCase().startsWith(prefix.toLowerCase())) return l
  return `${prefix} – ${l}`
}

export function normalizeDraftProposal(raw: unknown): { draft: ResidenceDraft } | { error: string } {
  if (!isRecord(raw)) return { error: 'Proposta non valida' }
  if (!Array.isArray(raw.unita)) return { error: 'Proposta non valida: elenco unità mancante' }
  if (!isRecord(raw.dotazioni)) return { error: 'Proposta non valida: dotazioni mancanti' }

  const units: DraftField<DraftUnit>[] = []
  for (const u of raw.unita) {
    if (!isRecord(u) || typeof u.etichetta !== 'string' || !u.etichetta.trim()) continue
    const scala = typeof u.scala === 'string' ? u.scala : null
    const floor = typeof u.piano === 'number' && Number.isInteger(u.piano) && u.piano >= 0 ? u.piano : null
    const label = unitLabelWithStaircase(u.etichetta, scala)
    // Un piano che il documento non dà rende l'unità da verificare, mai solida.
    const f = makeField<DraftUnit>({ label, floor }, u.confidenza, u.citazione)
    units.push(f.state === 'dal_documento' && floor === null
      ? { state: 'da_verificare', value: f.value, confidence: f.confidence, citation: f.citation }
      : f)
  }

  // Si itera la COSTANTE: una dotazione assente dalla proposta è non_trovato,
  // mai "no" e mai ignorata.
  const features = {} as Record<FeatureKey, DraftField<boolean>>
  for (const f of RESIDENCE_FEATURES) features[f.key] = booleanField(raw.dotazioni[f.key])

  return {
    draft: {
      name: stringField(raw.nome),
      address: stringField(raw.indirizzo),
      energyClass: stringField(raw.classe_energetica),
      declaredUnitCount: numberField(raw.unita_dichiarate),
      units,
      deliveryDateSuggestion: stringField(raw.data_agibilita, 'verify'),
      features,
    },
  }
}

// ── Risposte umane e dotazioni ────────────────────────────────────────────

// Risposte dell'umano, per dotazione. Assente = nessuna risposta.
export type FeatureAnswers = Partial<Record<FeatureKey, boolean>>

// La risposta effettiva: l'umano vince; altrimenti il valore proposto se il
// documento ne ha uno (dal_documento o da_verificare); altrimenti NESSUNA.
export function effectiveFeatureAnswer(
  draft: ResidenceDraft, answers: FeatureAnswers, key: FeatureKey,
): boolean | undefined {
  const human = answers[key]
  if (typeof human === 'boolean') return human
  const field = draft.features[key]
  return field.state === 'non_trovato' ? undefined : field.value
}

export function resolveFeatures(draft: ResidenceDraft, answers: FeatureAnswers): {
  features: Record<FeatureKey, boolean> | null
  unresolved: FeatureKey[]
} {
  const unresolved: FeatureKey[] = []
  const features = {} as Record<FeatureKey, boolean>
  for (const f of RESIDENCE_FEATURES) {
    const a = effectiveFeatureAnswer(draft, answers, f.key)
    if (a === undefined) unresolved.push(f.key)
    else features[f.key] = a
  }
  return { features: unresolved.length === 0 ? features : null, unresolved }
}

// L'UNICA conversione di "non trovato" in "no": un gesto esplicito, mai un
// effetto collaterale. Non tocca le risposte già date né le proposte.
export function markUnresolvedAsNo(draft: ResidenceDraft, answers: FeatureAnswers): FeatureAnswers {
  const out: FeatureAnswers = { ...answers }
  for (const key of resolveFeatures(draft, answers).unresolved) out[key] = false
  return out
}

// ── Conteggio delle voci non generate (decisione 2 del 9/11) ──────────────

export type ConditionalTemplate = {
  condition_key: string | null
  scope: 'unit' | 'condominium'
  is_active: boolean
}

// Una voce condizionale nasce solo se la dotazione è "sì" (044:157-169). Qui si
// contano le voci che NON nasceranno per i "no" già decisi. Le dotazioni senza
// risposta NON si contano: non sono ancora un "no". Voci di scope condominium
// = 1 istanza; di scope unit = una per unità.
export function skippedItems(
  templates: readonly ConditionalTemplate[],
  answers: FeatureAnswers,
  unitCount: number,
): { count: number; noFeatures: FeatureKey[] } {
  const noFeatures = RESIDENCE_FEATURES.filter(f => answers[f.key] === false).map(f => f.key)
  const no = new Set<string>(noFeatures)
  let count = 0
  for (const t of templates) {
    if (!t.is_active || !t.condition_key || !no.has(t.condition_key)) continue
    count += t.scope === 'unit' ? Math.max(0, unitCount) : 1
  }
  return { count, noFeatures }
}

export function skippedItemsLine(count: number): string {
  return `${pluralize(count, 'voce di manutenzione non verrà generata', 'voci di manutenzione non verranno generate')}`
}

// ── Coerenza ──────────────────────────────────────────────────────────────

export type DraftWarning = { code: string; message: string }

export function normalizeAddress(a: string): string {
  return a.toLowerCase().replace(/[.,;]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Solo avvisi, mai blocchi: i blocchi sono quelli di prepareResidenceInput. Un
// avviso di contraddizione scatta solo se ENTRAMBE le risposte sono note.
export function draftWarnings(
  draft: ResidenceDraft,
  answers: FeatureAnswers,
  opts: { units: readonly { label: string }[]; existingAddresses: readonly string[]; address: string | null },
): DraftWarning[] {
  const out: DraftWarning[] = []

  const declared = draft.declaredUnitCount.value
  if (declared !== null && declared !== opts.units.length) {
    out.push({
      code: 'unit_count_mismatch',
      message: `Il documento dichiara ${pluralize(declared, 'unità', 'unità')}, l'elenco ne ha ${opts.units.length}`,
    })
  }

  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const u of opts.units) {
    const k = u.label.trim().toLowerCase()
    if (!k) continue
    if (seen.has(k)) dup.add(u.label.trim())
    seen.add(k)
  }
  for (const label of dup) out.push({ code: 'duplicate_unit', message: `Etichetta unità duplicata: "${label}"` })

  if (opts.address && opts.address.trim()) {
    const n = normalizeAddress(opts.address)
    if (opts.existingAddresses.some(a => normalizeAddress(a) === n)) {
      out.push({ code: 'address_in_use', message: 'Esiste già una residenza con questo indirizzo nello stesso costruttore' })
    }
  }

  const a = (k: FeatureKey) => effectiveFeatureAnswer(draft, answers, k)
  if (a('acs_centralizzata') === true && a('centrale_termica') === false) {
    out.push({ code: 'acs_without_boiler', message: 'Acqua calda centralizzata sì, ma centrale termica no' })
  }
  if (a('generatore_gas') === true && a('centrale_termica') === false) {
    out.push({ code: 'gas_without_boiler', message: 'Generatore a gas sì, ma centrale termica no' })
  }
  if (a('canna_fumaria_collettiva') === true && a('centrale_termica') === false) {
    out.push({ code: 'flue_without_boiler', message: 'Canna fumaria collettiva sì, ma centrale termica no' })
  }
  return out
}

// ── Dalla bozza alla creazione ────────────────────────────────────────────

// Valori dell'umano sulla pagina di revisione. Tutto ciò che non è estraibile
// (date) esiste solo qui.
export type DraftEdits = {
  name?: string
  address?: string
  energyClass?: string | null
  deliveryDate?: string
  unitsDeliveryDate?: string | null
  units?: { label: string; floor: number | null }[]
  categoryDates?: Record<string, string>
  featureAnswers?: FeatureAnswers
}

export type DraftCreation =
  | { input: ResidenceInput }
  | { error: string; unresolvedFeatures: FeatureKey[] }

// Valore corrente di un campo testuale: la modifica dell'umano, altrimenti il
// valore proposto (anche da_verificare), altrimenti niente.
function current(edit: string | null | undefined, field: DraftField<string>): string | null {
  if (edit !== undefined) return edit
  return field.value
}

// La creazione passa SEMPRE da prepareResidenceInput: nessuna regola di merito
// duplicata qui. Prima però si rifiuta se resta una dotazione senza risposta:
// "non trovato" non arriva mai alla RPC come "no".
export function prepareDraftCreation(draft: ResidenceDraft, edits: DraftEdits): DraftCreation {
  const { features, unresolved } = resolveFeatures(draft, edits.featureAnswers ?? {})
  if (!features) {
    return {
      error: `Rispondi sì o no per ${pluralize(unresolved.length, 'dotazione', 'dotazioni')}: il documento non ne parla`,
      unresolvedFeatures: unresolved,
    }
  }

  const unitsSource = edits.units ?? draft.units.map(u => (u.state === 'non_trovato' ? null : u.value))
  const units = unitsSource.filter((u): u is { label: string; floor: number | null } => u !== null)
  // Un piano mancante resta null: validateUnits lo rifiuta ("Dati unità non
  // validi"), mai uno 0 inventato.
  const raw: ResidenceInputRaw = {
    name: current(edits.name, draft.name),
    address: current(edits.address, draft.address),
    energyClass: current(edits.energyClass, draft.energyClass),
    // La data di consegna NON viene mai dal documento: solo l'umano la dà.
    deliveryDate: edits.deliveryDate ?? null,
    unitsDeliveryDate: edits.unitsDeliveryDate ?? null,
    units,
    categoryDates: edits.categoryDates ?? {},
    features,
  }
  const prepared = prepareResidenceInput(raw)
  if ('error' in prepared) return { error: prepared.error, unresolvedFeatures: [] }
  return { input: prepared.input }
}
