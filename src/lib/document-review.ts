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
import { namesList, type BulkAssignSummary, type BulkFailure, type UnitAssignment } from './document-table'

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
  return docs.filter(isInReview).sort(reviewComparator(units))
}

/** Ordine del tab: fascia della proposta, poi i più recenti, poi titolo e id. */
function reviewComparator(units: readonly UnitRow[]): (a: DocRow, b: DocRow) => number {
  const known = new Set(units.map(u => u.id))
  const rank = (d: DocRow) => {
    const p = proposalOf(d, known)
    return p === null ? 3 : BAND_ORDER[p.confidence]
  }
  return (a, b) => {
    const byBand = rank(a) - rank(b)
    if (byBand !== 0) return byBand
    const byDate = displayDate(b).localeCompare(displayDate(a))
    if (byDate !== 0) return byDate
    const byTitle = humanizeDocumentTitle(a.title).localeCompare(humanizeDocumentTitle(b.title), 'it', { sensitivity: 'base' })
    if (byTitle !== 0) return byTitle
    return a.id.localeCompare(b.id)
  }
}

/**
 * Lo stesso file caricato più volte (E1b-8e): una riga sola nel tab. Un gruppo è
 * l'insieme dei documenti del tab con lo stesso nome file E lo stesso tipo: il
 * solo tipo non basta (due DiCo di unità diverse non sono versioni), il solo
 * nome nemmeno (lo stesso file può essere letto come due tipi). Senza tipo si
 * raggruppa solo con altri senza tipo.
 * `latest` è il più recente per created_at (come slotDocs in unit-documents.ts,
 * spareggio sull'id): la riga mostra lui e la proposta del gruppo è la sua.
 * `docs` ha tutti i documenti, `latest` per primo; `extra` è il numero delle
 * versioni oltre al più recente ("+N versioni").
 */
export type ReviewGroup = { key: string; latest: DocRow; docs: DocRow[]; extra: number }

export function reviewGroupKey(doc: Pick<DocRow, 'file_name' | 'doc_type'>): string {
  return `${doc.file_name}\u0000${doc.doc_type ?? ''}`
}

function newestFirst(a: DocRow, b: DocRow): number {
  const byDate = Date.parse(b.created_at) - Date.parse(a.created_at)
  if (byDate !== 0) return byDate
  return a.id.localeCompare(b.id)
}

/**
 * Le righe del tab: l'ordine di reviewDocs applicato al documento più recente
 * di ogni gruppo. Non muta l'input.
 */
export function reviewGroups(docs: readonly DocRow[], units: readonly UnitRow[]): ReviewGroup[] {
  const byKey = new Map<string, DocRow[]>()
  for (const doc of docs) {
    if (!isInReview(doc)) continue
    const key = reviewGroupKey(doc)
    const list = byKey.get(key)
    if (list) list.push(doc)
    else byKey.set(key, [doc])
  }
  const groups: ReviewGroup[] = [...byKey].map(([key, list]) => {
    const sorted = [...list].sort(newestFirst)
    return { key, latest: sorted[0], docs: sorted, extra: sorted.length - 1 }
  })
  const compare = reviewComparator(units)
  return groups.sort((a, b) => compare(a.latest, b.latest))
}

/**
 * Un'assegnazione per documento del gruppo, tutte verso la stessa unità
 * (null = nessuna: serve a Ignora, che passa per lo stesso ciclo).
 */
