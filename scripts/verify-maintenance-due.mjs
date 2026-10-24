// ============================================================
// CasaZero — verifica dell'aritmetica delle scadenze.
// Uso:  node --experimental-strip-types scripts/verify-maintenance-due.mjs
//       (oppure: npm run verify:due)
// ------------------------------------------------------------
// COSA GARANTISCE: che nextDueFrom (src/lib/maintenance-due.ts) dia la stessa
// data di `base + interval 'N months'` in Postgres, cioè con CLAMP all'ultimo
// giorno del mese di arrivo, su tutti i casi di bordo: 31 gen, 29 feb
// bisestile, 31 di un mese verso un mese di 30, cambio anno, frequenza 0,
// frequenza negativa, orizzonti lunghi (120 mesi). Verifica anche che gli
// input malformati LANCINO invece di produrre una data.
//
// PERCHE' ESISTE: il valore scritto da questo helper decide lo stato
// "scaduta" e le notifiche del cron. La divergenza tra clamp Postgres e
// rollover setMonth() JS passa il type-check, non rompe nessuna pagina e si
// manifesta solo come una data sbagliata di qualche giorno, mesi dopo. Il
// caso ANTI-REGRESSIONE in coda fissa proprio quella differenza.
//
// PERCHE' NON E' UN TEST UNITARIO: il repo non ha un test runner; lo script
// segue il pattern di scripts/verify-document-export.mjs.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente (atteso vs ottenuto); exit 2 = import fallito — mai confuso con
// un esito positivo.
// ============================================================

import { register } from 'node:module'
// Import relativi senza estensione nei moduli di lib: vedi
// scripts/ts-resolve-hooks.mjs. Qui il modulo non ne ha ancora, ma lo script
// resta valido se ne acquisisce uno.
register('./ts-resolve-hooks.mjs', import.meta.url)

const DUE = new URL('../src/lib/maintenance-due.ts', import.meta.url)

let due
try {
  due = await import(DUE.href)
} catch (err) {
  console.error(
    `\n✗ Impossibile importare il modulo: ${err.message}\n` +
    '  Rilancia con:  node --experimental-strip-types scripts/verify-maintenance-due.mjs\n' +
    '  (serve Node >= 22.6; da Node 23.6 il flag non è più necessario)'
  )
  process.exit(2)
}

const { nextDueFrom } = due

let fallimenti = 0
let eseguiti = 0

function check(label, ottenuto, atteso) {
  eseguiti++
  if (ottenuto === atteso) return
  fallimenti++
  console.error(`✗ ${label}\n    atteso:   ${atteso}\n    ottenuto: ${ottenuto}`)
}

function checkThrows(label, base, freq) {
  eseguiti++
  try {
    const ottenuto = nextDueFrom(base, freq)
    fallimenti++
    console.error(`✗ ${label}\n    atteso:   un errore\n    ottenuto: ${ottenuto}`)
  } catch {
    /* atteso */
  }
}

// --- caso normale, nessun bordo -------------------------------------------
check('15 gen + 1 mese',        nextDueFrom('2026-01-15', 1),   '2026-02-15')
check('24 ott + 6 mesi',        nextDueFrom('2026-10-24', 6),   '2027-04-24')
check('10 mar + 12 mesi',       nextDueFrom('2026-03-10', 12),  '2027-03-10')
check('1 gen + 1 mese',         nextDueFrom('2026-01-01', 1),   '2026-02-01')

