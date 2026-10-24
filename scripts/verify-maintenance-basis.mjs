// ============================================================
// CasaZero — verifica della cascata delle date di consegna.
// Uso:  node --experimental-strip-types scripts/verify-maintenance-basis.mjs
//       (oppure: npm run verify:basis)
// ------------------------------------------------------------
// COSA GARANTISCE: che resolveDueBasis (src/lib/maintenance-due.ts) risalga i
// livelli nell'ordine giusto, che restituisca il livello accanto alla data, e
// soprattutto il CANCELLO: una voce di unita senza data di consegna da null, e
// nessun livello piu generico puo farla partire — nemmeno una data di
// categoria, nemmeno quella della residenza. L'unica eccezione e l'override
// manuale di voce.
//
//   voce di unita        override voce > [unita consegnata: categoria > unita] > NULL
//   voce di parti comuni override voce > categoria > residenza > NULL
//
// PERCHE' ESISTE: quel singolo fallback e il difetto da cui e partito tutto il
// blocco (un'unita invenduta con le scadenze di una consegnata il giorno della
// fine lavori). Il tipo DueBasisInput non espone residenceDate sul ramo 'unit',
// ma i tipi spariscono a runtime: i casi ANTI-REGRESSIONE in coda passano
// davvero un residenceDate di troppo e pretendono che venga ignorato.
//
// PERCHE' NON E' UN TEST UNITARIO: il repo non ha un test runner; lo script
// segue il pattern di scripts/verify-maintenance-due.mjs.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente (atteso vs ottenuto); exit 2 = import fallito — mai confuso con
// un esito positivo. Nota sulla forma del fallimento: se la cascata torna a
// ricadere sulla residenza, i casi anti-regressione finiscono per leggere un
// residenceDate assente e lo script muore con un errore non catturato (exit 1
// con stack trace), invece dell'elenco ordinato dei casi divergenti. E
// comunque un fallimento, e il messaggio nomina la colonna sbagliata letta:
// provato con mutation test il 24/10.
// ============================================================

import { register } from 'node:module'
// Import relativi senza estensione nei moduli di lib: vedi
// scripts/ts-resolve-hooks.mjs.
register('./ts-resolve-hooks.mjs', import.meta.url)

const DUE = new URL('../src/lib/maintenance-due.ts', import.meta.url)

let due
try {
  due = await import(DUE.href)
} catch (err) {
  console.error(
    `\n✗ Impossibile importare il modulo: ${err.message}\n` +
    '  Rilancia con:  node --experimental-strip-types scripts/verify-maintenance-basis.mjs\n' +
    '  (serve Node >= 22.6; da Node 23.6 il flag non è più necessario)'
  )
  process.exit(2)
}

const { resolveDueBasis, nextDueFrom } = due

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

function checkThrows(label, fn) {
  eseguiti++
  try {
    const ottenuto = fn()
    fallimenti++
    console.error(`✗ ${label}\n    atteso:   un errore\n    ottenuto: ${JSON.stringify(ottenuto)}`)
  } catch {
    /* atteso */
  }
}

// --- fixture ---------------------------------------------------------------
// Quattro date distinte, una per livello: cosi un livello letto al posto di un
// altro non puo passare per caso.
const D_VOCE      = '2026-01-10'
const D_CATEGORIA = '2026-02-20'
const D_UNITA     = '2026-03-30'
const D_RESIDENZA = '2026-04-15'

const unit = (over = {}) => ({
  scope: 'unit', itemOverride: null, categoryDate: null, unitDate: null, ...over,
})
const cond = (over = {}) => ({
  scope: 'condominium', itemOverride: null, categoryDate: null, residenceDate: null, ...over,
})

const V = (date, level) => ({ date, level })
const NESSUNA = { date: null, level: null }

// --- precedenza: la voce vince su tutto -----------------------------------
check('unita: voce batte categoria e unita',
  resolveDueBasis(unit({ itemOverride: D_VOCE, categoryDate: D_CATEGORIA, unitDate: D_UNITA })),
  V(D_VOCE, 'voce'))
