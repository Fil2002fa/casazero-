/**
 * Fonte unica per l'ESTRAZIONE dati dai documenti (tabella
 * document_extractions, migrazione 040) — seconda chiamata AI, separata
 * dalla classificazione, che resta byte-identica (route classify-document,
 * schema a 7 campi). Qui vivono: il set di chiavi ammesse in `fields` per
 * ogni doc_type, il calcolo di valid_until, la regola "estrazione corrente"
 * e l'ordinamento delle scadenze. Nessuna chiamata di rete, nessun client
 * Supabase: funzioni pure, verificate da scripts/verify-extraction.mjs.
 *
 * Contratto con lo schema 040:
 * - document_date, ambito, unita_riferimento: colonne tipizzate (comuni a
 *   ogni doc_type estraibile);
 * - fields JSONB: i campi specifici per doc_type, chiavi in FIELD_KEYS;
 * - valid_until: CALCOLATA qui, mai chiesta all'AI;
 * - for_doc_type: il doc_type per cui l'estrazione è stata fatta.
 *
 * ambito NON alimenta mai documents.unit_id: quella colonna decide chi vede
 * il documento (czero_can_access_unit) e resta una scelta umana all'upload.
 */
import type { DocType } from './document-classification'
import { pluralize } from './pluralize'

// ------------------------------------------------------------
// Stati e vocabolari
// ------------------------------------------------------------

/** Rispecchia il CHECK di document_extractions.status (040). */
export type ExtractionStatus = 'completata' | 'saltata' | 'fallita'

/** Rispecchia il CHECK di document_extractions.ambito (040). */
export type Ambito = 'residenza' | 'parti_comuni' | 'unita'
export const AMBITI: Ambito[] = ['residenza', 'parti_comuni', 'unita']
export const AMBITO_LABELS: Record<Ambito, string> = {
  residenza: 'Residenza',
  parti_comuni: 'Parti comuni',
  unita: 'Unità',
}

/** Classi APE (DM 26/06/2015), dalla migliore alla peggiore. */
export const CLASSI_ENERGETICHE = ['A4', 'A3', 'A2', 'A1', 'B', 'C', 'D', 'E', 'F', 'G'] as const
export type ClasseEnergetica = (typeof CLASSI_ENERGETICHE)[number]

// ------------------------------------------------------------
// Campi per doc_type
// ------------------------------------------------------------

/** Comuni a ogni doc_type estraibile: colonne tipizzate della 040. */
export type CommonExtraction = {
  data_documento: string | null      // ISO 'YYYY-MM-DD'
  ambito: Ambito | null
  unita_riferimento: string | null
}

export type GaranziaFields = {
  inizio: string | null              // ISO
  durata_anni: number | null
  oggetto: string | null
  rilasciata_da: string | null
}

export type ApeFields = {
  classe_energetica: ClasseEnergetica | null
  valida_fino_al: string | null      // ISO
}

/**
 * Stesso schema della garanzia (decisione 18/09): le polizze decennali reali
 * esprimono la validità quasi sempre come "N anni da un evento" (fine lavori,
 * collaudo, emissione del certificato), non con una data di fine. Quindi:
 * durata_anni + evento_decorrenza (testo, l'evento di partenza così come lo
 * nomina la polizza) sempre; decorrenza e scadenza SOLO se la polizza
 * riporta una data esplicita. valid_until si calcola solo quando una data
 * esiste; altrimenti resta null e il blocco Scadenze mostra la formula in
 * chiaro (validityFormula). Nessuna deduzione da parte dell'AI.
 */
export type PolizzaFields = {
  compagnia: string | null
  numero_polizza: string | null
  decorrenza: string | null          // ISO, solo se esplicita nel documento
  durata_anni: number | null
  evento_decorrenza: string | null   // es. "fine lavori", "collaudo statico"
  scadenza: string | null            // ISO, solo se esplicita nel documento
}

/**
 * I doc_type con campi specifici oltre a quelli comuni. La dichiarazione di
 * conformità NON è qui: la sua "data della dichiarazione" È la data del
 * documento (data_documento), decisione FASE 0 18/09; installatore e P.IVA
 * arrivano già dalla classificazione (extracted_metadata).
 */
export type TypedDocType = 'garanzia' | 'ape' | 'polizza_decennale'
export const TYPED_DOC_TYPES: TypedDocType[] = ['garanzia', 'ape', 'polizza_decennale']

export type FieldsByDocType = {
  garanzia: GaranziaFields
  ape: ApeFields
  polizza_decennale: PolizzaFields
}

/** Chiavi ammesse in `fields` per doc_type: la route le usa per costruire lo
 *  schema e per scartare tutto il resto prima della scrittura. */
export const FIELD_KEYS: { [K in TypedDocType]: readonly (keyof FieldsByDocType[K])[] } = {
  garanzia: ['inizio', 'durata_anni', 'oggetto', 'rilasciata_da'],
  ape: ['classe_energetica', 'valida_fino_al'],
  polizza_decennale: ['compagnia', 'numero_polizza', 'decorrenza', 'durata_anni', 'evento_decorrenza', 'scadenza'],
}

