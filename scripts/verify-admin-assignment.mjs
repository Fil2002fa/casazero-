// ============================================================
// CasaZero — verifica dell'esito della scrittura dell'assegnazione admin.
// Uso:  node --experimental-strip-types scripts/verify-admin-assignment.mjs
//       (oppure: npm run verify:assegnazione)
// ------------------------------------------------------------
// COSA GARANTISCE: che classifyAssignmentWrite (src/lib/admin-assignment-outcome.ts)
// separi i quattro esiti dell'INSERT su admin_assignments: assegnata, già
// assegnata allo stesso profilo (successo ripetibile), occupata da un altro admin
// (esito di dominio, mai sostituzione) e guasto tecnico.
//
// PERCHE' ESISTE: l'accettazione dell'invito admin usava un upsert con
// onConflict 'profile_id,residence_id', ma il DB ha solo UNIQUE(residence_id):
// errore 42P10 su ogni accettazione, mostrato come "errore temporaneo". Il test
// sta qui perché accept-invite.ts usa il service client e non si esegue fuori
// da Next. Lo script verifica la regola di decisione, non la scrittura sul DB.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente; exit 2 = import fallito — mai confuso con un esito positivo.
// ============================================================

import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

const MOD = new URL('../src/lib/admin-assignment-outcome.ts', import.meta.url)

let mod
try {
  mod = await import(MOD.href)
} catch (err) {
  console.error(
    `\n✗ Impossibile importare il modulo: ${err.message}\n` +
    '  Rilancia con:  node --experimental-strip-types scripts/verify-admin-assignment.mjs\n' +
    '  (serve Node >= 22.6; da Node 23.6 il flag non è più necessario)'
  )
  process.exit(2)
}

const { classifyAssignmentWrite, UNIQUE_VIOLATION } = mod

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

const ME = 'adca9258-e162-4e74-b462-ab9e804a90e3'
const OTHER = '7a210c85-7816-4d5f-b802-176505947469'

check('il codice di conflitto è 23505', UNIQUE_VIOLATION, '23505')

// --- successo ---------------------------------------------------------------
check('insert riuscito → assegnata',
  classifyAssignmentWrite({ errorCode: null, existingProfileId: null, userId: ME }), 'assegnata')
check('insert riuscito: la riga riletta non conta',
  classifyAssignmentWrite({ errorCode: null, existingProfileId: OTHER, userId: ME }), 'assegnata')

// --- conflitto di dominio ---------------------------------------------------
check('23505 con la riga dello stesso profilo → già assegnata (successo ripetibile)',
  classifyAssignmentWrite({ errorCode: '23505', existingProfileId: ME, userId: ME }), 'gia_assegnata')
check('23505 con la riga di un altro admin → esito di dominio, mai sostituzione',
  classifyAssignmentWrite({ errorCode: '23505', existingProfileId: OTHER, userId: ME }), 'altro_admin')

// --- guasti tecnici ---------------------------------------------------------
check('23505 ma la riga non si rilegge (sparita) → tecnico, riprova',
  classifyAssignmentWrite({ errorCode: '23505', existingProfileId: null, userId: ME }), 'tecnico')
check('42P10 (nessun vincolo corrispondente) → tecnico, non un conflitto di dominio',
  classifyAssignmentWrite({ errorCode: '42P10', existingProfileId: OTHER, userId: ME }), 'tecnico')
check('23503 (FK) → tecnico',
  classifyAssignmentWrite({ errorCode: '23503', existingProfileId: null, userId: ME }), 'tecnico')
check('42501 (permessi) → tecnico',
  classifyAssignmentWrite({ errorCode: '42501', existingProfileId: ME, userId: ME }), 'tecnico')
check('errore senza codice noto → tecnico, anche con la riga dello stesso profilo',
  classifyAssignmentWrite({ errorCode: 'PGRST000', existingProfileId: ME, userId: ME }), 'tecnico')
check('errore con codice vuoto → tecnico',
  classifyAssignmentWrite({ errorCode: '', existingProfileId: ME, userId: ME }), 'tecnico')

// --- esito -------------------------------------------------------------------
if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
process.exit(0)
