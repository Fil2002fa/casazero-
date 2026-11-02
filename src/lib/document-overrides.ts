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
import { DOC_TYPES, normalizeVatNumber } from './document-classification'
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

// ------------------------------------------------------------
// Tipo di valore per chiave e normalizzazione
// ------------------------------------------------------------

type FieldKind = 'date' | 'int' | 'text' | 'ambito' | 'classe' | 'vat'

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

const MAX_TEXT_LENGTH = 300

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
