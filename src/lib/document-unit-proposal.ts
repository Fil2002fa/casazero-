/**
 * Proposta di unità per un documento (E1b): dal testo letto dall'AI
 * ("interno A2", "scala B, piano primo, interno B2") all'unità della
 * residenza che quel testo indica, con una fascia di affidabilità. Modulo
 * puro, senza client Supabase: lo usano le route di classificazione ed
 * estrazione, lo script di riempimento e la UI. Verificato da
 * scripts/verify-unit-proposal.mjs.
 *
 * UNA PROPOSTA NON ASSEGNA MAI NULLA. documents.unit_id lo scrive solo una
 * persona (Accetta / Cambia in pagina). Qui si decide solo che cosa proporre.
 *
 * Principio: meglio nessuna proposta che una sbagliata. Il match è
 * conservativo e deve essere UNIVOCO: se il testo può indicare due unità, o
 * se due unità hanno la stessa chiave, non si propone niente.
 *
 *  alta   il testo ha UN solo riferimento marcato ("interno 3", "int. B2",
 *         "unità 5") e coincide con la chiave di una sola unità.
 *  media  più riferimenti marcati ma uno solo corrisponde a un'unità, oppure
 *         l'etichetta (di più parole, es. "Appartamento Rossi") compare per
 *         intero nel testo.
 *  bassa  nessun riferimento marcato, ma una chiave alfanumerica ("A1")
 *         compare da sola nel testo. Mai per numeri nudi: "Sub. 6" o
 *         "Via Cavaccio 12" non indicano l'unità 6 o 12.
 *
 * "Chiave" di un'unità = l'etichetta senza le parole generiche (unità,
 * appartamento, interno...): "Unità 3" → "3", "A1" → "a1". Un'etichetta con
 * più parole distintive ("Test 4 Rinominato") non ha chiave e si trova solo
 * per etichetta intera.
 *
 * Import relativi tra moduli di lib: vedi document-rows.ts.
 */
import { currentExtraction, type DocRow } from './document-rows'

export type ProposalConfidence = 'alta' | 'media' | 'bassa'

export type UnitProposal = { unitId: string; confidence: ProposalConfidence }

export type ProposalUnit = { id: string; label: string }

const GENERIC_WORDS = new Set(['unita', 'appartamento', 'app', 'interno', 'int', 'alloggio', 'n', 'numero'])

// Riferimento marcato: parola-guida + identificativo ("interno 3", "int b2",
// "unita n 5"). Il testo è già normalizzato (minuscolo, senza accenti né
// punteggiatura), quindi "N." diventa "n".
const ANCHOR_RE = /\b(?:interno|int|unita|appartamento|app|alloggio)(?: n| numero)? ([a-z]?\d+[a-z]?)\b/g

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

type KeyedUnit = {
  unit: ProposalUnit
  /** Parole distintive dell'etichetta, senza quelle generiche. */
  rest: string[]
  /** Chiave se c'è una sola parola distintiva, altrimenti null. */
  key: string | null
}

function keyUnit(unit: ProposalUnit): KeyedUnit {
  const rest = normalize(unit.label).split(' ').filter(t => t !== '' && !GENERIC_WORDS.has(t))
  return { unit, rest, key: rest.length === 1 ? rest[0] : null }
}

export function proposeUnit(text: string | null | undefined, units: readonly ProposalUnit[]): UnitProposal | null {
  if (!text) return null
  const t = normalize(text)
  if (t === '' || units.length === 0) return null
  const keyed = units.map(keyUnit)

  // 1. Riferimenti marcati.
  const anchors = [...new Set([...t.matchAll(ANCHOR_RE)].map(m => m[1]))]
  if (anchors.length > 0) {
    const hits = new Set<string>()
    for (const anchor of anchors) {
      const matching = keyed.filter(k => k.key === anchor)
      // Due unità con la stessa chiave: il testo non dice quale.
      if (matching.length > 1) return null
      if (matching.length === 1) hits.add(matching[0].unit.id)
    }
    if (hits.size > 1) return null
    if (hits.size === 1) {
      return { unitId: [...hits][0], confidence: anchors.length === 1 ? 'alta' : 'media' }
    }
  }

  // 2. Etichetta di più parole, per intero e contigua nel testo.
  const padded = ` ${t} `
  const byLabel = keyed.filter(k => k.rest.length >= 2 && padded.includes(` ${k.rest.join(' ')} `))
  if (byLabel.length > 1) return null
  if (byLabel.length === 1) return { unitId: byLabel[0].unit.id, confidence: 'media' }

  // 3. Chiave alfanumerica da sola ("a1"), mai un numero nudo.
  const tokens = new Set(t.split(' '))
  const bare = keyed.filter(k => k.key !== null && /[a-z]/.test(k.key) && /\d/.test(k.key) && tokens.has(k.key))
  if (bare.length === 1) return { unitId: bare[0].unit.id, confidence: 'bassa' }

  return null
}

/**
 * Il testo da cui si propone: l'unità di riferimento dell'estrazione EFFETTIVA
 * (correzioni manuali comprese; una correzione vuota vale "il documento non la
 * riporta"), oppure, se non c'è un'estrazione corrente, quella del verbale
 * della classificazione.
 */
export function proposalSourceText(doc: DocRow): string | null {
  const ext = currentExtraction(doc)
  const raw = ext ? ext.unita_riferimento : (doc.extracted_metadata?.unita_riferimento ?? null)
  const text = typeof raw === 'string' ? raw.trim() : ''
  return text === '' ? null : text
}

/** Un documento può ricevere una proposta solo se è senza unità e non è stato ignorato. */
export function canReceiveUnitProposal(doc: Pick<DocRow, 'unit_id' | 'unit_proposal_dismissed_at'>): boolean {
  return doc.unit_id === null && doc.unit_proposal_dismissed_at === null
}

/** La proposta da scrivere per questo documento, o null (non idoneo o nessun match). */
export function unitProposalFor(doc: DocRow, units: readonly ProposalUnit[]): UnitProposal | null {
  if (!canReceiveUnitProposal(doc)) return null
  return proposeUnit(proposalSourceText(doc), units)
}

/** Proposta in attesa di una persona: senza unità, con proposta, non ignorata. */
export function hasPendingUnitProposal(
  doc: Pick<DocRow, 'unit_id' | 'proposed_unit_id' | 'unit_proposal_dismissed_at'>,
): boolean {
  return doc.unit_id === null && doc.proposed_unit_id !== null && doc.unit_proposal_dismissed_at === null
}
