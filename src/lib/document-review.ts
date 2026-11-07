/**
 * Tab "Da rivedere" della pagina Documenti (E1b, commit 8): quali documenti ci
 * stanno, in che ordine, come si legge la proposta in riga e che cosa assegna
 * "Accetta tutte ad alta confidenza", come funzioni pure. Il componente non
 * decide niente da solo, e scripts/verify-document-review.mjs prova ogni regola
 * senza avviare l'app.
 *
 * "Da rivedere" NON è "Da verificare": quest'ultima è la classificazione
 * aperta di un documento (ambra, già con o senza unità). Qui conta solo
 * l'unità: il documento non ne ha una e nessuno ha scelto di lasciarlo così.
 *
 * Una proposta non assegna mai nulla: unit_id lo scrive solo una persona, con
 * Accetta, Cambia o Accetta tutte. Vedi document-unit-proposal.ts.
 *
 * Import relativi tra moduli di lib: vedi document-rows.ts.
 */
import { formatUnitLabel } from './formatUnitLabel'
import { humanizeDocumentTitle } from './documentTitle'
import { pluralize } from './pluralize'
import { displayDate, type DocRow, type UnitRow } from './document-rows'
import { hasPendingUnitProposal, type ProposalConfidence } from './document-unit-proposal'
import { namesList, type BulkAssignSummary, type BulkFailure } from './document-table'

/** Fascia della proposta di unità, come la leggono la riga e il pannello. */
export const BAND_LABELS: Record<ProposalConfidence, string> = { alta: 'Alta', media: 'Media', bassa: 'Bassa' }

const BAND_ORDER: Record<ProposalConfidence, number> = { alta: 0, media: 1, bassa: 2 }

/** Senza unità e non ignorato: l'insieme del tab, indipendente dalla proposta. */
export function isInReview(doc: Pick<DocRow, 'unit_id' | 'unit_proposal_dismissed_at'>): boolean {
  return doc.unit_id === null && doc.unit_proposal_dismissed_at === null
}

/**
 * I documenti del tab: prima quelli con proposta (Alta, Media, Bassa), poi
 * quelli senza; a parità i più recenti, poi titolo e id, così l'ordine non
 * cambia da un render all'altro. Non muta l'input.
 */
export function reviewDocs(docs: readonly DocRow[], units: readonly UnitRow[]): DocRow[] {
  const known = new Set(units.map(u => u.id))
  const rank = (d: DocRow) => {
    const p = proposalOf(d, known)
    return p === null ? 3 : BAND_ORDER[p.confidence]
  }
  return docs
    .filter(isInReview)
    .sort((a, b) => {
      const byBand = rank(a) - rank(b)
      if (byBand !== 0) return byBand
      const byDate = displayDate(b).localeCompare(displayDate(a))
      if (byDate !== 0) return byDate
      const byTitle = humanizeDocumentTitle(a.title).localeCompare(humanizeDocumentTitle(b.title), 'it', { sensitivity: 'base' })
      if (byTitle !== 0) return byTitle
      return a.id.localeCompare(b.id)
    })
}

function proposalOf(doc: DocRow, knownUnitIds: ReadonlySet<string>): { unitId: string; confidence: ProposalConfidence } | null {
  if (!hasPendingUnitProposal(doc)) return null
  if (doc.proposed_unit_id === null || doc.unit_proposal_confidence === null) return null
  // Una proposta verso un'unità che questa pagina non conosce non si mostra né
  // si accetta: meglio "Nessuna proposta" che un'assegnazione a una unità fuori vista.
  if (!knownUnitIds.has(doc.proposed_unit_id)) return null
  return { unitId: doc.proposed_unit_id, confidence: doc.unit_proposal_confidence }
}

export type ReviewProposal = { unitId: string; unitLabel: string; confidence: ProposalConfidence; bandLabel: string }

/** La proposta da mostrare in riga, o null ("Nessuna proposta": solo Cambia e Ignora). */
export function reviewProposal(doc: DocRow, units: readonly UnitRow[]): ReviewProposal | null {
  const p = proposalOf(doc, new Set(units.map(u => u.id)))
  if (p === null) return null
  const unit = units.find(u => u.id === p.unitId)
  if (!unit) return null
  return { unitId: p.unitId, unitLabel: formatUnitLabel(unit.label), confidence: p.confidence, bandLabel: BAND_LABELS[p.confidence] }
}

/**
 * Che cosa assegna "Accetta tutte ad alta confidenza": solo i documenti del
 * tab con proposta pendente in fascia Alta. Il match è già univoco alla
 * scrittura (proposeUnit non propone se ambiguo); qui si esclude il resto.
 */
export function acceptAllCandidates(docs: readonly DocRow[], units: readonly UnitRow[]): { doc: DocRow; unitId: string }[] {
  const out: { doc: DocRow; unitId: string }[] = []
  for (const doc of reviewDocs(docs, units)) {
    const p = reviewProposal(doc, units)
    if (p !== null && p.confidence === 'alta') out.push({ doc, unitId: p.unitId })
  }
  return out
}

export const DISMISS_HAS_UNIT_ERROR = 'Il documento ha già un’unità: non c’è niente da ignorare.'

export type DismissCheck =
  | { ok: true; change: 'ignorata' | 'invariata' }
  | { ok: false; error: string }

/**
 * Se "Ignora" si può applicare al documento così com'è ORA (letto dal DB).
 * Ignorare vuol dire "lasciare questo documento senza unità": non ha senso se
 * l'unità c'è già. Già ignorato = invariata, e l'action risponde successo
 * senza riscrivere niente (idempotente, come setDocumentUnit).
 */
export function checkDismissProposal(
  doc: Pick<DocRow, 'unit_id' | 'unit_proposal_dismissed_at'>,
): DismissCheck {
  if (doc.unit_id !== null) return { ok: false, error: DISMISS_HAS_UNIT_ERROR }
  if (doc.unit_proposal_dismissed_at !== null) return { ok: true, change: 'invariata' }
  return { ok: true, change: 'ignorata' }
}

/**
 * Un solo messaggio per tutto il ciclo di "Accetta tutte": "N assegnati, M
 * falliti: nomi". Con dei fallimenti il toast è persistente (i nomi vanno
 * letti); senza, passa da solo. Lo stesso formato di summarizeBulkAssign, che
 * qui non basta: le destinazioni sono unità diverse, non una sola.
 */
export function summarizeAcceptAll(input: { assigned: number; failures: readonly BulkFailure[] }): BulkAssignSummary {
  const { assigned, failures } = input
  if (failures.length === 0) {
    if (assigned === 0) {
      return { kind: 'success', message: 'Niente da assegnare: nessuna proposta ad alta confidenza.', persistent: false }
    }
    return { kind: 'success', message: `${pluralize(assigned, 'documento assegnato', 'documenti assegnati')} alle unità proposte.`, persistent: false }
  }
  const reasons = new Set(failures.map(f => f.error))
  const reason = reasons.size === 1 ? ` Motivo: ${[...reasons][0]}` : ''
  const names = namesList(failures.map(f => f.name))
  const failed = pluralize(failures.length, 'fallito', 'falliti')
  const end = (t: string) => (t.endsWith('.') ? t : t + '.')
  if (assigned === 0) {
    return { kind: 'error', message: end(`Nessun documento assegnato, ${failed}: ${names}.${reason}`), persistent: true }
  }
  return { kind: 'warning', message: end(`${pluralize(assigned, 'assegnato', 'assegnati')}, ${failed}: ${names}.${reason}`), persistent: true }
}