export function isTypedDocType(docType: string | null): docType is TypedDocType {
  return docType !== null && (TYPED_DOC_TYPES as string[]).includes(docType)
}

/**
 * Estraibile = ha un doc_type e non è 'altro'. Per i doc_type senza campi
 * specifici (manuale, agibilità, DiCo…) si estraggono solo i campi comuni:
 * data e ambito servono a ogni documento in archivio.
 */
export function isExtractableDocType(docType: string | null): docType is Exclude<DocType, 'altro'> {
  return docType !== null && docType !== 'altro'
}

/** Campi vuoti per un doc_type tipizzato: la forma che la route scrive in
 *  `fields` quando l'AI non trova nulla, così la UI legge sempre le stesse
 *  chiavi (mai `undefined` da un JSONB parziale). */
export function emptyFields<K extends TypedDocType>(docType: K): FieldsByDocType[K] {
  const out: Record<string, null> = {}
  for (const key of FIELD_KEYS[docType]) out[key as string] = null
  return out as FieldsByDocType[K]
}

// ------------------------------------------------------------
// Date ISO
// ------------------------------------------------------------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** 'YYYY-MM-DD' valida come data di calendario, altrimenti null. */
export function normalizeIsoDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const m = ISO_DATE.exec(raw.trim())
  if (!m) return null
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
  const probe = new Date(Date.UTC(y, mo - 1, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Somma anni interi a una data ISO, in UTC (nessun fuso: una DATE non ne ha).
 * 29 febbraio + N anni non bisestile → 1 marzo, comportamento nativo di Date,
 * accettato: è il giorno successivo, non un salto di mese.
 */
export function addYearsIso(iso: string, years: number): string | null {
  const base = normalizeIsoDate(iso)
  if (base === null || !Number.isInteger(years)) return null
  const [y, m, d] = base.split('-').map(Number)
  return toIso(new Date(Date.UTC(y + years, m - 1, d)))
}

// ------------------------------------------------------------
// valid_until — calcolata, mai chiesta all'AI
// ------------------------------------------------------------

function positiveInteger(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : null
}

/**
 * garanzia: inizio + durata_anni (durata intera e positiva, altrimenti null:
 * una garanzia senza durata leggibile non ha scadenza calcolabile, non una
 * scadenza inventata). ape: valida_fino_al. polizza: scadenza esplicita se
 * c'è, altrimenti decorrenza esplicita + durata_anni, altrimenti null (la
 * formula in chiaro la dà validityFormula). Ogni altro doc_type: null.
 * Unica regola per route (scrittura) e UI (lettura).
 */
export function computeValidUntil(docType: string | null, fields: unknown): string | null {
  if (!isTypedDocType(docType) || !fields || typeof fields !== 'object') return null
  const f = fields as Record<string, unknown>
  switch (docType) {
    case 'garanzia': {
      const inizio = normalizeIsoDate(f.inizio)
      const durata = positiveInteger(f.durata_anni)
      if (inizio === null || durata === null) return null
      return addYearsIso(inizio, durata)
    }
    case 'ape':
      return normalizeIsoDate(f.valida_fino_al)
    case 'polizza_decennale': {
      const scadenza = normalizeIsoDate(f.scadenza)
      if (scadenza !== null) return scadenza
      const decorrenza = normalizeIsoDate(f.decorrenza)
      const durata = positiveInteger(f.durata_anni)
      if (decorrenza === null || durata === null) return null
      return addYearsIso(decorrenza, durata)
    }
  }
}

/**
 * Formula di validità in chiaro per il blocco Scadenze quando valid_until
 * non è calcolabile ma il documento dichiara una durata: "10 anni dalla data
 * di fine lavori" · "5 anni" (senza evento). null se non c'è durata, o se
 * valid_until esiste già (in quel caso si mostra la data, non la formula).
 * Solo garanzia e polizza hanno una durata; per gli altri tipi null.
 */
export function validityFormula(docType: string | null, fields: unknown): string | null {
  if (!isTypedDocType(docType) || docType === 'ape' || !fields || typeof fields !== 'object') return null
  if (computeValidUntil(docType, fields) !== null) return null
  const f = fields as Record<string, unknown>
  const durata = positiveInteger(f.durata_anni)
  if (durata === null) return null
  const base = pluralize(durata, 'anno', 'anni')
  const evento = docType === 'polizza_decennale' && typeof f.evento_decorrenza === 'string' && f.evento_decorrenza.trim() !== ''
    ? f.evento_decorrenza.trim()
    : null
  return evento ? `${base} dalla data di ${evento}` : base
}

// ------------------------------------------------------------
// "Estrazione corrente" — chi decide se un documento è da estrarre
// ------------------------------------------------------------

/**
 * Riga di document_extractions come la legge la pagina Documenti (embed
 * 1:1 su documents, normalizzato con normalizeEmbed). `fields` è tipizzato
 * lasco: la forma dipende da for_doc_type e si legge con FieldsByDocType
 * solo dopo aver controllato isTypedDocType(for_doc_type). Per le righe
 * 'saltata' contiene solo skipped_reason.
 */
export type DocumentExtractionRow = {
  for_doc_type: string
  status: ExtractionStatus
  document_date: string | null
  ambito: Ambito | null
  unita_riferimento: string | null
  valid_until: string | null
  fields: Record<string, unknown>
}

export type ExtractionRef = { for_doc_type: string }
export type DocumentRef = { doc_type: string | null; classification_status: string }

/**
 * Un'estrazione vale solo per il doc_type per cui è stata fatta: se un umano
 * riclassifica (confirmClassification), la riga resta ma non è più corrente
 * e il documento rientra tra i "da estrarre". Nessuna cancellazione, nessuna
 * modifica alla server action: la regola è qui, letta da UI e route.
 */
export function extractionIsCurrent(doc: DocumentRef, extraction: ExtractionRef | null): boolean {
  return extraction !== null && doc.doc_type !== null && extraction.for_doc_type === doc.doc_type
}

/**
 * Da estrarre = classificazione finale ('completata': un doc_type ancora in
 * revisione non è una base affidabile) ∧ doc_type estraibile ∧ nessuna
 * estrazione corrente. Non guarda status della riga esistente: una
 * 'fallita' corrente non viene rilanciata da sola (serve un'azione umana,
 * come per la classificazione), una 'saltata' (non PDF) resta saltata.
 */
export function needsExtraction(doc: DocumentRef, extraction: ExtractionRef | null): boolean {
  return (
    doc.classification_status === 'completata' &&
    isExtractableDocType(doc.doc_type) &&
    !extractionIsCurrent(doc, extraction)
  )
}

// ------------------------------------------------------------
// Scadenze — ordinamento per il blocco "Scadenze"
// ------------------------------------------------------------

export type Deadline<T> = { item: T; validUntil: string; expired: boolean }

/**
 * Le prossime `limit` scadenze per data crescente: le scadute vengono prima
 * per costruzione (date più vecchie), poi le future. `expired` è un fatto
 * di calendario (validUntil < today), non un giudizio: la UI mostra la data
 * nuda, nessun colore di allarme (decisione 18/09). A parità di data
 * l'ordine di input è conservato (sort stabile).
 */
export function upcomingDeadlines<T>(
  items: T[],
  validUntilOf: (item: T) => string | null,
  todayIso: string,
  limit = 6,
): Deadline<T>[] {
  const withDate: Deadline<T>[] = []
  for (const item of items) {
    const validUntil = normalizeIsoDate(validUntilOf(item))
    if (validUntil === null) continue
    withDate.push({ item, validUntil, expired: validUntil < todayIso })
  }
  withDate.sort((a, b) => (a.validUntil < b.validUntil ? -1 : a.validUntil > b.validUntil ? 1 : 0))
  return withDate.slice(0, limit)
}

export type ValidityEntry<T> =
  | { kind: 'date'; item: T; validUntil: string; expired: boolean }
  | { kind: 'formula'; item: T; formula: string }

export type ValiditySource = {
  docType: string | null
  validUntil: string | null
  fields: unknown
}

/**
 * Voci del blocco "Scadenze": prima le voci con data (ordine di
 * upcomingDeadlines: crescente, scadute in cima), poi quelle SENZA data ma
 * con una formula dichiarata ("10 anni dalla data di fine lavori"),
 * nell'ordine di input; al massimo `limit` in tutto. La formula si mostra
 * al posto della data (decisione 18/09): una polizza che non ha una data
 * calcolabile ha comunque una validità da leggere. Un documento senza data
 * né formula non compare. `read` restituisce null per escludere un item
 * (es. estrazione non corrente).
 */
export function validityEntries<T>(
  items: T[],
  read: (item: T) => ValiditySource | null,
  todayIso: string,
  limit = 6,
): ValidityEntry<T>[] {
  const sources = items
    .map(item => ({ item, src: read(item) }))
    .filter((x): x is { item: T; src: ValiditySource } => x.src !== null)

  const dated = upcomingDeadlines(sources, x => x.src.validUntil, todayIso, limit)
    .map((d): ValidityEntry<T> => ({ kind: 'date', item: d.item.item, validUntil: d.validUntil, expired: d.expired }))

  const withFormula: ValidityEntry<T>[] = []
  for (const x of sources) {
    if (normalizeIsoDate(x.src.validUntil) !== null) continue
    const formula = validityFormula(x.src.docType, x.src.fields)
    if (formula !== null) withFormula.push({ kind: 'formula', item: x.item, formula })
  }

  return [...dated, ...withFormula].slice(0, limit)
}
