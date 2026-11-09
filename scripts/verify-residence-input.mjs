// ============================================================
// CasaZero — verifica della validazione dell'input di creazione residenza.
// Uso:  node --experimental-strip-types scripts/verify-residence-input.mjs
//       (oppure: npm run verify:resinput)
// ------------------------------------------------------------
// COSA GARANTISCE: che src/lib/residence-input.ts applichi le stesse regole e
// gli stessi messaggi che createResidence aveva inline: campi obbligatori,
// data unità (assente / vuota / malformata), unità (stringa JSON o array;
// shape, vuoto, tetto 200, nomi vuoti, duplicati senza distinzione di
// maiuscole, piano intero >= 0), date per categoria (trim, vuote scartate),
// 19 dotazioni sempre presenti e booleane (mai un "no" implicito), nomi dei
// parametri della RPC.
//
// PERCHE' ESISTE: la stessa funzione serve il wizard manuale e la bozza da
// documento. Una regola allentata qui allenta entrambe senza che il
// type-check lo veda.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente; exit 2 = import fallito — mai confuso con un esito positivo.
// ============================================================
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let R, F
try {
  R = await import(new URL('../src/lib/residence-input.ts', import.meta.url).href)
  F = await import(new URL('../src/lib/residence-features.ts', import.meta.url).href)
} catch (err) {
  console.error(`\n✗ Impossibile importare il modulo: ${err.message}`)
  process.exit(2)
}
const { prepareResidenceInput, residenceRpcParams, parseUnitsJson, validateUnits, MAX_UNITS } = R
const KEYS = F.RESIDENCE_FEATURES.map(f => f.key)

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

const allFeatures = (v = false) => Object.fromEntries(KEYS.map(k => [k, v]))
const base = (o = {}) => ({
  name: 'Residenza X',
  address: 'Via Roma 1',
  energyClass: null,
  deliveryDate: '2027-01-01',
  unitsDeliveryDate: null,
  units: JSON.stringify([{ label: 'A1', floor: 1 }]),
  categoryDates: {},
  features: allFeatures(),
  ...o,
})
const err = (o) => {
  const r = prepareResidenceInput(base(o))
  return 'error' in r ? r.error : 'OK'
}

// ---------- campi obbligatori ----------
const OBBL = 'Nome, indirizzo e data di consegna obbligatori'
check('nome mancante', err({ name: null }), OBBL)
check('nome solo spazi', err({ name: '   ' }), OBBL)
check('indirizzo mancante', err({ address: null }), OBBL)
check('indirizzo solo spazi', err({ address: '  ' }), OBBL)
check('data consegna mancante', err({ deliveryDate: null }), OBBL)
check('data consegna vuota', err({ deliveryDate: '' }), OBBL)
check('classe energetica facoltativa', err({ energyClass: null }), 'OK')
{
  const r = prepareResidenceInput(base({ name: '  Res  ', address: ' Via  ', energyClass: '  ', }))
  check('trim di nome e indirizzo, classe vuota = null',
    [r.input.name, r.input.address, r.input.energyClass], ['Res', 'Via', null])
  const r2 = prepareResidenceInput(base({ energyClass: ' B ' }))
  check('classe energetica con trim', r2.input.energyClass, 'B')
}

// ---------- data di consegna delle unità ----------
check('unità non consegnate: campo assente (null)', err({ unitsDeliveryDate: null }), 'OK')
check('unità non consegnate: campo assente (undefined)', err({ unitsDeliveryDate: undefined }), 'OK')
check('unità consegnate: campo presente ma vuoto', err({ unitsDeliveryDate: '' }), 'Indica la data di consegna delle unità')
check('unità consegnate: campo presente solo spazi', err({ unitsDeliveryDate: '  ' }), 'Indica la data di consegna delle unità')
check('unità consegnate: formato errato', err({ unitsDeliveryDate: '01/02/2020' }), 'Data di consegna delle unità non valida')
check('unità consegnate: data valida', err({ unitsDeliveryDate: '2020-02-01' }), 'OK')
check('unità consegnate: data con trim',
  prepareResidenceInput(base({ unitsDeliveryDate: ' 2020-02-01 ' })).input.unitsDeliveryDate, '2020-02-01')
check('unità non consegnate: null in uscita',
  prepareResidenceInput(base()).input.unitsDeliveryDate, null)

