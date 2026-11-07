// ============================================================
// CasaZero — verifica della vista del quadro unità × documenti oltre soglia.
// Uso:  node --experimental-strip-types scripts/verify-unit-matrix-view.mjs
//       (oppure: npm run verify:unitmatrix)
// ------------------------------------------------------------
// COSA GARANTISCE: che src/lib/unit-matrix-view.ts decida come stabilito
// (E1b commit 10): la modalità compatta scatta solo OLTRE 12 unità (12 no, 13
// sì); "incompleta" è almeno una cella non presente (da_verificare compreso);
// il toggle effettivo è acceso di default solo oltre la soglia e non filtra mai
// sotto o pari; ricerca e toggle si compongono in AND, senza accenti né
// maiuscole, mantenendo l'ordine ricevuto e senza mutare l'input; quando la
// lista è vuota il messaggio è quello giusto e "Mostra tutte" si offre solo se
// porta davvero a delle righe; il contatore dice quante righe si vedono su
// quante.
//
// PERCHE' ESISTE: un toggle che nasconde righe sbagliate, o che resta acceso
// a 12 unità, passa il type-check e si vede solo a occhio. Il primo caso
// fissa la soglia a 12: una costante abbassata per prova in locale e dimenticata
// nel commit fa fallire la verifica.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente; exit 2 = import fallito — mai confuso con un esito positivo.
// ============================================================
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let M
try {
  M = await import(new URL('../src/lib/unit-matrix-view.ts', import.meta.url).href)
} catch (err) {
  console.error(`\n✗ Impossibile importare il modulo: ${err.message}`)
  process.exit(2)
}
const {
  COMPACT_UNIT_THRESHOLD,
  isCompactMatrix,
  isUnitIncomplete,
  effectiveIncompleteOnly,
  normalizeUnitQuery,
  filterMatrixRows,
  formatMatrixCount,
  matrixEmptyState,
} = M

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
const labels = rows => rows.map(r => r.unit.label)
const NONE = { incompleteOnly: false, query: '' }

// ---------- soglia ----------
check('la soglia è 12 (decisione chiusa: non si committa una soglia abbassata)', COMPACT_UNIT_THRESHOLD, 12)
check('0 unità: non compatta', isCompactMatrix(0), false)
check('1 unità: non compatta', isCompactMatrix(1), false)
check('11 unità: non compatta', isCompactMatrix(11), false)
check('12 unità: non compatta (il confine resta com\'è oggi)', isCompactMatrix(12), false)
check('13 unità: compatta', isCompactMatrix(13), true)
check('15 unità: compatta', isCompactMatrix(15), true)
check('50 unità: compatta', isCompactMatrix(50), true)
check('la soglia è relativa alla costante', isCompactMatrix(COMPACT_UNIT_THRESHOLD), false)
check('la soglia è relativa alla costante (+1)', isCompactMatrix(COMPACT_UNIT_THRESHOLD + 1), true)

// ---------- incompleta ----------
check('tutte presenti: completa', isUnitIncomplete(row('A', P, P, P)), false)
check('una mancante: incompleta', isUnitIncomplete(row('A', P, X, P)), true)
check('una da verificare: incompleta', isUnitIncomplete(row('A', P, P, V)), true)
check('tutte mancanti: incompleta', isUnitIncomplete(row('A', X, X, X)), true)
check('mancante e da verificare insieme: incompleta', isUnitIncomplete(row('A', V, X, P)), true)
check('solo da verificare: incompleta', isUnitIncomplete(row('A', V, V, V)), true)
check('nessuna cella: non incompleta', isUnitIncomplete(row('A')), false)

