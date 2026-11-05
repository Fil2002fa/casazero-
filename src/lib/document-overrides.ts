/**
 * Correzioni manuali dei campi estratti (tabella document_field_overrides,
 * migrazione 048). Fonte unica per: le chiavi correggibili per doc_type, la
 * normalizzazione di un valore digitato, l'unione "manuale > AI" e la
 * provenienza di ogni campo. Funzioni pure, nessun client Supabase:
 * verificate da scripts/verify-document-overrides.mjs.
 *
 * Regole (piano R10, D3-D6):
 * - una correzione vale solo se for_doc_type coincide con il doc_type attuale
 *   del documento, come document_extractions (extractionIsCurrent);
 * - value null = "il documento non lo riporta", scelto a mano: vince sul
 *   valore AI come qualunque altra correzione;
 * - valid_until non è correggibile: si ricalcola con computeValidUntil sui
 *   campi uniti;
 * - ragione sociale e P.IVA dell'installatore (solo DiCo) stanno nel verbale
 *   di classificazione, non nell'estrazione: si uniscono a parte
 *   (effectiveInstaller);
 * - le chiavi dell'estrazione si applicano solo sopra un'estrazione corrente:
 *   senza estrazione non c'è una riga da correggere.
 *
 * Import relativi: il modulo si verifica con strip-types, che non risolve
 * '@/' (vedi scripts/ts-resolve-hooks.mjs).
 */
import type { DocumentFieldOverride } from '../types/database'
import type { ActivityPayload } from './activity-log'
import {
  DOC_TYPES,
  normalizeVatNumber,
  resolveInstallerInput,
  type ManualInstaller,
  type ResolvedInstaller,
} from './document-classification'
import {
  AMBITI,
  CLASSI_ENERGETICHE,
  FIELD_KEYS,
  computeValidUntil,
  isTypedDocType,
  normalizeIsoDate,
  type Ambito,
  type DocumentExtractionRow,
} from './document-extraction'

/** Riga di override come la legge la pagina (embed su documents). */
export type OverrideRow = Omit<DocumentFieldOverride, 'document_id'>

// ------------------------------------------------------------
// Chiavi correggibili per doc_type
// ------------------------------------------------------------

/** Colonne tipizzate di document_extractions, comuni a ogni tipo estraibile. */
export const COMMON_OVERRIDE_KEYS = ['document_date', 'ambito', 'unita_riferimento'] as const

/** Impresa installatrice della DiCo: nel verbale di classificazione. */
export const INSTALLER_OVERRIDE_KEYS = ['ragione_sociale_installatore', 'partita_iva_installatore'] as const

const DICO = 'dich_conformita_dm37'

/**
 * Chiavi correggibili per un doc_type: [] per 'altro', null o un tipo non in
 * tassonomia (D5: non modificabili); comuni + installatore per la DiCo;
 * comuni + FIELD_KEYS per i tipi con campi specifici; solo comuni per gli
 * altri. valid_until non c'è mai.
 */
export function overridableKeys(docType: string | null): string[] {
  if (docType === null || docType === 'altro' || !(DOC_TYPES as string[]).includes(docType)) return []
  if (docType === DICO) return [...COMMON_OVERRIDE_KEYS, ...INSTALLER_OVERRIDE_KEYS]
  if (isTypedDocType(docType)) return [...COMMON_OVERRIDE_KEYS, ...(FIELD_KEYS[docType] as readonly string[])]
  return [...COMMON_OVERRIDE_KEYS]
}

/**
 * Una correzione vale solo sopra un'estrazione corrente, tranne l'impresa
 * installatrice della DiCo, che sta nel verbale di classificazione e si applica
 * sempre (effectiveInstaller). Fonte unica per la server action (che rifiuta
 * il salvataggio) e per il gate di "Correggi dati" in UI.
 */
export function overrideRequiresExtraction(key: string): boolean {
  return !(INSTALLER_OVERRIDE_KEYS as readonly string[]).includes(key)
}

// ------------------------------------------------------------
// Tipo di valore per chiave e normalizzazione
// ------------------------------------------------------------

export type FieldKind = 'date' | 'int' | 'text' | 'ambito' | 'classe' | 'vat'

const FIELD_KIND: Record<string, FieldKind> = {
  document_date: 'date',
  ambito: 'ambito',
  unita_riferimento: 'text',
  ragione_sociale_installatore: 'text',
  partita_iva_installatore: 'vat',
  inizio: 'date',
  durata_anni: 'int',
  oggetto: 'text',
  rilasciata_da: 'text',
  classe_energetica: 'classe',
  valida_fino_al: 'date',
  compagnia: 'text',
  numero_polizza: 'text',
  decorrenza: 'date',
  evento_decorrenza: 'text',
  scadenza: 'date',
}