// ---------- unità ----------
check('unità assenti', err({ units: null }), 'Dati unità mancanti')
check('unità non stringa e non array', err({ units: 5 }), 'Dati unità mancanti')
check('unità JSON rotto', err({ units: '{oops' }), 'Dati unità non validi')
check('unità JSON non array', err({ units: '{"a":1}' }), 'Dati unità non validi')
check('unità array vuoto', err({ units: '[]' }), 'Serve almeno una unità')
check('unità array vuoto (già parsato)', err({ units: [] }), 'Serve almeno una unità')
check('unità elemento non oggetto', err({ units: '[1]' }), 'Dati unità non validi')
check('unità elemento null', err({ units: '[null]' }), 'Dati unità non validi')
check('unità label non stringa', err({ units: '[{"label":1,"floor":1}]' }), 'Dati unità non validi')
check('unità floor non numero', err({ units: '[{"label":"A","floor":"1"}]' }), 'Dati unità non validi')
check('unità nome vuoto', err({ units: '[{"label":"  ","floor":1}]' }), 'Ogni unità deve avere un nome')
check('unità piano negativo', err({ units: '[{"label":"A","floor":-1}]' }),
  'Piano non valido per "A": serve un numero intero da 0 in su')
check('unità piano decimale', err({ units: '[{"label":"A","floor":1.5}]' }),
  'Piano non valido per "A": serve un numero intero da 0 in su')
check('unità piano 0 ammesso', err({ units: '[{"label":"A","floor":0}]' }), 'OK')
check('unità duplicato esatto', err({ units: '[{"label":"A","floor":1},{"label":"A","floor":2}]' }),
  'Nome unità duplicato: "A"')
check('unità duplicato per maiuscole e spazi',
  err({ units: '[{"label":"Int. 3","floor":1},{"label":"  int. 3 ","floor":2}]' }),
  'Nome unità duplicato: "int. 3"')
const n = (k) => Array.from({ length: k }, (_, i) => ({ label: `U${i}`, floor: 1 }))
check('unità 200 ammesse', err({ units: JSON.stringify(n(MAX_UNITS)) }), 'OK')
check('unità 201 rifiutate', err({ units: JSON.stringify(n(MAX_UNITS + 1)) }), 'Massimo 200 unità per residenza')
check('tetto unità = 200', MAX_UNITS, 200)
check('unità come array parsato: stesso esito della stringa',
  prepareResidenceInput(base({ units: n(3) })).input.units,
  prepareResidenceInput(base({ units: JSON.stringify(n(3)) })).input.units)
check('etichetta con trim in uscita',
  prepareResidenceInput(base({ units: '[{"label":" Scala A – Int. 3 ","floor":2}]' })).input.units,
  [{ label: 'Scala A – Int. 3', floor: 2 }])
check('parseUnitsJson e validateUnits esportati', [typeof parseUnitsJson, typeof validateUnits], ['function', 'function'])

// ---------- date per categoria ----------
{
  const r = prepareResidenceInput(base({
    categoryDates: { Impianti: ' 2020-01-01 ', Strutture: '', Facciate: '   ', Altro: 5, Tetto: null },
  }))
  check('date categoria: trim, vuote e non stringhe scartate', r.input.categoryDates, { Impianti: '2020-01-01' })
}

// ---------- dotazioni ----------
{
  const r = prepareResidenceInput(base({ features: allFeatures(true) }))
  check('dotazioni: 19 chiavi, nell’ordine della costante', Object.keys(r.input.features), KEYS)
  check('dotazioni: tutte vere', Object.values(r.input.features).every(v => v === true), true)
  const r0 = prepareResidenceInput(base())
  check('dotazioni: i "no" dichiarati restano false e presenti',
    [Object.keys(r0.input.features).length, Object.values(r0.input.features).every(v => v === false)], [KEYS.length, true])
}
{
  const f = allFeatures(); delete f[KEYS[0]]
  check('dotazione mancante = errore, mai "no" implicito', err({ features: f }), 'Dotazioni incomplete')
  const g = allFeatures(); g[KEYS[3]] = 'si'
  check('dotazione non booleana = errore', err({ features: g }), 'Dotazioni incomplete')
  const h = { ...allFeatures(true), chiave_estranea: true }
  check('chiave estranea ignorata', Object.keys(prepareResidenceInput(base({ features: h })).input.features), KEYS)
}

// ---------- parametri RPC ----------
{
  const input = prepareResidenceInput(base({
    energyClass: 'B', unitsDeliveryDate: '2020-02-01', categoryDates: { Impianti: '2020-01-01' },
  })).input
  const p = residenceRpcParams('b-1', input)
  check('RPC: nomi dei parametri', Object.keys(p), [
    'p_builder_id', 'p_name', 'p_address', 'p_energy_class', 'p_delivery_date',
    'p_units', 'p_category_dates', 'p_features', 'p_units_delivery_date',
  ])
  check('RPC: valori', [p.p_builder_id, p.p_name, p.p_address, p.p_energy_class, p.p_delivery_date, p.p_units_delivery_date],
    ['b-1', 'Residenza X', 'Via Roma 1', 'B', '2027-01-01', '2020-02-01'])
  check('RPC: dotazioni sempre 19', Object.keys(p.p_features).length, KEYS.length)
}

console.log(`\n${eseguiti - fallimenti}/${eseguiti} casi ok`)
if (fallimenti > 0) {
  console.error(`✗ ${fallimenti} casi divergenti`)
  process.exit(1)
}
console.log('✓ input di creazione residenza: tutti i casi coincidono')
