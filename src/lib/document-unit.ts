/**
 * Assegnazione di un documento a un'unità (o ritorno alla residenza):
 * regola pura, senza client Supabase, verificata da
 * scripts/verify-document-unit.mjs.
 *
 * PERCHE' ESISTE: documents.unit_id ha solo una FK su units(id) e la policy
 * di scrittura "documents: admin e super_admin gestiscono" controlla la
 * residenza del documento, non l'unità. Senza questo controllo un'unità di
 * un'altra residenza (o di un altro builder) sarebbe agganciabile a un
 * documento. Lo applica la server action setDocumentUnit prima di scrivere.
 */

export type UnitAssignmentChange = 'assegnata' | 'cambiata' | 'rimossa' | 'invariata'

export type UnitAssignmentCheck =
  | { ok: true; change: UnitAssignmentChange }
  | { ok: false; error: string }

// ------------------------------------------------------------
// Registro attività: evento documento_unita_cambiata (migrazione 051)
// ------------------------------------------------------------

export type DocumentUnitChangePayload = {
  document_id: string
  title: string | null
  doc_type: string | null
  from_unit_id: string | null
  to_unit_id: string | null
}

/** Payload piatto dell'evento: solo id e codici, mai frasi (contratto in 051). */
export function documentUnitChangePayload(input: {
  documentId: string
  title: string | null
  docType: string | null
  fromUnitId: string | null
  toUnitId: string | null
}): DocumentUnitChangePayload {
  return {
    document_id: input.documentId,
    title: input.title,
    doc_type: input.docType,
    from_unit_id: input.fromUnitId,
    to_unit_id: input.toUnitId,
  }
}

/** Colonna unit_id dell'evento: la destinazione, o l'origine se torna alla residenza. */
export function documentUnitChangeEventUnitId(fromUnitId: string | null, toUnitId: string | null): string | null {
  return toUnitId ?? fromUnitId
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Frase a schermo, dal payload. Il payload è JSONB non vincolato: ogni chiave
 * si legge in difesa. null se il payload non dice che cosa è successo (il
 * chiamante ripiega sull'etichetta neutra). Le etichette delle unità non sono
 * nel payload: la riga del registro mostra già l'unità come soggetto.
 */
export function documentUnitChangeText(payload: Record<string, unknown>): string | null {
  const from = str(payload.from_unit_id)
  const to = str(payload.to_unit_id)
  if (from === null && to === null) return null
  const title = str(payload.title)
  const head = title ? `Documento «${title}»` : 'Documento'
  if (from === null) return `${head} assegnato a un’unità`
  if (to === null) return `${head} riportato alla residenza`
  return `${head} spostato in un’altra unità`
}

export const UNIT_NOT_IN_RESIDENCE_ERROR = 'Unità non trovata in questa residenza'

/**
 * `newUnitId` null = documento della residenza. `targetUnit` è la riga di
 * `units` letta per `newUnitId` (null se non esiste): deve appartenere alla
 * stessa residenza del documento.
 */
export function checkUnitAssignment(
  doc: { residence_id: string; unit_id: string | null },
  newUnitId: string | null,
  targetUnit: { id: string; residence_id: string } | null,
): UnitAssignmentCheck {
  if (newUnitId === null) {
    return { ok: true, change: doc.unit_id === null ? 'invariata' : 'rimossa' }
  }
  if (!targetUnit || targetUnit.id !== newUnitId || targetUnit.residence_id !== doc.residence_id) {
    return { ok: false, error: UNIT_NOT_IN_RESIDENCE_ERROR }
  }
  if (doc.unit_id === newUnitId) return { ok: true, change: 'invariata' }
  return { ok: true, change: doc.unit_id === null ? 'assegnata' : 'cambiata' }
}