/** Etichette del pannello "Correggi dati". */
const FIELD_LABELS: Record<string, string> = {
  document_date: 'Data del documento',
  ambito: 'Ambito',
  unita_riferimento: 'Unità di riferimento',
  ragione_sociale_installatore: 'Impresa installatrice',
  partita_iva_installatore: 'Partita IVA dell’impresa',
  inizio: 'Inizio della garanzia',
  durata_anni: 'Durata (anni)',
  oggetto: 'Oggetto',
  rilasciata_da: 'Rilasciata da',
  classe_energetica: 'Classe energetica',
  valida_fino_al: 'Valida fino al',
  compagnia: 'Compagnia',
  numero_polizza: 'Numero polizza',
  decorrenza: 'Decorrenza',
  evento_decorrenza: 'Evento di decorrenza',
  scadenza: 'Scadenza',
}

export const MAX_TEXT_LENGTH = 300

export type NormalizedOverride = { value: string | null } | { error: string }

/**
 * Valore digitato → testo da scrivere in document_field_overrides.value.
 * null o stringa vuota → null ("il documento non lo riporta"). Usata dalla
 * server action prima della scrittura (commit 4): il DB non ha CHECK.
 */
export function normalizeOverrideInput(docType: string | null, key: string, raw: string | null): NormalizedOverride {
  if (!overridableKeys(docType).includes(key)) return { error: 'Questo campo non è modificabile per questo tipo di documento.' }
  const trimmed = raw === null ? '' : raw.trim()
  if (trimmed === '') return { value: null }

  switch (FIELD_KIND[key]) {
    case 'date': {
      const iso = normalizeIsoDate(trimmed)
      return iso === null ? { error: 'Data non valida.' } : { value: iso }
    }
    case 'int': {
      const n = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN
      return Number.isInteger(n) && n > 0 && n <= 100
        ? { value: String(n) }
        : { error: 'La durata deve essere un numero intero di anni, maggiore di zero.' }
    }
    case 'ambito':
      return (AMBITI as string[]).includes(trimmed) ? { value: trimmed } : { error: 'Ambito non valido.' }
    case 'classe': {
      const classe = trimmed.toUpperCase()
      return (CLASSI_ENERGETICHE as readonly string[]).includes(classe)
        ? { value: classe }
        : { error: 'Classe energetica non valida.' }
    }
    case 'vat': {
      const vat = normalizeVatNumber(trimmed)
      return vat !== null && vat.length === 11 ? { value: vat } : { error: 'La partita IVA deve avere 11 cifre.' }
    }
    case 'text':
      return trimmed.length <= MAX_TEXT_LENGTH
        ? { value: trimmed }
        : { error: `Il testo non può superare ${MAX_TEXT_LENGTH} caratteri.` }
    default:
      return { error: 'Questo campo non è modificabile per questo tipo di documento.' }
  }
}

/**
 * Valore salvato → valore tipizzato da unire. Si rilegge in difesa, come
 * tutto ciò che arriva dal DB: un valore non valido vale null (non
 * riportato), mai un dato inventato. durata_anni torna numero, come in
 * fields.
 */
function parseStoredValue(key: string, value: string | null): string | number | null {
  if (value === null) return null
  switch (FIELD_KIND[key]) {
    case 'date':
      return normalizeIsoDate(value)
    case 'int': {
      const n = /^\d+$/.test(value) ? Number(value) : NaN
      return Number.isInteger(n) && n > 0 ? n : null
    }
    case 'ambito':
      return (AMBITI as string[]).includes(value) ? value : null
    case 'classe':
      return (CLASSI_ENERGETICHE as readonly string[]).includes(value) ? value : null
    case 'vat':
      return normalizeVatNumber(value)
    default:
      return value.trim() === '' ? null : value
  }
}

// ------------------------------------------------------------
// Unione manuale > AI
// ------------------------------------------------------------

/** Correzioni in vigore: stesso doc_type del documento e chiave ammessa. */
export function currentOverrides(docType: string | null, overrides: readonly OverrideRow[] | null | undefined): OverrideRow[] {
  if (!overrides || overrides.length === 0) return []
  const allowed = overridableKeys(docType)
  return overrides.filter(o => o.for_doc_type === docType && allowed.includes(o.field_key))
}

const INSTALLER_KEYS: readonly string[] = INSTALLER_OVERRIDE_KEYS

