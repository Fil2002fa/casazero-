// ============================================================
// CasaZero — verifica dei contatori della testata del quadro unità × documenti.
// Uso:  node --experimental-strip-types scripts/verify-unit-matrix-summary.mjs
//       (oppure: npm run verify:matrixsummary)
// ------------------------------------------------------------
// COSA GARANTISCE: che src/lib/unit-matrix-summary.ts conti per SLOT (celle del
// quadro) come stabilito (E1b commit 12): T = unità × tipi attesi (5, 12, 13
// unità × 3), "mancanti" sono le celle mancanti, "da verificare" le celle
// ambra; "tutti completi" solo con zero mancanti E zero da verificare; con zero
// unità non si mostra niente; il testo è al singolare con 1 ("1 slot
// mancante"); i numeri non dipendono da toggle e ricerca, perché la regola
// prende solo le righe.
//
// PERCHE' ESISTE: una testata che conta le righe filtrate, che dichiara
// "completi" con celle ambra o che scrive "1 slot mancanti" passa il
// type-check e si vede solo a occhio.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente; exit 2 = import fallito — mai confuso con un esito positivo.
// ============================================================
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let S
let V_
try {
  S = await import(new URL('../src/lib/unit-matrix-summary.ts', import.meta.url).href)
  V_ = await import(new URL('../src/lib/unit-matrix-view.ts', import.meta.url).href)
} catch (err) {
  console.error(`\n✗ Impossibile importare il modulo: ${err.message}`)
  process.exit(2)
}
const { matrixSummary, summaryPills } = S
const { filterMatrixRows } = V_

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

const P = 'presente'
const V = 'da_verificare'
const X = 'mancante'
const row = (label, ...states) => ({ unit: { label }, cells: states.map(state => ({ state })) })
// n unità tutte con la stessa terna di stati
const units = (n, ...states) => Array.from({ length: n }, (_, i) => row(`Unità ${i + 1}`, ...states))
const texts = rows => summaryPills(matrixSummary(rows)).map(p => `${p.kind}: ${p.text}`)

// ---------- zero unità ----------
check('0 unità: nessun riepilogo', matrixSummary([]), null)
check('0 unità: nessuna pillola', summaryPills(matrixSummary([])), [])
check('summaryPills(null): nessuna pillola', summaryPills(null), [])

// ---------- tutto completo ----------
check('tutto completo: conteggi', matrixSummary(units(5, P, P, P)),
  { total: 15, missing: 0, toVerify: 0, allComplete: true })
check('tutto completo: solo la pillola verde', texts(units(5, P, P, P)),
  ['all_complete: Tutti i 15 slot sono completi'])

// ---------- solo da verificare ----------
check('solo da verificare: conteggi', matrixSummary([row('A', V, P, P), row('B', P, V, V)]),
  { total: 6, missing: 0, toVerify: 3, allComplete: false })
check('solo da verificare: niente verde, solo ambra (N=0 con V>0)',
  texts([row('A', V, P, P), row('B', P, V, V)]),
  ['to_verify: 3 slot da verificare'])

// ---------- solo mancanti ----------
check('solo mancanti: conteggi', matrixSummary([row('A', X, X, X), row('B', P, P, P)]),
  { total: 6, missing: 3, toVerify: 0, allComplete: false })
check('solo mancanti: solo la pillola tratteggiata', texts([row('A', X, X, X), row('B', P, P, P)]),
  ['missing: 3 slot mancanti su 6'])

// ---------- mancanti e da verificare insieme ----------
const mixed = [row('A', X, V, P), row('B', X, X, V), row('C', P, P, P)]
check('insieme: conteggi', matrixSummary(mixed), { total: 9, missing: 3, toVerify: 2, allComplete: false })
check('insieme: tutte e due le pillole, nell\'ordine mancanti poi da verificare', texts(mixed),
  ['missing: 3 slot mancanti su 9', 'to_verify: 2 slot da verificare'])

// ---------- singolare ----------
check('1 slot mancante: singolare', texts([row('A', X, P, P), row('B', P, P, P)]),
  ['missing: 1 slot mancante su 6'])
check('1 slot da verificare', texts([row('A', V, P, P), row('B', P, P, P)]),
  ['to_verify: 1 slot da verificare'])

// ---------- T per 5, 12 e 13 unità ----------
check('T per 5 unità = 15', matrixSummary(units(5, X, X, X)).total, 15)
check('T per 12 unità = 36', matrixSummary(units(12, X, X, X)).total, 36)
check('T per 13 unità = 39', matrixSummary(units(13, X, X, X)).total, 39)
check('13 unità tutte mancanti: 39 su 39', texts(units(13, X, X, X)), ['missing: 39 slot mancanti su 39'])
check('T è unità × celle per riga (1 unità = 3)', matrixSummary(units(1, P, P, P)).total, 3)

// ---------- nessuna influenza di toggle e ricerca ----------
// 13 unità (modalità compatta): 4 complete, 9 con qualcosa di mancante o ambra.
const thirteen = [
  ...units(4, P, P, P),
  row('Unità 5', X, P, P), row('Unità 6', V, P, P), row('Unità 7', X, X, X),
  row('Unità 8', P, V, P), row('Unità 9', P, P, X), row('Unità 10', X, V, V),
  row('Unità 11', P, P, V), row('Unità 12', X, P, P), row('Unità 13', P, X, P),
].map((r, i) => ({ ...r, unit: { label: `Unità ${i + 1}` } }))
const full = matrixSummary(thirteen)
check('13 unità: conteggi sulle righe intere', full, { total: 39, missing: 8, toVerify: 5, allComplete: false })
const incompleteOnly = filterMatrixRows(thirteen, { incompleteOnly: true, query: '' })
const searched = filterMatrixRows(thirteen, { incompleteOnly: false, query: 'unità 1' })
const both = filterMatrixRows(thirteen, { incompleteOnly: true, query: 'unità 1' })
check('toggle acceso: le righe visibili sono meno delle intere', incompleteOnly.length < thirteen.length, true)
check('ricerca: le righe visibili sono meno delle intere', searched.length < thirteen.length, true)
check('toggle + ricerca: le righe visibili sono meno delle intere', both.length < thirteen.length, true)
check('contare le righe filtrate darebbe un altro T (per questo la regola prende le righe intere)',
  matrixSummary(incompleteOnly).total !== full.total, true)
check('stesse righe, stesso esito: la regola non ha altri ingressi', matrixSummary(thirteen), full)
check('le righe non vengono mutate', thirteen.length, 13)

// ---------- esito ----------
if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} casi divergenti su ${eseguiti}`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi ok`)
