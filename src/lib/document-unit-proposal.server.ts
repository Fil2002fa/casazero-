/**
 * Scrittura della proposta di unità di un documento (E1b). Usata dalle route
 * di classificazione ed estrazione DOPO che hanno scritto il loro esito, e mai
 * al caricamento di una pagina. Il calcolo è in document-unit-proposal.ts.
 *
 * Va chiamata con il service client (le route lo hanno già, dopo aver
 * verificato il perimetro dell'utente). Non assegna mai l'unità: scrive solo
 * proposed_unit_id e la fascia. Non solleva: un guasto qui non deve far
 * fallire la classificazione già riuscita, quindi torna un esito e logga.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { DOCUMENT_ROW_SELECT, toDocRow } from './document-rows.server'
import { unitProposalFor } from './document-unit-proposal'

export type RefreshUnitProposalResult =
  | { ok: true; written: boolean }
  | { ok: false }

export async function refreshUnitProposal(
  svc: SupabaseClient,
  documentId: string,
): Promise<RefreshUnitProposalResult> {
  const { data: raw, error: docError } = await svc
    .from('documents')
    .select(`residence_id, ${DOCUMENT_ROW_SELECT}`)
    .eq('id', documentId)
    .maybeSingle()
  if (docError) {
    console.error('[unit-proposal] lettura documento fallita', { documentId, code: docError.code, message: docError.message })
    return { ok: false }
  }
  if (!raw) return { ok: true, written: false }

  const row = raw as unknown as Record<string, unknown>
  const doc = toDocRow(row)
  // Già assegnato o ignorato: niente da proporre, nessuna lettura delle unità.
  if (doc.unit_id !== null || doc.unit_proposal_dismissed_at !== null) return { ok: true, written: false }

  const { data: units, error: unitsError } = await svc
    .from('units')
    .select('id, label')
    .eq('residence_id', row.residence_id as string)
  if (unitsError) {
    console.error('[unit-proposal] lettura unità fallita', { documentId, code: unitsError.code, message: unitsError.message })
    return { ok: false }
  }

  const proposal = unitProposalFor(doc, (units ?? []) as Array<{ id: string; label: string }>)
  const nextUnit = proposal?.unitId ?? null
  const nextConfidence = proposal?.confidence ?? null
  if (nextUnit === doc.proposed_unit_id && nextConfidence === doc.unit_proposal_confidence) {
    return { ok: true, written: false }
  }

  // Le condizioni di idoneità si ripetono nel WHERE: se nel frattempo una
  // persona ha assegnato o ignorato il documento, l'update non tocca niente.
  const { error: updateError } = await svc
    .from('documents')
    .update({ proposed_unit_id: nextUnit, unit_proposal_confidence: nextConfidence })
    .eq('id', documentId)
    .is('unit_id', null)
    .is('unit_proposal_dismissed_at', null)
  if (updateError) {
    console.error('[unit-proposal] scrittura fallita', { documentId, code: updateError.code, message: updateError.message })
    return { ok: false }
  }
  return { ok: true, written: true }
}