/**
 * Estrazione effettiva: l'estrazione corrente (già filtrata dal chiamante
 * con extractionIsCurrent) con le correzioni in vigore sopra. Senza
 * correzioni restituisce lo STESSO oggetto ricevuto: nessun cambio di
 * output per i documenti mai corretti. Con correzioni, valid_until è
 * ricalcolata sui campi uniti.
 */
export function effectiveExtraction(
  docType: string | null,
  extraction: DocumentExtractionRow | null,
  overrides: readonly OverrideRow[] | null | undefined,
): DocumentExtractionRow | null {
  if (!extraction) return null
  const active = currentOverrides(docType, overrides).filter(o => !INSTALLER_KEYS.includes(o.field_key))
  if (active.length === 0) return extraction

  const merged: DocumentExtractionRow = { ...extraction, fields: { ...extraction.fields } }
  for (const o of active) {
    const v = parseStoredValue(o.field_key, o.value)
    switch (o.field_key) {
      case 'document_date':
        merged.document_date = typeof v === 'string' ? v : null
        break
      case 'ambito':
        merged.ambito = typeof v === 'string' ? (v as Ambito) : null
        break
      case 'unita_riferimento':
        merged.unita_riferimento = typeof v === 'string' ? v : null
        break
      default:
        merged.fields[o.field_key] = v
    }
  }
  if (isTypedDocType(docType)) merged.valid_until = computeValidUntil(docType, merged.fields)
  return merged
}

export type EffectiveInstaller = { ragioneSociale: string | null; partitaIva: string | null }

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * Impresa installatrice effettiva della DiCo: per ciascun campo la
 * correzione in vigore se c'è, altrimenti il verbale di classificazione.
 * Per ogni altro doc_type: entrambi null, come documentFacts.
 */
export function effectiveInstaller(
  docType: string | null,
  metadata: { ragione_sociale_installatore?: string | null; partita_iva_installatore?: string | null } | null,
  overrides: readonly OverrideRow[] | null | undefined,
): EffectiveInstaller {
  if (docType !== DICO) return { ragioneSociale: null, partitaIva: null }
  const out: EffectiveInstaller = {
    ragioneSociale: nonEmpty(metadata?.ragione_sociale_installatore),
    partitaIva: nonEmpty(metadata?.partita_iva_installatore),
  }
  for (const o of currentOverrides(docType, overrides)) {
    const v = parseStoredValue(o.field_key, o.value)
    if (o.field_key === 'ragione_sociale_installatore') out.ragioneSociale = typeof v === 'string' ? v : null
    if (o.field_key === 'partita_iva_installatore') out.partitaIva = typeof v === 'string' ? v : null
  }
  return out
}

/**
 * Impresa che alimenta la proposta fornitore: l'installatore EFFETTIVO
 * (correzione > verbale) passato a resolveInstallerInput, così i valori
 * digitati a mano valgono solo se nome effettivo è vuoto. Fonte unica di due
 * superfici — il pannello (SupplierProposalSection) e la server action
 * (confirmSupplierProposal) — che devono vedere la stessa impresa, o l'esito
 * letto e quello ricalcolato divergono. `nameMissing` = nessun nome effettivo:
 * il pannello mostra allora i campi a mano.
 */
export function resolveProposalInstaller(
  docType: string | null,
  metadata: { ragione_sociale_installatore?: string | null; partita_iva_installatore?: string | null } | null,
  overrides: readonly OverrideRow[] | null | undefined,
  manual: ManualInstaller | null | undefined,
): ResolvedInstaller & { nameMissing: boolean } {
  const effective = effectiveInstaller(docType, metadata, overrides)
  return {
    ...resolveInstallerInput(effective, manual),
    nameMissing: (effective.ragioneSociale?.trim() ?? '') === '',
  }
}

export type PlannedOverrideWrite = { fieldKey: string; value: string | null }

/**
 * Correzioni da scrivere sul documento quando la proposta fornitore viene
 * confermata con l'impresa digitata a mano (R10, commit 7b). Funzione pura:
 * decide COSA scrivere, la server action scrive.
 *
 * - nome effettivo presente (correzione o verbale): il manuale è ignorato,
 *   nessuna scrittura;
 * - nome effettivo vuoto e nome manuale: ragione sociale = nome manuale
 *   (normalizeOverrideInput, stessa validazione di "Correggi dati");
 * - P.IVA manuale presente: P.IVA = quella manuale (11 cifre);
 * - P.IVA manuale vuota: override null sulla P.IVA SOLO se oggi esiste una
 *   P.IVA effettiva (correzione o verbale). Nome e P.IVA formano una coppia: a
 *   nome vuoto la proposta ignora la P.IVA del verbale (resolveInstallerInput),
 *   e il documento non deve continuare a mostrare in riga ed Excel una P.IVA
 *   che appartiene a un'altra impresa. Senza una P.IVA effettiva non c'è
 *   nulla da azzerare: nessuna scrittura;
 * - in caso di errore di validazione non si scrive nulla.
 */
