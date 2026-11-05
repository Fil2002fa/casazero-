/**
 * Causa di un fallimento nei batch di classificazione ed estrazione, in parole
 * che chi legge lo schermo può usare. Modulo puro, verificato da
 * scripts/verify-batch-failures.mjs.
 *
 * PERCHE' NON SI MOSTRA `result.error`: nel ramo `document_error` le route AI
 * rispondono con `err.message` grezzo (errori dell'SDK, parsing, rifiuti del
 * modello), che non è scritto per l'utente e può contenere dettagli interni.
 * Si traduce `cause` (e lo status HTTP quando manca) in una causa fissa; il
 * messaggio grezzo resta nel log del server e nella console.
 *
 * `service_unavailable` e `not_extractable` NON passano di qui: hanno già il
 * loro trattamento (banner di pagina, nessun conteggio).
 */
import { pluralize } from './pluralize'

export type BatchFailureReason =
  | 'documento_non_analizzabile'
  | 'errore_salvataggio'
  | 'sessione_scaduta'
  | 'non_accessibile'
  | 'errore_server'
  | 'connessione'

const REASON_LABELS: Record<BatchFailureReason, string> = {
  documento_non_analizzabile: 'documento non leggibile o non analizzabile',
  errore_salvataggio: 'errore tecnico nel salvataggio',
  sessione_scaduta: 'sessione scaduta, accedi di nuovo',
  non_accessibile: 'documento non trovato o non accessibile',
  errore_server: 'errore tecnico del server',
  connessione: 'connessione non riuscita',
}

// Ordine fisso di presentazione: prima le cause che dipendono dal documento.
const REASON_ORDER: BatchFailureReason[] = [
  'documento_non_analizzabile',
  'errore_salvataggio',
  'errore_server',
  'sessione_scaduta',
  'non_accessibile',
  'connessione',
]

/**
 * `status` null = la richiesta non è arrivata (rete caduta, fetch che lancia).
 * `cause` è il campo `cause` del JSON della route, se c'era.
 */
export function classifyBatchFailure(input: { status: number | null; cause: unknown }): BatchFailureReason {
  if (input.status === null) return 'connessione'
  if (input.cause === 'document_error') return 'documento_non_analizzabile'
  if (input.cause === 'write_error') return 'errore_salvataggio'
  if (input.status === 401) return 'sessione_scaduta'
  if (input.status === 403 || input.status === 404) return 'non_accessibile'
  return 'errore_server'
}

/** "documento non leggibile o non analizzabile, connessione non riuscita"; stringa vuota se non ci sono cause. */
export function describeBatchFailureReasons(reasons: readonly BatchFailureReason[]): string {
  const present = new Set(reasons)
  return REASON_ORDER.filter(r => present.has(r)).map(r => REASON_LABELS[r]).join(', ')
}

/**
 * Riga di esito di un batch: "2 documenti non classificati — riprova con
 * Classifica documenti. Causa: …". Il nome e il bottone da riprovare li decide
 * il chiamante (`singular`, `plural`, `retryText`); la causa si aggiunge solo
 * se nota.
 */
export function batchFailureMessage(input: {
  count: number
  singular: string
  plural: string
  retryText: string
  reasons: readonly BatchFailureReason[]
}): string {
  const head = `${pluralize(input.count, input.singular, input.plural)} — ${input.retryText}`
  const cause = describeBatchFailureReasons(input.reasons)
  return cause ? `${head} Causa: ${cause}.` : head
}
