// ============================================================
// CasaZero — verifica della regola di assegnazione documento → unità.
// Uso:  node --experimental-strip-types scripts/verify-document-unit.mjs
//       (oppure: npm run verify:docunit)
// ------------------------------------------------------------
// COSA GARANTISCE: che checkUnitAssignment (src/lib/document-unit.ts)
// rifiuti un'unità di un'altra residenza, un'unità inesistente e una riga
// incoerente con l'id richiesto, e che classifichi bene assegnata / cambiata
// / rimossa / invariata.
//
// PERCHE' ESISTE: la FK su units(id) e la policy di scrittura di documents
// non controllano che l'unità sia della stessa residenza del documento;
// l'unico argine è questa regola, applicata dalla server action.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente; exit 2 = import fallito — mai confuso con un esito positivo.
// ============================================================

import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

const MOD = new URL('../src/lib/document-unit.ts', import.meta.url)

let mod
try {
  mod = await import(MOD.href)
} catch (err) {
  console.error(
    `\n✗ Impossibile importare il modulo: ${err.message}\n` +
    '  Rilancia con:  node --experimental-strip-types scripts/verify-document-unit.mjs\n' +
    '  (serve Node >= 22.6; da Node 23.6 il flag non è più necessario)'
  )
  process.exit(2)
}

const {
  checkUnitAssignment, UNIT_NOT_IN_RESIDENCE_ERROR,
  documentUnitChangePayload, documentUnitChangeEventUnitId, documentUnitChangeText,
} = mod

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

const R1 = 'res-1'
const R2 = 'res-2'
const unit = (id, residence_id = R1) => ({ id, residence_id })
const ok = change => ({ ok: true, change })
const ko = { ok: false, error: UNIT_NOT_IN_RESIDENCE_ERROR }

// --- assegnazione ------------------------------------------------------------
check('documento della residenza → unità della stessa residenza: assegnata',
  checkUnitAssignment({ residence_id: R1, unit_id: null }, 'u1', unit('u1')), ok('assegnata'))
check('documento di un\'unità → altra unità della residenza: cambiata',
  checkUnitAssignment({ residence_id: R1, unit_id: 'u1' }, 'u2', unit('u2')), ok('cambiata'))
check('stessa unità: invariata (nessuna scrittura)',
  checkUnitAssignment({ residence_id: R1, unit_id: 'u1' }, 'u1', unit('u1')), ok('invariata'))

// --- ritorno alla residenza ---------------------------------------------------
check('documento di un\'unità → residenza: rimossa',
  checkUnitAssignment({ residence_id: R1, unit_id: 'u1' }, null, null), ok('rimossa'))
check('documento già della residenza → residenza: invariata',
  checkUnitAssignment({ residence_id: R1, unit_id: null }, null, null), ok('invariata'))

// --- rifiuti -----------------------------------------------------------------
check('unità di un\'altra residenza (anche di un altro builder): rifiutata',
  checkUnitAssignment({ residence_id: R1, unit_id: null }, 'u9', unit('u9', R2)), ko)
check('cambio verso un\'unità di un\'altra residenza: rifiutato',
  checkUnitAssignment({ residence_id: R1, unit_id: 'u1' }, 'u9', unit('u9', R2)), ko)
check('unità inesistente (riga non trovata): rifiutata',
  checkUnitAssignment({ residence_id: R1, unit_id: null }, 'u404', null), ko)
check('riga letta con id diverso da quello richiesto: rifiutata',
  checkUnitAssignment({ residence_id: R1, unit_id: null }, 'u1', unit('u2')), ko)
check('stessa unità ma riga di altra residenza (dato incoerente): rifiutata, non "invariata"',
  checkUnitAssignment({ residence_id: R1, unit_id: 'u1' }, 'u1', unit('u1', R2)), ko)

// --- evento documento_unita_cambiata (051) -------------------------------
check('payload piatto: esattamente le cinque chiavi del contratto',
  documentUnitChangePayload({ documentId: 'd1', title: 'APE interno 3', docType: 'ape', fromUnitId: null, toUnitId: 'u1' }),
  { document_id: 'd1', title: 'APE interno 3', doc_type: 'ape', from_unit_id: null, to_unit_id: 'u1' })
check('payload: titolo e tipo possono essere null',
  Object.keys(documentUnitChangePayload({ documentId: 'd1', title: null, docType: null, fromUnitId: 'u1', toUnitId: null })),
  ['document_id', 'title', 'doc_type', 'from_unit_id', 'to_unit_id'])
check('unit_id dell\'evento: destinazione, o origine se torna alla residenza',
  [documentUnitChangeEventUnitId(null, 'u2'), documentUnitChangeEventUnitId('u1', 'u2'), documentUnitChangeEventUnitId('u1', null)],
  ['u2', 'u2', 'u1'])
check('frase: assegnato', documentUnitChangeText({ title: 'APE', from_unit_id: null, to_unit_id: 'u1' }), 'Documento «APE» assegnato a un’unità')
check('frase: spostato', documentUnitChangeText({ title: 'APE', from_unit_id: 'u1', to_unit_id: 'u2' }), 'Documento «APE» spostato in un’altra unità')
check('frase: riportato alla residenza', documentUnitChangeText({ title: 'APE', from_unit_id: 'u1', to_unit_id: null }), 'Documento «APE» riportato alla residenza')
check('frase: senza titolo', documentUnitChangeText({ from_unit_id: null, to_unit_id: 'u1' }), 'Documento assegnato a un’unità')
check('frase: payload vuoto o vecchio → null (ripiego neutro)',
  [documentUnitChangeText({}), documentUnitChangeText({ title: 'X' }), documentUnitChangeText({ from_unit_id: 5, to_unit_id: '' })], [null, null, null])

// --- esito -------------------------------------------------------------------
if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
process.exit(0)