check('parti comuni: voce batte categoria e residenza',
  resolveDueBasis(cond({ itemOverride: D_VOCE, categoryDate: D_CATEGORIA, residenceDate: D_RESIDENZA })),
  V(D_VOCE, 'voce'))

// --- precedenza: la categoria quando non c'e la voce ----------------------
check('unita: categoria batte unita',
  resolveDueBasis(unit({ categoryDate: D_CATEGORIA, unitDate: D_UNITA })),
  V(D_CATEGORIA, 'categoria'))
check('parti comuni: categoria batte residenza',
  resolveDueBasis(cond({ categoryDate: D_CATEGORIA, residenceDate: D_RESIDENZA })),
  V(D_CATEGORIA, 'categoria'))

// --- ultimo livello utile di ciascun ambito -------------------------------
check('unita: scende fino alla data dell unita',
  resolveDueBasis(unit({ unitDate: D_UNITA })), V(D_UNITA, 'unita'))
check('parti comuni: scendono fino alla data della residenza',
  resolveDueBasis(cond({ residenceDate: D_RESIDENZA })), V(D_RESIDENZA, 'residenza'))

// --- NULL: nessun livello ha una data -------------------------------------
check('unita non consegnata: nessuna data, nessun livello',
  resolveDueBasis(unit()), NESSUNA)
// IL CANCELLO: una data di categoria NON fa partire un'unita non consegnata.
// La categoria sta sopra la data dell'unita ma sotto il cancello.
check('unita non consegnata + categoria: resta fermo',
  resolveDueBasis(unit({ categoryDate: D_CATEGORIA })), NESSUNA)
check('unita CONSEGNATA + categoria: la categoria scavalca la data unita',
  resolveDueBasis(unit({ categoryDate: D_CATEGORIA, unitDate: D_UNITA })),
  V(D_CATEGORIA, 'categoria'))
check('unita non consegnata + categoria + override: vince l override',
  resolveDueBasis(unit({ itemOverride: D_VOCE, categoryDate: D_CATEGORIA })),
  V(D_VOCE, 'voce'))
check('parti comuni senza data di residenza: nessuna data',
  resolveDueBasis(cond()), NESSUNA)
check('override su unita non consegnata: vince l override',
  resolveDueBasis(unit({ itemOverride: D_VOCE })), V(D_VOCE, 'voce'))

// --- orario scartato: una scadenza e una data di calendario --------------
check('voce con timestamp',
  resolveDueBasis(unit({ itemOverride: '2026-01-10T23:30:00.000Z' })), V(D_VOCE, 'voce'))
check('categoria con spazio e offset',
  resolveDueBasis(unit({ categoryDate: '2026-02-20 10:00:00+02', unitDate: D_UNITA })), V(D_CATEGORIA, 'categoria'))
check('unita con timestamp',
  resolveDueBasis(unit({ unitDate: '2026-03-30T00:00:00Z' })), V(D_UNITA, 'unita'))
check('residenza con timestamp',
  resolveDueBasis(cond({ residenceDate: '2026-04-15T12:00:00Z' })), V(D_RESIDENZA, 'residenza'))

// --- date malformate: lanciano, non producono una base -------------------
checkThrows('voce non ISO',             () => resolveDueBasis(unit({ itemOverride: '10/01/2026' })))
checkThrows('categoria inesistente',    () => resolveDueBasis(unit({ categoryDate: '2026-02-31', unitDate: D_UNITA })))
checkThrows('unita 29 feb non bisest.', () => resolveDueBasis(unit({ unitDate: '2026-02-29' })))
checkThrows('residenza mese 13',        () => resolveDueBasis(cond({ residenceDate: '2026-13-01' })))
checkThrows('voce stringa vuota',       () => resolveDueBasis(unit({ itemOverride: '' })))
checkThrows('categoria stringa vuota',  () => resolveDueBasis(unit({ categoryDate: '', unitDate: D_UNITA })))
checkThrows('unita stringa vuota',      () => resolveDueBasis(unit({ unitDate: '' })))
checkThrows('residenza stringa vuota',  () => resolveDueBasis(cond({ residenceDate: '' })))