// ---------- toggle effettivo ----------
check('toggle: mai toccato a 12 unità → spento', effectiveIncompleteOnly(null, 12), false)
check('toggle: mai toccato a 13 unità → acceso', effectiveIncompleteOnly(null, 13), true)
check('toggle: mai toccato a 15 unità → acceso', effectiveIncompleteOnly(null, 15), true)
check('toggle: spento dall\'utente a 13 → spento', effectiveIncompleteOnly(false, 13), false)
check('toggle: acceso dall\'utente a 13 → acceso', effectiveIncompleteOnly(true, 13), true)
check('toggle: override acceso a 12 non filtra (non esiste sotto soglia)', effectiveIncompleteOnly(true, 12), false)
check('toggle: override acceso a 5 non filtra', effectiveIncompleteOnly(true, 5), false)
check('toggle: 0 unità → spento', effectiveIncompleteOnly(null, 0), false)
check('toggle: le unità attraversano la soglia senza override: 12 → 13 → 12',
  [effectiveIncompleteOnly(null, 12), effectiveIncompleteOnly(null, 13), effectiveIncompleteOnly(null, 12)],
  [false, true, false])

// ---------- normalizzazione della ricerca ----------
check('normalize: minuscolo', normalizeUnitQuery('UNITA 3'), 'unita 3')
check('normalize: accenti tolti', normalizeUnitQuery('Unità 3'), 'unita 3')
check('normalize: accento scomposto (NFD) tolto', normalizeUnitQuery('Unità 3'), 'unita 3')
check('normalize: spazi tagliati e compressi', normalizeUnitQuery('  Unità    3  '), 'unita 3')
check('normalize: vuoto', normalizeUnitQuery(''), '')
check('normalize: solo spazi → vuoto', normalizeUnitQuery('   '), '')

// ---------- filtro ----------
const fifteen = [
  row('Unità 1', P, P, P), row('Unità 2', X, X, X), row('Unità 3', P, V, P), row('Unità 4', P, P, P),
  row('Unità 5', X, P, P), row('Unità 6', P, P, P), row('Unità 7', X, X, X), row('Unità 8', P, P, V),
  row('Unità 9', X, X, X), row('Unità 10', P, P, P), row('Unità 11', X, P, P), row('Unità 12', X, X, X),
  row('Unità 13', P, P, P), row('Unità 14', X, X, X), row('Unità 15', X, X, X),
]
const incompleteLabels = ['Unità 2', 'Unità 3', 'Unità 5', 'Unità 7', 'Unità 8', 'Unità 9', 'Unità 11', 'Unità 12', 'Unità 14', 'Unità 15']

check('filtro: nessun filtro → tutte, stesso ordine', labels(filterMatrixRows(fifteen, NONE)), labels(fifteen))
check('filtro: solo incomplete → tolte le complete, stesso ordine',
  labels(filterMatrixRows(fifteen, { incompleteOnly: true, query: '' })), incompleteLabels)
check('filtro: 15 unità, toggle di default → 10 di 15', filterMatrixRows(fifteen, { incompleteOnly: effectiveIncompleteOnly(null, 15), query: '' }).length, 10)
check('filtro: ricerca "1" senza toggle → 1, 10..15',
  labels(filterMatrixRows(fifteen, { incompleteOnly: false, query: '1' })),
  ['Unità 1', 'Unità 10', 'Unità 11', 'Unità 12', 'Unità 13', 'Unità 14', 'Unità 15'])
check('filtro: ricerca "1" e solo incomplete → AND (tolte 1, 10, 13 complete)',
  labels(filterMatrixRows(fifteen, { incompleteOnly: true, query: '1' })),
  ['Unità 11', 'Unità 12', 'Unità 14', 'Unità 15'])
check('filtro: ricerca senza accento e maiuscole', labels(filterMatrixRows(fifteen, { incompleteOnly: false, query: 'UNITA 7' })), ['Unità 7'])
check('filtro: ricerca con accento', labels(filterMatrixRows(fifteen, { incompleteOnly: false, query: 'unità 7' })), ['Unità 7'])
check('filtro: ricerca con spazi attorno', labels(filterMatrixRows(fifteen, { incompleteOnly: false, query: '  unità 7  ' })), ['Unità 7'])
check('filtro: ricerca di soli spazi = nessun filtro', filterMatrixRows(fifteen, { incompleteOnly: false, query: '   ' }).length, 15)
check('filtro: ricerca senza corrispondenze → vuoto', filterMatrixRows(fifteen, { incompleteOnly: false, query: 'zzz' }), [])
check('filtro: unità completa cercata con toggle acceso → non compare', filterMatrixRows(fifteen, { incompleteOnly: true, query: 'unità 4' }), [])
check('filtro: unità completa cercata con toggle spento → compare', labels(filterMatrixRows(fifteen, { incompleteOnly: false, query: 'unità 4' })), ['Unità 4'])
check('filtro: ricerca su etichette non numeriche', labels(filterMatrixRows([row('Scala A int. 3', X), row('Scala B int. 3', P)], { incompleteOnly: false, query: 'scala b' })), ['Scala B int. 3'])
check('filtro: nessuna riga → vuoto', filterMatrixRows([], { incompleteOnly: true, query: 'x' }), [])

