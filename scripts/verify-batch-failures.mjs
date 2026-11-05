// ============================================================
// CasaZero — verifica della causa dei fallimenti nei batch AI.
// Uso:  node --experimental-strip-types scripts/verify-batch-failures.mjs
//       (oppure: npm run verify:batch)
// ------------------------------------------------------------
// COSA GARANTISCE: che classifyBatchFailure (src/lib/batch-failures.ts)
// traduca cause e status HTTP in una causa fissa e che l'esito del batch sia
// leggibile (conteggio pluralizzato, cause distinte in ordine fisso). Che il
// messaggio grezzo della route non compaia è garantito dalla firma: le
// funzioni ricevono solo status e cause, mai `error`.
//
// PERCHE' ESISTE: nel ramo document_error le route rispondono con
// err.message dell'SDK o del parser: mostrarlo a schermo esporrebbe testo
// interno e in inglese. Il test sta qui perché il client component non si
// esegue fuori da Next.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente; exit 2 = import fallito — mai confuso con un esito positivo.
// ============================================================

import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

const MOD = new URL('../src/lib/batch-failures.ts', import.meta.url)

let mod
try {
  mod = await import(MOD.href)
} catch (err) {
  console.error(
    `\n✗ Impossibile importare il modulo: ${err.message}\n` +
    '  Rilancia con:  node --experimental-strip-types scripts/verify-batch-failures.mjs\n' +
    '  (serve Node >= 22.6; da Node 23.6 il flag non è più necessario)'
  )
  process.exit(2)
}

const { classifyBatchFailure, describeBatchFailureReasons, batchFailureMessage } = mod

let fallimenti = 0
let eseguiti = 0

function check(label, ottenuto, atteso) {
  eseguiti++
  const a = JSON.stringify(ottenuto)
  const b = JSON.stringify(atteso)
  if (a === b) return
  fallimenti++
  console.error(`✗ ${label}\n    atteso:   ${b}\n    ottenuto: ${a}`)
}

// --- classificazione della causa -------------------------------------------
check('rete caduta (nessuna risposta) → connessione', classifyBatchFailure({ status: null, cause: undefined }), 'connessione')
check('document_error (502) → documento non analizzabile', classifyBatchFailure({ status: 502, cause: 'document_error' }), 'documento_non_analizzabile')
check('write_error (500) → errore di salvataggio', classifyBatchFailure({ status: 500, cause: 'write_error' }), 'errore_salvataggio')
check('401 → sessione scaduta', classifyBatchFailure({ status: 401, cause: undefined }), 'sessione_scaduta')
check('403 e 404 → non accessibile', [403, 404].map(status => classifyBatchFailure({ status, cause: undefined })), ['non_accessibile', 'non_accessibile'])
check('5xx senza cause (risposta non JSON) → errore del server', classifyBatchFailure({ status: 500, cause: undefined }), 'errore_server')
check('400 senza cause → errore del server', classifyBatchFailure({ status: 400, cause: null }), 'errore_server')
check('la cause prevale sullo status (document_error con 404)', classifyBatchFailure({ status: 404, cause: 'document_error' }), 'documento_non_analizzabile')
check('cause sconosciuta → si guarda lo status', classifyBatchFailure({ status: 401, cause: 'qualcosa' }), 'sessione_scaduta')

// --- testo ------------------------------------------------------------------
check('cause distinte, ordine fisso, senza doppioni',
  describeBatchFailureReasons(['connessione', 'documento_non_analizzabile', 'connessione', 'errore_salvataggio']),
  'documento non leggibile o non analizzabile, errore tecnico nel salvataggio, connessione non riuscita')
check('nessuna causa → stringa vuota', describeBatchFailureReasons([]), '')

const base = { singular: 'documento non classificato', plural: 'documenti non classificati', retryText: 'riprova con Classifica documenti.' }
check('esito con una causa, singolare',
  batchFailureMessage({ ...base, count: 1, reasons: ['documento_non_analizzabile'] }),
  '1 documento non classificato — riprova con Classifica documenti. Causa: documento non leggibile o non analizzabile.')
check('esito con più cause, plurale',
  batchFailureMessage({ ...base, count: 3, reasons: ['connessione', 'errore_server'] }),
  '3 documenti non classificati — riprova con Classifica documenti. Causa: errore tecnico del server, connessione non riuscita.')
check('esito senza cause note: come prima, senza "Causa"',
  batchFailureMessage({ ...base, count: 2, reasons: [] }),
  '2 documenti non classificati — riprova con Classifica documenti.')

// --- esito -------------------------------------------------------------------
if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
process.exit(0)