// --- un livello corrotto piu in basso non viene nemmeno guardato ---------
// La cascata si ferma al primo livello valorizzato: un dato corrotto sotto non
// deve far fallire una risoluzione che non lo legge.
check('voce valida sopra una unita corrotta',
  resolveDueBasis(unit({ itemOverride: D_VOCE, unitDate: 'spazzatura' })), V(D_VOCE, 'voce'))
check('categoria valida sopra una unita corrotta',
  resolveDueBasis(unit({ categoryDate: D_CATEGORIA, unitDate: 'spazzatura' })), V(D_CATEGORIA, 'categoria'))

// --- composizione con nextDueFrom: base + frequenza ---------------------
check('base unita + 12 mesi',
  nextDueFrom(resolveDueBasis(unit({ unitDate: '2026-03-30' })).date, 12), '2027-03-30')
check('base categoria 31 gen + 1 mese (clamp)',
  nextDueFrom(resolveDueBasis(unit({ categoryDate: '2026-01-31', unitDate: D_UNITA })).date, 1), '2026-02-28')
check('base residenza + 6 mesi',
  nextDueFrom(resolveDueBasis(cond({ residenceDate: '2026-04-15' })).date, 6), '2026-10-15')

// --- ANTI-REGRESSIONE: il fallback che ha causato tutto il problema ------
// I tipi non esistono a runtime: qui si passa davvero un residenceDate di
// troppo su un input 'unit'. Se tornasse quella data, un'unita invenduta
// riprenderebbe le scadenze della residenza, cioe il difetto di partenza.
check('unita non consegnata ignora un residenceDate di troppo',
  resolveDueBasis({ scope: 'unit', itemOverride: null, categoryDate: null, unitDate: null,
                    residenceDate: D_RESIDENZA }),
  NESSUNA)
check('unita non consegnata con residenceDate corrotto: nessun errore, nessuna data',
  resolveDueBasis({ scope: 'unit', itemOverride: null, categoryDate: null, unitDate: null,
                    residenceDate: 'spazzatura' }),
  NESSUNA)
check('parti comuni ignorano un unitDate di troppo',
  resolveDueBasis({ scope: 'condominium', itemOverride: null, categoryDate: null,
                    residenceDate: D_RESIDENZA, unitDate: D_UNITA }),
  V(D_RESIDENZA, 'residenza'))
// Il cancello regge anche con tutti i livelli piu generici valorizzati e un
// residenceDate di troppo: solo l'override puo aprirlo.
check('unita non consegnata con categoria E residenceDate di troppo',
  resolveDueBasis({ scope: 'unit', itemOverride: null, categoryDate: D_CATEGORIA,
                    unitDate: null, residenceDate: D_RESIDENZA }),
  NESSUNA)

// --- data e livello concordano sempre ------------------------------------
for (const [label, out] of [
  ['unita non consegnata',        resolveDueBasis(unit())],
  ['parti comuni senza residenza', resolveDueBasis(cond())],
  ['voce',                        resolveDueBasis(unit({ itemOverride: D_VOCE }))],
  ['categoria',                   resolveDueBasis(cond({ categoryDate: D_CATEGORIA }))],
  ['unita',                       resolveDueBasis(unit({ unitDate: D_UNITA }))],
  ['residenza',                   resolveDueBasis(cond({ residenceDate: D_RESIDENZA }))],
]) {
  eseguiti++
  if ((out.date === null) !== (out.level === null)) {
    fallimenti++
    console.error(`✗ ${label}: data e livello non concordano -> ${JSON.stringify(out)}`)
  }
}

// --- esito -----------------------------------------------------------------
if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
process.exit(0)