export function groupAssignments(group: ReviewGroup, unitId: string | null): UnitAssignment[] {
  return group.docs.map(doc => ({ doc, unitId }))
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
 * Che cosa assegna "Accetta tutte ad alta confidenza": solo i gruppi del tab con
 * proposta pendente in fascia Alta (la proposta del gruppo è quella del
 * documento più recente). Il match è già univoco alla scrittura (proposeUnit
 * non propone se ambiguo); qui si esclude il resto. Ogni gruppo assegna tutte
 * le sue versioni.
 */
export function acceptAllGroupCandidates(docs: readonly DocRow[], units: readonly UnitRow[]): { group: ReviewGroup; unitId: string }[] {
  const out: { group: ReviewGroup; unitId: string }[] = []
  for (const group of reviewGroups(docs, units)) {
    const p = reviewProposal(group.latest, units)
    if (p !== null && p.confidence === 'alta') out.push({ group, unitId: p.unitId })
  }
  return out
}

/**
 * Per documento, non per gruppo: la lista (ReviewList) lo usa ancora finché il
 * commit 8e-2 non passa ai gruppi; con quel commit si toglie, insieme a
 * summarizeAcceptAll.
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

const endSentence = (t: string) => (t.endsWith('.') ? t : t + '.')
// I nomi si dicono una volta sola: due versioni dello stesso file che falliscono
// sono un nome e due file non riusciti (la conta sta a parte).
const uniqueNames = (failures: readonly BulkFailure[]) => namesList([...new Set(failures.map(f => f.name))])
const reasonOf = (failures: readonly BulkFailure[]) => {
  const reasons = new Set(failures.map(f => f.error))
  return reasons.size === 1 ? ` Motivo: ${[...reasons][0]}` : ''
}
const versionsSuffix = (total: number) => (total > 1 ? ` (${pluralize(total, 'versione', 'versioni')})` : '')

/** Per documento: vedi acceptAllCandidates. Si toglie con 8e-2. */
export function summarizeAcceptAll(input: { assigned: number; failures: readonly BulkFailure[] }): BulkAssignSummary {
  const { assigned, failures } = input
  if (failures.length === 0) {
    if (assigned === 0) {
      return { kind: 'success', message: 'Niente da assegnare: nessuna proposta ad alta confidenza.', persistent: false }
    }
    return { kind: 'success', message: `${pluralize(assigned, 'documento assegnato', 'documenti assegnati')} alle unità proposte.`, persistent: false }
  }
  const failed = pluralize(failures.length, 'fallito', 'falliti')
  const tail = `${failed}: ${namesList(failures.map(f => f.name))}.${reasonOf(failures)}`
  if (assigned === 0) {
    return { kind: 'error', message: endSentence(`Nessun documento assegnato, ${tail}`), persistent: true }
  }
  return { kind: 'warning', message: endSentence(`${pluralize(assigned, 'assegnato', 'assegnati')}, ${tail}`), persistent: true }
}

/**
 * Un solo messaggio per tutto il ciclo di "Accetta tutte". Il numero principale
 * è quello che l'utente ha cliccato, cioè i gruppi (le righe): "N documenti
 * assegnati alle unità proposte", con "(M file in tutto)" solo se ci sono
 * versioni. Un gruppo conta come assegnato se tutti i suoi file lo sono. I
 * fallimenti si contano in file e i nomi si dicono una volta sola. Con dei
 * fallimenti il toast è persistente (i nomi vanno letti); senza, passa da solo.
 */
export function summarizeAcceptAllGroups(input: {
  groups: readonly ReviewGroup[]
  failedIds: ReadonlySet<string>
  failures: readonly BulkFailure[]
}): BulkAssignSummary {
  const { groups, failedIds, failures } = input
  const assigned = groups.filter(g => g.docs.every(d => !failedIds.has(d.id))).length
  const files = groups.reduce((n, g) => n + g.docs.length, 0)
  if (failures.length === 0) {
    if (assigned === 0) {
      return { kind: 'success', message: 'Niente da assegnare: nessuna proposta ad alta confidenza.', persistent: false }
    }
    const inAll = files > assigned ? ` (${files} file in tutto)` : ''
    return { kind: 'success', message: `${pluralize(assigned, 'documento assegnato', 'documenti assegnati')} alle unità proposte${inAll}.`, persistent: false }
  }
  const failed = pluralize(failures.length, 'file non assegnato', 'file non assegnati')
  const tail = `${failed}: ${uniqueNames(failures)}.${reasonOf(failures)}`
  if (assigned === 0) {
    return { kind: 'error', message: endSentence(`Nessun documento assegnato, ${tail}`), persistent: true }
  }
  return { kind: 'warning', message: endSentence(`${pluralize(assigned, 'documento assegnato', 'documenti assegnati')}, ${tail}`), persistent: true }
}

/**
 * Il toast di Accetta o Cambia su una riga, cioè su un gruppo: "Documento
 * assegnato a Unità 2 (2 versioni)", il totale dei file, senza parentesi se il
 * gruppo è un solo documento. Con un solo file e un errore resta il formato di
 * sempre "Nome: motivo"; con più file e fallimenti il toast è persistente e
 * dice quanti file su quanti.
 */
export function summarizeGroupAssign(input: {
  total: number
  unitLabel: string
  failures: readonly BulkFailure[]
}): BulkAssignSummary {
  const { total, unitLabel, failures } = input
  if (failures.length === 0) {
    return { kind: 'success', message: `Documento assegnato a ${unitLabel}${versionsSuffix(total)}.`, persistent: false }
  }
  return groupFailure(total, failures, `Assegnazione a ${unitLabel}`)
}

/** Come summarizeGroupAssign, per Ignora. */
export function summarizeGroupDismiss(input: { total: number; failures: readonly BulkFailure[] }): BulkAssignSummary {
  const { total, failures } = input
  if (failures.length === 0) {
    return { kind: 'success', message: `Documento lasciato senza unità${versionsSuffix(total)}: non verrà più proposto.`, persistent: false }
  }
  return groupFailure(total, failures, 'Ignora')
}

function groupFailure(total: number, failures: readonly BulkFailure[], what: string): BulkAssignSummary {
  if (total === 1) {
    return { kind: 'error', message: `${failures[0].name}: ${failures[0].error}`, persistent: true }
  }
  const done = total - failures.length
  const names = uniqueNames(failures)
  const failed = pluralize(failures.length, 'file non riuscito', 'file non riusciti')
  if (done === 0) {
    return { kind: 'error', message: endSentence(`${what}: nessun file su ${total}, ${failed}: ${names}.${reasonOf(failures)}`), persistent: true }
  }
  return { kind: 'warning', message: endSentence(`${what}: riuscita su ${done} file su ${total}, ${failed}: ${names}.${reasonOf(failures)}`), persistent: true }
}