const frozen = Object.freeze(fifteen.map(r => Object.freeze({ unit: Object.freeze({ ...r.unit }), cells: Object.freeze(r.cells.map(c => Object.freeze({ ...c }))) })))
const before = JSON.stringify(frozen)
let mutato = false
try {
  filterMatrixRows(frozen, { incompleteOnly: true, query: '1' })
} catch {
  mutato = true
}
check('filtro: non muta l\'input (array e righe congelati, nessuna eccezione)', mutato, false)
check('filtro: input identico dopo il filtro', JSON.stringify(frozen), before)
const filtrate = filterMatrixRows(fifteen, NONE)
check('filtro: restituisce un nuovo array', filtrate === fifteen, false)
check('filtro: le righe sono le stesse istanze (nessuna copia)', filtrate.every((r, i) => r === fifteen[i]), true)

// ---------- contatore ----------
check('contatore: 10 di 15', formatMatrixCount(10, 15), '10 di 15 unità')
check('contatore: 1 di 15', formatMatrixCount(1, 15), '1 di 15 unità')
check('contatore: 0 di 15', formatMatrixCount(0, 15), '0 di 15 unità')
check('contatore: tutte', formatMatrixCount(15, 15), '15 di 15 unità')

// ---------- lista vuota ----------
const allComplete = [row('Unità 1', P, P, P), row('Unità 2', P, P, P)]
check('vuoto: ci sono righe → null', matrixEmptyState(fifteen, { incompleteOnly: true, query: '' }), null)
check('vuoto: nessun filtro e righe → null', matrixEmptyState(fifteen, NONE), null)
check('vuoto: toggle acceso e tutte complete → all_complete con Mostra tutte',
  matrixEmptyState(allComplete, { incompleteOnly: true, query: '' }), { kind: 'all_complete', offerShowAll: true })
check('vuoto: toggle acceso, ricerca solo spazi e tutte complete → all_complete',
  matrixEmptyState(allComplete, { incompleteOnly: true, query: '  ' }), { kind: 'all_complete', offerShowAll: true })
check('vuoto: toggle acceso, ricerca su unità completa → no_incomplete_match con Mostra tutte',
  matrixEmptyState(fifteen, { incompleteOnly: true, query: 'unità 4' }), { kind: 'no_incomplete_match', offerShowAll: true })
check('vuoto: toggle acceso, ricerca senza corrispondenze in assoluto → no_match senza Mostra tutte',
  matrixEmptyState(fifteen, { incompleteOnly: true, query: 'zzz' }), { kind: 'no_match', offerShowAll: false })
check('vuoto: toggle spento, ricerca senza corrispondenze → no_match senza Mostra tutte',
  matrixEmptyState(fifteen, { incompleteOnly: false, query: 'zzz' }), { kind: 'no_match', offerShowAll: false })
check('vuoto: nessuna unità → no_units', matrixEmptyState([], NONE), { kind: 'no_units', offerShowAll: false })
check('vuoto: nessuna unità con toggle acceso → no_units', matrixEmptyState([], { incompleteOnly: true, query: '' }), { kind: 'no_units', offerShowAll: false })
check('vuoto: Mostra tutte porta a righe davvero (no_incomplete_match)',
  filterMatrixRows(fifteen, { incompleteOnly: false, query: 'unità 4' }).length > 0, true)

// ---------- esito ----------
if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} casi divergenti su ${eseguiti}`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi ok`)
