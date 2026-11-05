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

const { checkUnitAssignment, UNIT_NOT_IN_RESIDENCE_ERROR } = mod

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

// --- esito -------------------------------------------------------------------
if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
process.exit(0)
