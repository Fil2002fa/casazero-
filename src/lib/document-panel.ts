/**
 * Logica pura del pannello laterale del documento (E1b): quali campi si
 * mostrano, che cosa cambia al Salva, quali campi sono "modificati rispetto
 * all'AI". Nessun client Supabase: lo usa DocumentPanel.tsx e lo verifica
 * scripts/verify-document-panel.mjs.
 *
 * Ambito e Unità di riferimento NON sono campi del pannello: l'unità si cambia
 * in un solo posto, il select "Unità". Il testo letto nel documento si mostra
 * a parte, in sola lettura (readInDocumentText). Le correzioni già salvate su
 * quelle due chiavi restano valide nel dato effettivo (Excel compreso), ma non
 * si creano più da qui.
 *
 * Import relativi tra moduli di lib: vedi document-rows.ts.
 */
import { docTypeHasSistema, type DocType, type Sistema } from './document-classification'
import type { CorrectionField } from './document-overrides'
import { canCorrectFields, correctionFields, isReviewClosed, type DocRow } from './document-rows'
import { proposalSourceText } from './document-unit-proposal'

export const HIDDEN_PANEL_FIELD_KEYS: readonly string[] = ['ambito', 'unita_riferimento']

/**
 * Campi correggibili del documento, senza ambito e unità di riferimento. Vuoti
 * se non c'è un'estrazione corrente (stesso gate di canCorrectFields).
 */
export function panelFields(doc: DocRow): CorrectionField[] {
  if (!canCorrectFields(doc)) return []
  return correctionFields(doc).filter(f => !HIDDEN_PANEL_FIELD_KEYS.includes(f.key))
}

/** "Letto nel documento: Interno A2": il testo dell'unità come lo leggerebbe la proposta. */
export function readInDocumentText(doc: DocRow): string | null {
  return proposalSourceText(doc)
}

function norm(value: string | null | undefined): string {
  return (value ?? '').trim()
}

/** Il valore in bozza si discosta da quello dell'AI: la riga "Valore AI" diventa ambra. */
export function differsFromAi(field: CorrectionField, draft: string): boolean {
  return norm(draft) !== norm(field.ai)
}

export type FieldChange = { key: string; action: 'save' | 'clear'; value: string }

/**
 * Che cosa scrivere per le bozze. Un campo invariato non si tocca. Un campo
 * che torna al valore dell'AI, se aveva una correzione manuale, la toglie
 * (clear) invece di salvarne una uguale all'AI. Il resto è un salvataggio;
 * un valore vuoto vale "il documento non lo riporta".
 */
export function planFieldChanges(fields: readonly CorrectionField[], drafts: Readonly<Record<string, string>>): FieldChange[] {
  const changes: FieldChange[] = []
  for (const field of fields) {
    const draft = norm(drafts[field.key] ?? field.effective)
    if (draft === norm(field.effective)) continue
    if (field.provenance.source === 'manuale' && draft === norm(field.ai)) {
      changes.push({ key: field.key, action: 'clear', value: '' })
    } else {
      changes.push({ key: field.key, action: 'save', value: draft })
    }
  }
  return changes
}

/** Chiavi con una correzione manuale in vigore: quelle che "Ripristina valori AI" toglie. */
export function manualFieldKeys(fields: readonly CorrectionField[]): string[] {
  return fields.filter(f => f.provenance.source === 'manuale').map(f => f.key)
}

/**
 * Il pannello si apre in modalità revisione se la classificazione non è chiusa:
 * il Salva conferma anche il tipo, anche se non è stato toccato.
 */
export function panelNeedsConfirmation(doc: Pick<DocRow, 'classification_status'>): boolean {
  return !isReviewClosed(doc)
}

/**
 * Il sistema (impianto) da scrivere per il tipo scelto: quello del select solo
 * se il tipo riguarda un impianto, altrimenti null. Evita che un impianto
 * lasciato dal tipo precedente resti attaccato a un APE o a un'agibilità.
 */
export function effectiveSistema(docType: DocType | null, sistema: Sistema | '' | null): Sistema | null {
  if (!docTypeHasSistema(docType) || sistema === '' || sistema === null) return null
  return sistema
}

export type PanelDraft = {
  docType: string | null
  sistema: string | null
  unitId: string | null
  fields: Readonly<Record<string, string>>
}

/** Che cosa dovrà fare il Salva, in ordine: classificazione, unità, campi. */
export type SavePlan = {
  classification: boolean
  unit: boolean
  fields: FieldChange[]
}

export function planPanelSave(doc: DocRow, draft: PanelDraft): SavePlan {
  const typeChanged = draft.docType !== (doc.doc_type ?? null) || draft.sistema !== (doc.sistema ?? null)
  const classification = typeChanged || panelNeedsConfirmation(doc)
  const unit = draft.unitId !== (doc.unit_id ?? null)
  // Con un tipo diverso i campi sono quelli del tipo nuovo, che non ha ancora
  // un'estrazione: le bozze dei campi non si applicano, i dati si leggeranno dopo.
  const fields = typeChanged ? [] : planFieldChanges(panelFields(doc), draft.fields)
  return { classification, unit, fields }
}

export function savePlanIsEmpty(plan: SavePlan): boolean {
  return !plan.classification && !plan.unit && plan.fields.length === 0
}