export function manualInstallerOverrides(
  docType: string | null,
  metadata: { ragione_sociale_installatore?: string | null; partita_iva_installatore?: string | null } | null,
  overrides: readonly OverrideRow[] | null | undefined,
  manual: ManualInstaller | null | undefined,
): { writes: PlannedOverrideWrite[] } | { error: string } {
  if (!overridableKeys(docType).includes('ragione_sociale_installatore')) return { writes: [] }

  const resolved = resolveProposalInstaller(docType, metadata, overrides, manual)
  if (resolved.manualError !== null) return { error: resolved.manualError }
  // Nome effettivo presente (manuale ignorato) o nessun nome digitato.
  if (!resolved.nameMissing || resolved.ragioneSociale === null) return { writes: [] }

  const nome = normalizeOverrideInput(docType, 'ragione_sociale_installatore', resolved.ragioneSociale)
  if ('error' in nome) return { error: nome.error }
  const writes: PlannedOverrideWrite[] = [{ fieldKey: 'ragione_sociale_installatore', value: nome.value }]

  if (resolved.partitaIva !== null) {
    const vat = normalizeOverrideInput(docType, 'partita_iva_installatore', resolved.partitaIva)
    if ('error' in vat) return { error: vat.error }
    writes.push({ fieldKey: 'partita_iva_installatore', value: vat.value })
  } else if (effectiveInstaller(docType, metadata, overrides).partitaIva !== null) {
    writes.push({ fieldKey: 'partita_iva_installatore', value: null })
  }
  return { writes }
}

// ------------------------------------------------------------
// Provenienza
// ------------------------------------------------------------

export type FieldProvenance =
  | { source: 'ai' }
  | { source: 'manuale'; setBy: string; setAt: string }

/**
 * Provenienza di ogni chiave correggibile per il doc_type attuale: 'manuale'
 * (con chi e quando, per "Modificato a mano · Nome, data") se c'è una
 * correzione in vigore, altrimenti 'ai'. Per la UI del commit 5.
 */
export function fieldProvenance(
  docType: string | null,
  overrides: readonly OverrideRow[] | null | undefined,
): Record<string, FieldProvenance> {
  const out: Record<string, FieldProvenance> = {}
  for (const key of overridableKeys(docType)) out[key] = { source: 'ai' }
  for (const o of currentOverrides(docType, overrides)) {
    out[o.field_key] = { source: 'manuale', setBy: o.set_by, setAt: o.set_at }
  }
  return out
}

/** Almeno una correzione in vigore: etichetta "Dati corretti a mano" in riga. */
export function hasCurrentOverrides(docType: string | null, overrides: readonly OverrideRow[] | null | undefined): boolean {
  return currentOverrides(docType, overrides).length > 0
}

// ------------------------------------------------------------
// Campi del pannello "Correggi dati"
// ------------------------------------------------------------

/**
 * Un campo correggibile come lo mostra il pannello: valore AI (riferimento),
 * valore effettivo (quello che il pannello precompila) e provenienza. I
 * valori sono testo pronto da mettere in un input: date ISO, interi come
 * stringa, ambito e classe come codice. null = non riportato.
 */
export type CorrectionField = {
  key: string
  label: string
  kind: FieldKind
  ai: string | null
  effective: string | null
  provenance: FieldProvenance
}