// --- clamp a fine mese: il motivo per cui questo modulo esiste -------------
check('31 gen + 1 mese → 28 feb',   nextDueFrom('2026-01-31', 1),  '2026-02-28')
check('31 gen + 1 mese bisestile',  nextDueFrom('2024-01-31', 1),  '2024-02-29')
check('31 mar + 1 mese → 30 apr',   nextDueFrom('2026-03-31', 1),  '2026-04-30')
check('31 ago + 1 mese → 30 set',   nextDueFrom('2026-08-31', 1),  '2026-09-30')
check('31 mag + 3 mesi → 31 ago',   nextDueFrom('2026-05-31', 3),  '2026-08-31')
check('31 ago + 6 mesi → 28 feb',   nextDueFrom('2026-08-31', 6),  '2027-02-28')
check('31 gen + 13 mesi → 28 feb',  nextDueFrom('2026-01-31', 13), '2027-02-28')
check('29 feb + 12 mesi → 28 feb',  nextDueFrom('2024-02-29', 12), '2025-02-28')
check('29 feb + 48 mesi → 29 feb',  nextDueFrom('2024-02-29', 48), '2028-02-29')
check('30 nov + 3 mesi → 28 feb',   nextDueFrom('2026-11-30', 3),  '2027-02-28')

// --- cambio anno ----------------------------------------------------------
check('15 dic + 1 mese',        nextDueFrom('2026-12-15', 1),   '2027-01-15')
check('31 dic + 1 mese',        nextDueFrom('2026-12-31', 1),   '2027-01-31')
check('31 dic + 2 mesi → feb',  nextDueFrom('2026-12-31', 2),   '2027-02-28')
check('31 ott + 12 mesi',       nextDueFrom('2026-10-31', 12),  '2027-10-31')

// --- orizzonti del catalogo (frequenze reali fino a 120 mesi) -------------
check('31 gen + 120 mesi',      nextDueFrom('2026-01-31', 120), '2036-01-31')
check('29 feb + 120 mesi',      nextDueFrom('2024-02-29', 120), '2034-02-28')
check('24 ott + 60 mesi',       nextDueFrom('2026-10-24', 60),  '2031-10-24')

// --- frequenza 0 e negativa ------------------------------------------------
check('frequenza 0 → stessa data',  nextDueFrom('2026-01-31', 0),   '2026-01-31')
check('31 mar - 1 mese → 28 feb',   nextDueFrom('2026-03-31', -1),  '2026-02-28')
check('15 gen - 1 mese → anno giù', nextDueFrom('2026-01-15', -1),  '2025-12-15')

// --- orario ignorato: una scadenza è una data di calendario ---------------
check('timestamp con T',  nextDueFrom('2026-01-31T23:30:00.000Z', 1), '2026-02-28')
check('timestamp con spazio', nextDueFrom('2026-01-31 23:30:00+00', 1), '2026-02-28')

// --- input malformati: lanciano, non producono una data -------------------
checkThrows('data vuota',             '',            1)
checkThrows('formato italiano',       '31/01/2026',  1)
checkThrows('mese 13',                '2026-13-01',  1)
checkThrows('mese 00',                '2026-00-10',  1)
checkThrows('giorno inesistente',     '2026-02-31',  1)
checkThrows('29 feb non bisestile',   '2026-02-29',  1)
checkThrows('data senza giorno',      '2026-01',     1)
checkThrows('frequenza frazionaria',  '2026-01-15',  1.5)
checkThrows('frequenza NaN',          '2026-01-15',  NaN)
checkThrows('frequenza non numerica', '2026-01-15',  '6')

// --- ANTI-REGRESSIONE: la vecchia aritmetica setMonth() dava un'altra data.
// Se questo caso iniziasse a passare con il valore del rollover, il clamp è
// stato perso e il DB e l'applicazione tornerebbero a divergere.
const rollover = (baseISO, months) => {
  const d = new Date(baseISO)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}
check('rollover legacy (riferimento)', rollover('2026-01-31', 1), '2026-03-03')
eseguiti++
if (nextDueFrom('2026-01-31', 1) === rollover('2026-01-31', 1)) {
  fallimenti++
  console.error("✗ nextDueFrom coincide con il rollover setMonth(): clamp perso")
}

// --- esito -----------------------------------------------------------------
if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
process.exit(0)
