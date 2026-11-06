// ============================================================
// CasaZero — verifica del tipo atteso al caricamento (E1b, 6b-1).
// Uso:  node --experimental-strip-types scripts/verify-expected-doc-type.mjs
//       (oppure: npm run verify:expected)
// ------------------------------------------------------------
// COSA GARANTISCE: le regole che la route classify-document applica al
// parametro opzionale expected_doc_type, senza chiamare l'AI:
//   - parametro assente: comportamento invariato (solo la soglia 0,8);
//   - atteso = letto: si chiude (completata) se sopra soglia;
//   - atteso ≠ letto: da_revisionare ANCHE con confidenza alta, con mismatch;
//   - parametro non valido (stringa non ammessa, vuota, numero, oggetto):
//     rifiutato, mai ignorato in silenzio (la route risponde 400).
//
// PERCHE' ESISTE: un caricamento dalla cella "APE" che l'AI legge come garanzia
// con confidenza 0,95 si chiuderebbe da solo come garanzia, e la cella APE
// resterebbe vuota senza che nessuno veda dove è finito il documento.
//
// Exit: 0 = ok; 1 = caso divergente; 2 = import fallito.
// ============================================================
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let mod
try {
  mod = await import(new URL('../src/lib/document-classification.ts', import.meta.url).href)
} catch (err) {
  console.error(`\n✗ Impossibile importare il modulo: ${err.message}`)
  process.exit(2)
}
const { parseExpectedDocType, classificationOutcome, expectedMismatchMessage, DOC_TYPES, CLASSIFICATION_CONFIDENCE_THRESHOLD } = mod

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

// --- il parametro --------------------------------------------------------------------
check('assente (undefined): nessuna attesa', parseExpectedDocType(undefined), { ok: true, expected: null })
check('null: nessuna attesa', parseExpectedDocType(null), { ok: true, expected: null })
check('ogni doc_type ammesso è accettato', DOC_TYPES.map(t => parseExpectedDocType(t).ok), DOC_TYPES.map(() => true))
check('ape accettato com\'è', parseExpectedDocType('ape'), { ok: true, expected: 'ape' })
check('stringa non ammessa: rifiutata', parseExpectedDocType('contratto'), { ok: false })
check('stringa vuota: rifiutata, non ignorata', parseExpectedDocType(''), { ok: false })
check('maiuscole diverse: rifiutata', parseExpectedDocType('APE'), { ok: false })
check('numero: rifiutato', parseExpectedDocType(3), { ok: false })
check('oggetto: rifiutato', parseExpectedDocType({ type: 'ape' }), { ok: false })
check('array: rifiutato', parseExpectedDocType(['ape']), { ok: false })
check('false: rifiutato', parseExpectedDocType(false), { ok: false })

// --- l'esito -------------------------------------------------------------------------
const esito = (confidence, docType, expected) => classificationOutcome({ confidence, docType, expected })
check('parametro assente, confidenza alta: completata', esito(0.95, 'garanzia', null), { status: 'completata', mismatch: false })
check('parametro assente, confidenza alla soglia: completata', esito(CLASSIFICATION_CONFIDENCE_THRESHOLD, 'garanzia', null), { status: 'completata', mismatch: false })
check('parametro assente, sotto soglia: da_revisionare', esito(0.79, 'garanzia', null), { status: 'da_revisionare', mismatch: false })
check('atteso = letto, confidenza alta: completata', esito(0.95, 'ape', 'ape'), { status: 'completata', mismatch: false })
check('atteso = letto, sotto soglia: da_revisionare senza mismatch', esito(0.5, 'ape', 'ape'), { status: 'da_revisionare', mismatch: false })
check('atteso ≠ letto, confidenza alta: da_revisionare con mismatch', esito(0.99, 'garanzia', 'ape'), { status: 'da_revisionare', mismatch: true })
check('atteso ≠ letto, sotto soglia: da_revisionare con mismatch', esito(0.4, 'garanzia', 'ape'), { status: 'da_revisionare', mismatch: true })
check('atteso ≠ letto, letto "altro": da_revisionare con mismatch', esito(0.99, 'altro', 'ape'), { status: 'da_revisionare', mismatch: true })

// --- il messaggio --------------------------------------------------------------------
check('nessun disallineamento: nessun messaggio', expectedMismatchMessage([]), null)
check('un disallineamento: nomina i due tipi',
  expectedMismatchMessage([{ expected: 'ape', actual: 'garanzia' }]),
  'Sembra «Garanzia», non «Attestato di prestazione energetica»: controlla.')
check('più disallineamenti: un solo messaggio con il conteggio',
  expectedMismatchMessage([{ expected: 'ape', actual: 'garanzia' }, { expected: 'ape', actual: 'altro' }]),
  '2 documenti non corrispondono al tipo atteso: controllali.')

if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
process.exit(0)
