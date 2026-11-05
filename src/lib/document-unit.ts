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