function fieldText(
  key: string,
  extraction: DocumentExtractionRow | null,
  installer: EffectiveInstaller,
): string | null {
  if (key === 'ragione_sociale_installatore') return installer.ragioneSociale
  if (key === 'partita_iva_installatore') return installer.partitaIva
  if (!extraction) return null
  let v: unknown
  if (key === 'document_date') v = extraction.document_date
  else if (key === 'ambito') v = extraction.ambito
  else if (key === 'unita_riferimento') v = extraction.unita_riferimento
  else v = extraction.fields[key]
  if (typeof v === 'number') return String(v)
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

/**
 * Campi correggibili per il doc_type attuale, nell'ordine di overridableKeys.
 * `aiExtraction` è la riga AI già filtrata con extractionIsCurrent (null se
 * non c'è); `metadata` è il verbale di classificazione (installatore DiCo).
 * Fonte unica del pannello: il componente non legge mai estrazione, verbale
 * o correzioni per conto suo.
 */
export function buildCorrectionFields(
  docType: string | null,
  aiExtraction: DocumentExtractionRow | null,
  metadata: { ragione_sociale_installatore?: string | null; partita_iva_installatore?: string | null } | null,
  overrides: readonly OverrideRow[] | null | undefined,
): CorrectionField[] {
  const aiInstaller = effectiveInstaller(docType, metadata, [])
  const effInstaller = effectiveInstaller(docType, metadata, overrides)
  const effExtraction = effectiveExtraction(docType, aiExtraction, overrides)
  const provenance = fieldProvenance(docType, overrides)
  return overridableKeys(docType).map(key => ({
    key,
    label: FIELD_LABELS[key] ?? key,
    kind: FIELD_KIND[key],
    ai: fieldText(key, aiExtraction, aiInstaller),
    effective: fieldText(key, effExtraction, effInstaller),
    provenance: provenance[key],
  }))
}

/**
 * Correzioni in vigore che smetterebbero di applicarsi se il documento
 * passasse a `newType` (D6): restano nel DB legate al tipo attuale e
 * tornano attive se si torna a quel tipo. 0 se il tipo non cambia.
 */
export function overridesLostOnTypeChange(
  docType: string | null,
  newType: string | null,
  overrides: readonly OverrideRow[] | null | undefined,
): number {
  return newType === docType ? 0 : currentOverrides(docType, overrides).length
}

// ------------------------------------------------------------
// Registro attività (evento documento_corretto, migrazione 049)
// ------------------------------------------------------------

/** Etichetta del campo come nel pannello "Correggi dati"; null se la chiave non è nota. */
export function overrideFieldLabel(key: string): string | null {
  return Object.prototype.hasOwnProperty.call(FIELD_LABELS, key) ? FIELD_LABELS[key] : null
}

/** Da dove nasce la correzione: il pannello "Correggi dati" o la proposta fornitore. */
export type CorrectionSource = 'correggi_dati' | 'proposta_fornitore'

/**
 * La correzione manuale che c'era PRIMA dell'atto (mai il valore AI).
 * `known: false` = la lettura è fallita: il registro lo dice con had_previous null.
 */
export type PreviousOverride =
  | { known: false }
  | { known: true; exists: false }
  | { known: true; exists: true; value: string | null }

/** Salvare lo stesso valore già corretto a mano non è un atto: nessun evento. */
export function isNoopCorrection(previous: PreviousOverride, value: string | null): boolean {
  return previous.known && previous.exists && previous.value === value
}

/**
 * Payload dell'evento documento_corretto (contratto in
 * 049_activity_event_documento_corretto.sql): solo dati, mai frasi. `value`
 * c'è solo per "impostato" (null = il documento non riporta il campo).
 */
export function documentCorrectionPayload(input: {
  documentId: string
  title: string | null
  docType: string
  fieldKey: string
  action: 'impostato' | 'ripristinato'
  value: string | null
  previous: PreviousOverride
  source: CorrectionSource
}): ActivityPayload {
  const { previous } = input
  const payload: ActivityPayload = {
    document_id: input.documentId,
    title: input.title,
    doc_type: input.docType,
    field_key: input.fieldKey,
    action: input.action,
    had_previous: previous.known ? previous.exists : null,
    previous: previous.known && previous.exists ? previous.value : null,
    source: input.source,
  }
  if (input.action === 'impostato') payload.value = input.value
  return payload
}

/** Etichetta neutra del tipo, usata anche come ripiego della frase. */
export const DOCUMENT_CORRECTED_NEUTRAL_LABEL = 'Dato del documento corretto a mano'

function payloadString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Frase a schermo di un evento documento_corretto, costruita a lettura dal
 * payload (il registro è immutabile, non contiene testo pronto). Ogni chiave è
 * letta in modo difensivo: una riga con chiavi mancanti non rompe la pagina.
 */
export function documentCorrectionText(payload: Record<string, unknown>): string {
  const restored = payload.action === 'ripristinato'
  const title = payloadString(payload.title)
  const fieldKey = payloadString(payload.field_key)
  const label = fieldKey === null ? null : overrideFieldLabel(fieldKey)
  const detail = [title === null ? null : `«${title}»`, label].filter((p): p is string => p !== null)
  if (detail.length === 0) return restored ? 'Valore AI ripristinato' : DOCUMENT_CORRECTED_NEUTRAL_LABEL
  return `${restored ? 'Valore AI ripristinato' : 'Dato corretto a mano'}: ${detail.join(', ')}`
}
