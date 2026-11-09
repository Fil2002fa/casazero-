// ============================================================
// CasaZero — verifica della bozza di residenza da documento.
// Uso:  node --experimental-strip-types scripts/verify-residence-draft.mjs
//       (oppure: npm run verify:resdraft)
// ------------------------------------------------------------
// COSA GARANTISCE: che src/lib/residence-draft.ts
//  · assegni i tre stati (Dal documento / Da verificare / Non trovato) con la
//    regola stabilita e che un campo non trovato non abbia mai un valore;
//  · NON trasformi mai "non trovato" in "no": una dotazione assente o null
//    resta senza risposta, la creazione si rifiuta, e l'unica strada verso il
//    "no" è markUnresolvedAsNo (gesto esplicito, che non tocca il resto);
//  · un "no" dell'AI senza citazione non sia mai "Dal documento";
//  · la data di consegna non venga mai dal documento;
//  · la scala finisca nell'etichetta dell'unità senza ripetersi;
//  · il conteggio delle voci non generate sia giusto: solo i "no" decisi, mai
//    le dotazioni senza risposta, per template attivi, per scope;
//  · gli avvisi di coerenza scattino solo con risposte note, e siano avvisi;
//  · la creazione passi dalla stessa validazione del wizard manuale.
//
// PERCHE' ESISTE: un "no" implicito toglie voci dal piano in modo permanente
// (le dotazioni non sono modificabili dopo la creazione) e passa il type-check.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente; exit 2 = import fallito — mai confuso con un esito positivo.
// ============================================================
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let D, F
try {
  D = await import(new URL('../src/lib/residence-draft.ts', import.meta.url).href)
  F = await import(new URL('../src/lib/residence-features.ts', import.meta.url).href)
} catch (err) {
  console.error(`\n✗ Impossibile importare il modulo: ${err.message}`)
  process.exit(2)
}
const {
  normalizeDraftProposal, resolveFeatures, effectiveFeatureAnswer, markUnresolvedAsNo,
  skippedItems, skippedItemsLine, draftWarnings, prepareDraftCreation,
  unitLabelWithStaircase, normalizeAddress, DRAFT_JSON_SCHEMA, FIELD_STATE_LABEL,
} = D
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

// ---------- costruttori di proposta ----------
const fld = (valore, confidenza = 'alta', citazione = 'p. 3') => ({ valore, confidenza, citazione })
const NONE = { valore: null, confidenza: null, citazione: null }
const dotazioni = (o = {}) => Object.fromEntries(KEYS.map(k => [k, k in o ? o[k] : NONE]))
const proposal = (o = {}) => ({
  nome: fld('Residenza Aurora'),
  indirizzo: fld('Via Roma 1, Padova'),
  classe_energetica: NONE,
  unita_dichiarate: fld(2),
  data_agibilita: fld('2026-03-01'),
  unita: [
    { etichetta: 'Int. 1', scala: 'A', piano: 1, confidenza: 'alta', citazione: 'tab. 2' },
    { etichetta: 'Int. 2', scala: 'A', piano: 2, confidenza: 'alta', citazione: 'tab. 2' },
  ],
  dotazioni: dotazioni(),
  ...o,
})
const draftOf = (o) => normalizeDraftProposal(proposal(o)).draft

// ---------- tre stati ----------
{
  const d = draftOf()
  check('alta + citazione = dal_documento', d.name.state, 'dal_documento')
  check('valore null = non_trovato', d.energyClass.state, 'non_trovato')
  check('non_trovato non ha valore', [d.energyClass.value, d.energyClass.confidence, d.energyClass.citation], [null, null, null])
  check('i tre stati hanno etichetta', Object.keys(FIELD_STATE_LABEL), ['dal_documento', 'da_verificare', 'non_trovato'])
  check('etichette in italiano', Object.values(FIELD_STATE_LABEL), ['Dal documento', 'Da verificare', 'Non trovato'])
}
check('confidenza media = da_verificare', draftOf({ nome: fld('X', 'media') }).name.state, 'da_verificare')
check('confidenza bassa = da_verificare', draftOf({ nome: fld('X', 'bassa') }).name.state, 'da_verificare')
check('alta senza citazione = da_verificare', draftOf({ nome: fld('X', 'alta', null) }).name.state, 'da_verificare')
check('alta con citazione vuota = da_verificare', draftOf({ nome: fld('X', 'alta', '   ') }).name.state, 'da_verificare')
check('confidenza sconosciuta = da_verificare', draftOf({ nome: fld('X', 'certissima') }).name.state, 'da_verificare')
check('da_verificare conserva il valore', draftOf({ nome: fld('X', 'media') }).name.value, 'X')
check('stringa vuota = non_trovato', draftOf({ nome: fld('   ') }).name.state, 'non_trovato')
check('campo non oggetto = non_trovato', draftOf({ nome: 'Aurora' }).name.state, 'non_trovato')
check('valore con spazi: trim', draftOf({ nome: fld('  Aurora  ') }).name.value, 'Aurora')
check('numero non finito = non_trovato', draftOf({ unita_dichiarate: fld(NaN) }).declaredUnitCount.state, 'non_trovato')

// ---------- data di consegna: mai dal documento ----------
{
  const d = draftOf()
  check('data agibilità: mai dal_documento anche con alta + citazione', d.deliveryDateSuggestion.state, 'da_verificare')
  const r = prepareDraftCreation(d, { featureAnswers: Object.fromEntries(KEYS.map(k => [k, false])) })
  check('la data agibilità non diventa data di consegna', r.error, 'Nome, indirizzo e data di consegna obbligatori')
}

// ---------- unità e scala ----------
check('scala nell’etichetta', unitLabelWithStaircase('Int. 3', 'A'), 'Scala A – Int. 3')
check('scala già con prefisso', unitLabelWithStaircase('Int. 3', 'Scala B'), 'Scala B – Int. 3')
check('senza scala resta l’etichetta', unitLabelWithStaircase(' Int. 3 ', null), 'Int. 3')
check('scala vuota = nessuna scala', unitLabelWithStaircase('Int. 3', '  '), 'Int. 3')
check('etichetta che contiene già la scala non si ripete', unitLabelWithStaircase('Scala A – Int. 3', 'A'), 'Scala A – Int. 3')
{
  const d = draftOf()
  check('unità: etichetta con scala e piano', d.units.map(u => u.value), [
    { label: 'Scala A – Int. 1', floor: 1 }, { label: 'Scala A – Int. 2', floor: 2 },
  ])
  const sp = draftOf({ unita: [{ etichetta: 'Int. 9', scala: null, piano: null, confidenza: 'alta', citazione: 'x' }] })
  check('unità senza piano: da_verificare e piano null (mai 0)', [sp.units[0].state, sp.units[0].value.floor], ['da_verificare', null])
  const neg = draftOf({ unita: [{ etichetta: 'Int. 9', scala: null, piano: -1, confidenza: 'alta', citazione: 'x' }] })
  check('piano negativo = null', neg.units[0].value.floor, null)
  const junk = draftOf({ unita: [{ etichetta: '  ' }, 5, null, { etichetta: 'Int. 1', scala: null, piano: 0, confidenza: 'alta', citazione: 'x' }] })
  check('unità malformate scartate', junk.units.length, 1)
}

// ---------- dotazioni: non trovato non è no ----------
{
  const d = draftOf({ dotazioni: dotazioni({ ascensore: fld(true), autoclave: fld(false) }) })
  check('dotazione sì dal documento', [d.features.ascensore.state, d.features.ascensore.value], ['dal_documento', true])
  check('dotazione no dal documento', [d.features.autoclave.state, d.features.autoclave.value], ['dal_documento', false])
  check('dotazione null = non_trovato (non false)', [d.features.lucernari.state, d.features.lucernari.value], ['non_trovato', null])
  check('19 dotazioni sempre presenti', Object.keys(d.features), KEYS)
  const noCite = draftOf({ dotazioni: dotazioni({ autoclave: fld(false, 'alta', null) }) })
  check('un "no" senza citazione non è mai dal_documento', noCite.features.autoclave.state, 'da_verificare')
  const noLow = draftOf({ dotazioni: dotazioni({ autoclave: fld(false, 'bassa') }) })
  check('un "no" a bassa confidenza è da_verificare', noLow.features.autoclave.state, 'da_verificare')

  const partial = { ...dotazioni({ ascensore: fld(true) }) }
  delete partial.lucernari
  const miss = draftOf({ dotazioni: partial })
  check('dotazione assente dalla proposta = non_trovato', [miss.features.lucernari.state, miss.features.lucernari.value], ['non_trovato', null])

  const r = resolveFeatures(d, {})
  check('senza risposte: non risolte = tutte le non trovate', r.unresolved.length, 17)
  check('senza risposte: nessun oggetto di dotazioni', r.features, null)
  check('le non trovate NON compaiono come false', r.unresolved.includes('lucernari'), true)
  check('risposta effettiva di una non trovata = undefined', effectiveFeatureAnswer(d, {}, 'lucernari'), undefined)
  check('risposta effettiva: vince il documento', effectiveFeatureAnswer(d, {}, 'ascensore'), true)
  check('risposta effettiva: vince l’umano', effectiveFeatureAnswer(d, { ascensore: false }, 'ascensore'), false)
  check('risposta effettiva: l’umano risolve una non trovata', effectiveFeatureAnswer(d, { lucernari: true }, 'lucernari'), true)
  check('risposta non booleana dell’umano ignorata', effectiveFeatureAnswer(d, { lucernari: 'no' }, 'lucernari'), undefined)

  const all = Object.fromEntries(KEYS.map(k => [k, false]))
  const done = resolveFeatures(d, all)
  check('tutte risposte: 19 booleani, ordine della costante', [Object.keys(done.features), done.unresolved], [KEYS, []])
  check('tutte risposte: ascensore umano no vince sul documento sì', done.features.ascensore, false)
}

// ---------- da_verificare: blocca solo se il valore proposto è "no" ----------
{
  const d = draftOf({ dotazioni: dotazioni({
    ascensore: fld(true, 'media'),      // sì da_verificare
    autoclave: fld(false, 'media'),     // no da_verificare
    lucernari: fld(false, 'alta', null),// no senza citazione = da_verificare
    porte_rei: fld(true, 'alta', null), // sì senza citazione = da_verificare
    rete_idranti: fld(false),           // no dal documento
  }) })
  check('da_verificare: stati di partenza', [d.features.ascensore.state, d.features.autoclave.state, d.features.lucernari.state, d.features.porte_rei.state, d.features.rete_idranti.state],
    ['da_verificare', 'da_verificare', 'da_verificare', 'da_verificare', 'dal_documento'])
  check('sì da_verificare: precompila (risposta effettiva true)', effectiveFeatureAnswer(d, {}, 'ascensore'), true)
  check('sì da_verificare senza citazione: precompila', effectiveFeatureAnswer(d, {}, 'porte_rei'), true)
  check('no da_verificare: nessuna risposta finché l’umano non conferma', effectiveFeatureAnswer(d, {}, 'autoclave'), undefined)
  check('no da_verificare senza citazione: nessuna risposta', effectiveFeatureAnswer(d, {}, 'lucernari'), undefined)
  check('no dal_documento: resta no, non blocca', effectiveFeatureAnswer(d, {}, 'rete_idranti'), false)
  check('l’umano conferma il no: false', effectiveFeatureAnswer(d, { autoclave: false }, 'autoclave'), false)
  check('l’umano corregge il no in sì: true', effectiveFeatureAnswer(d, { autoclave: true }, 'autoclave'), true)
  const r = resolveFeatures(d, {})
  check('i no da_verificare sono tra le non risolte, i sì no', [r.unresolved.includes('autoclave'), r.unresolved.includes('lucernari'), r.unresolved.includes('ascensore'), r.unresolved.includes('porte_rei'), r.unresolved.includes('rete_idranti')],
    [true, true, false, false, false])
  const rest = Object.fromEntries(KEYS.filter(k => !['autoclave', 'lucernari', 'ascensore'].includes(k)).map(k => [k, false]))
  const blocked = prepareDraftCreation(d, { deliveryDate: '2027-01-01', featureAnswers: rest })
  check('creazione bloccata dai soli no da_verificare', [('input' in blocked), blocked.unresolvedFeatures], [false, ['lucernari', 'autoclave'].sort((a, b) => KEYS.indexOf(a) - KEYS.indexOf(b))])
  const unblocked = prepareDraftCreation(d, { deliveryDate: '2027-01-01', featureAnswers: { ...rest, autoclave: false, lucernari: false } })
  check('creazione dopo conferma dei no da_verificare', 'input' in unblocked, true)
  check('il sì da_verificare non ha bisogno di conferma per creare', unblocked.input.features.ascensore, true)
  check('il no da_verificare non conta come voce non generata finché non confermato',
    skippedItems([{ condition_key: 'autoclave', scope: 'condominium', is_active: true }], Object.fromEntries(KEYS.map(k => [k, effectiveFeatureAnswer(d, {}, k)]).filter(([, v]) => v !== undefined)), 3).count, 0)
  check('markUnresolvedAsNo copre anche i no da_verificare (gesto esplicito)', markUnresolvedAsNo(d, {}).autoclave, false)
}

// ---------- l'unico "no" implicito è esplicito ----------
{
  const d = draftOf({ dotazioni: dotazioni({ ascensore: fld(true) }) })
  const before = { lucernari: true }
  const marked = markUnresolvedAsNo(d, before)
  check('markUnresolvedAsNo: le non risolte diventano false', marked.autoclave, false)
  check('markUnresolvedAsNo: non tocca le risposte date', marked.lucernari, true)
  check('markUnresolvedAsNo: non scrive sulle dotazioni del documento', 'ascensore' in marked, false)
  check('markUnresolvedAsNo: poi non resta nulla di non risolto', resolveFeatures(d, marked).unresolved, [])
  check('markUnresolvedAsNo: non muta l’input', before, { lucernari: true })
  check('markUnresolvedAsNo: non muta la bozza', d.features.autoclave.state, 'non_trovato')
}

// ---------- conteggio delle voci non generate ----------
{
  const TPL = [
    { condition_key: 'ascensore', scope: 'condominium', is_active: true },
    { condition_key: 'ascensore', scope: 'condominium', is_active: true },
    { condition_key: 'autoclave', scope: 'condominium', is_active: true },
    { condition_key: 'lucernari', scope: 'condominium', is_active: true },
    { condition_key: 'cancello_motorizzato', scope: 'condominium', is_active: false },
    { condition_key: null, scope: 'condominium', is_active: true },
    { condition_key: 'antenna_centralizzata', scope: 'unit', is_active: true },
  ]
  check('conteggio: nessuna risposta = 0', skippedItems(TPL, {}, 10).count, 0)
  check('conteggio: un "no" con due voci = 2', skippedItems(TPL, { ascensore: false }, 10).count, 2)
  check('conteggio: un "sì" non conta', skippedItems(TPL, { ascensore: true }, 10).count, 0)
  check('conteggio: le non risolte non contano', skippedItems(TPL, { ascensore: false, autoclave: undefined }, 10).count, 2)
  check('conteggio: due "no" sommano', skippedItems(TPL, { ascensore: false, autoclave: false }, 10).count, 3)
  check('conteggio: template non attivo escluso', skippedItems(TPL, { cancello_motorizzato: false }, 10).count, 0)
  check('conteggio: voce di scope unità = una per unità', skippedItems(TPL, { antenna_centralizzata: false }, 7).count, 7)
  check('conteggio: scope unità con 0 unità', skippedItems(TPL, { antenna_centralizzata: false }, 0).count, 0)
  check('conteggio: unità negative non sottraggono', skippedItems(TPL, { antenna_centralizzata: false }, -3).count, 0)
  check('conteggio: dotazione senza template = 0 voci ma compare nell’elenco',
    [skippedItems(TPL, { fossa_biologica: false }, 5).count, skippedItems(TPL, { fossa_biologica: false }, 5).noFeatures], [0, ['fossa_biologica']])
  check('elenco dei "no" nell’ordine della costante',
    skippedItems(TPL, { lucernari: false, ascensore: false }, 1).noFeatures, ['ascensore', 'lucernari'])
  check('conteggio: chiave estranea ignorata', skippedItems(TPL, { inventata: false }, 5), { count: 0, noFeatures: [] })
  check('riga: singolare', skippedItemsLine(1), '1 voce di manutenzione non verrà generata')
  check('riga: plurale', skippedItemsLine(3), '3 voci di manutenzione non verranno generate')
  check('riga: zero', skippedItemsLine(0), '0 voci di manutenzione non verranno generate')
}

// ---------- coerenza ----------
{
  const d = draftOf()
  const codes = (answers, opts = {}) => draftWarnings(d, answers, {
    units: [{ label: 'A' }, { label: 'B' }], existingAddresses: [], address: null, ...opts,
  }).map(w => w.code)
  check('coerenza: unità dichiarate = elencate, nessun avviso', codes({}), [])
  check('coerenza: dichiarate 2, elencate 3', codes({}, { units: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] }), ['unit_count_mismatch'])
  const nodecl = draftOf({ unita_dichiarate: NONE })
  check('coerenza: senza numero dichiarato nessun confronto',
    draftWarnings(nodecl, {}, { units: [{ label: 'A' }], existingAddresses: [], address: null }).map(w => w.code), [])
  check('coerenza: etichette duplicate (maiuscole)', codes({}, { units: [{ label: 'A' }, { label: ' a ' }] }), ['duplicate_unit'])
  check('coerenza: indirizzo già usato', codes({}, { existingAddresses: ['via roma 1,  padova'], address: 'Via Roma 1 Padova' }), ['address_in_use'])
  check('coerenza: indirizzo diverso', codes({}, { existingAddresses: ['Via Dante 2'], address: 'Via Roma 1' }), [])
  check('coerenza: acs sì + centrale no', codes({ acs_centralizzata: true, centrale_termica: false }), ['acs_without_boiler'])
  check('coerenza: acs sì + centrale non risposta = nessun avviso', codes({ acs_centralizzata: true }), [])
  check('coerenza: gas sì + centrale no', codes({ generatore_gas: true, centrale_termica: false }), ['gas_without_boiler'])
  check('coerenza: canna sì + centrale no', codes({ canna_fumaria_collettiva: true, centrale_termica: false }), ['flue_without_boiler'])
  check('coerenza: acs sì + centrale sì', codes({ acs_centralizzata: true, centrale_termica: true }), [])
  check('coerenza: acs no + centrale no', codes({ acs_centralizzata: false, centrale_termica: false }), [])
  check('normalizeAddress', normalizeAddress('Via  Roma, 1.'), 'via roma 1')
  check('avvisi sono oggetti {code, message}', draftWarnings(d, {}, { units: [{ label: 'A' }], existingAddresses: [], address: null })
    .every(w => typeof w.code === 'string' && typeof w.message === 'string'), true)
}

// ---------- dalla bozza alla creazione ----------
{
  const d = draftOf({ dotazioni: dotazioni({ ascensore: fld(true) }) })
  const ALLNO = Object.fromEntries(KEYS.map(k => [k, false]))
  const ok = { deliveryDate: '2027-01-01', featureAnswers: ALLNO }

  const unres = prepareDraftCreation(d, { deliveryDate: '2027-01-01' })
  check('creazione con dotazioni non risolte: rifiutata', 'input' in unres, false)
  check('creazione rifiutata: messaggio e conteggio al plurale',
    unres.error, 'Rispondi sì o no per 18 dotazioni: non trovate nel documento o da confermare')
  check('creazione rifiutata: elenco delle non risolte', unres.unresolvedFeatures.length, 18)
  const one = prepareDraftCreation(d, { deliveryDate: '2027-01-01', featureAnswers: Object.fromEntries(KEYS.filter(k => k !== 'lucernari' && k !== 'ascensore').map(k => [k, false])) })
  check('creazione rifiutata: singolare', one.error, 'Rispondi sì o no per 1 dotazione: non trovate nel documento o da confermare')

  const made = prepareDraftCreation(d, ok)
  check('creazione ok', 'input' in made, true)
  check('creazione: nome e indirizzo dal documento', [made.input.name, made.input.address], ['Residenza Aurora', 'Via Roma 1, Padova'])
  check('creazione: unità con scala', made.input.units, [
    { label: 'Scala A – Int. 1', floor: 1 }, { label: 'Scala A – Int. 2', floor: 2 },
  ])
  const keepDoc = prepareDraftCreation(d, {
    deliveryDate: '2027-01-01',
    featureAnswers: Object.fromEntries(KEYS.filter(k => k !== 'ascensore').map(k => [k, false])),
  })
  check('creazione: la proposta sì dal documento resta sì se l’umano non risponde',
    keepDoc.input.features.ascensore, true)
  check('creazione: l’umano che risponde no vince sul sì del documento', made.input.features.ascensore, false)
  check('creazione: 19 dotazioni', Object.keys(made.input.features), KEYS)
  check('creazione: classe energetica non trovata = null', made.input.energyClass, null)

  check('creazione: modifica dell’umano vince', prepareDraftCreation(d, { ...ok, name: 'Altro' }).input.name, 'Altro')
  check('creazione: nome svuotato dall’umano = errore, non il valore del documento',
    prepareDraftCreation(d, { ...ok, name: '' }).error, 'Nome, indirizzo e data di consegna obbligatori')
  check('creazione: senza data di consegna = errore', prepareDraftCreation(d, { featureAnswers: ALLNO }).error,
    'Nome, indirizzo e data di consegna obbligatori')
  check('creazione: piano mancante = errore, mai 0',
    prepareDraftCreation(draftOf({ unita: [{ etichetta: 'Int. 9', scala: null, piano: null, confidenza: 'alta', citazione: 'x' }] }), ok).error,
    'Dati unità non validi')
  check('creazione: unità sostituite dall’umano',
    prepareDraftCreation(d, { ...ok, units: [{ label: 'Z', floor: 3 }] }).input.units, [{ label: 'Z', floor: 3 }])
  check('creazione: elenco unità vuoto dall’umano = errore',
    prepareDraftCreation(d, { ...ok, units: [] }).error, 'Serve almeno una unità')
  check('creazione: duplicati rifiutati dalla stessa validazione del wizard',
    prepareDraftCreation(d, { ...ok, units: [{ label: 'A', floor: 1 }, { label: 'a', floor: 1 }] }).error, 'Nome unità duplicato: "a"')
  check('creazione: date per categoria dall’umano',
    prepareDraftCreation(d, { ...ok, categoryDates: { Impianti: '2020-01-01' } }).input.categoryDates, { Impianti: '2020-01-01' })
  check('creazione: unità consegnate formato errato',
    prepareDraftCreation(d, { ...ok, unitsDeliveryDate: '1/2/2020' }).error, 'Data di consegna delle unità non valida')

  // dopo il gesto esplicito la creazione passa
  const marked = markUnresolvedAsNo(d, {})
  check('creazione dopo "Segna le rimanenti come No"', 'input' in prepareDraftCreation(d, { deliveryDate: '2027-01-01', featureAnswers: marked }), true)
}

// ---------- normalizzazione: input non validi ----------
check('proposta non oggetto', normalizeDraftProposal(null), { error: 'Proposta non valida' })
check('proposta senza unità', normalizeDraftProposal({ ...proposal(), unita: undefined }), { error: 'Proposta non valida: elenco unità mancante' })
check('proposta senza dotazioni', normalizeDraftProposal({ ...proposal(), dotazioni: undefined }), { error: 'Proposta non valida: dotazioni mancanti' })
check('proposta array', normalizeDraftProposal([]), { error: 'Proposta non valida' })

// ---------- schema AI ----------
check('schema: dotazioni = array di voci con chiave', [DRAFT_JSON_SCHEMA.properties.dotazioni.type, DRAFT_JSON_SCHEMA.properties.dotazioni.items.required], ['array', ['chiave', 'valore', 'confidenza', 'citazione']])
check('schema: chiave ammessa = le 19 dotazioni', DRAFT_JSON_SCHEMA.properties.dotazioni.items.properties.chiave.enum, KEYS)
check('schema: nessuna proprietà extra', DRAFT_JSON_SCHEMA.additionalProperties, false)
check('schema: campi radice obbligatori', DRAFT_JSON_SCHEMA.required,
  ['nome', 'indirizzo', 'classe_energetica', 'unita_dichiarate', 'data_agibilita', 'unita', 'dotazioni'])

// ---------- limiti dello schema dell'API (provati con chiamata reale il 9/11) ----------
{
  let unions = 0
  const arrayTypeWithEnum = []
  const walk = (n, path) => {
    if (Array.isArray(n)) return n.forEach((x, i) => walk(x, `${path}[${i}]`))
    if (n === null || typeof n !== 'object') return
    if (Array.isArray(n.type) || n.anyOf) unions++
    if (Array.isArray(n.type) && n.enum) arrayTypeWithEnum.push(path)
    for (const [k, v] of Object.entries(n)) walk(v, `${path}.${k}`)
  }
  walk(DRAFT_JSON_SCHEMA, '$')
  check('schema: al massimo 16 unioni (limite API)', unions <= 16, true)
  check('schema: nessun type-array con enum (rifiutato dall\'API)', arrayTypeWithEnum, [])
  check('schema: dotazioni sul filo si/no/non_trovato', DRAFT_JSON_SCHEMA.properties.dotazioni.items.properties.valore.enum, ['si', 'no', 'non_trovato'])
  check('schema: confidenza ammette "nessuna"', DRAFT_JSON_SCHEMA.properties.nome.properties.confidenza.enum, ['alta', 'media', 'bassa', 'nessuna'])
}

// ---------- dotazioni come array di voci ----------
{
  const w = (chiave, valore, confidenza = 'alta', citazione = 'p. 3') => ({ chiave, valore, confidenza, citazione })
  const arr = (voci) => draftOf({ dotazioni: voci })
  const d = arr([w('ascensore', 'si'), w('autoclave', 'no'), w('centrale_termica', 'non_trovato', 'nessuna', '')])
  check('array: "si" e "no" letti per chiave', [d.features.ascensore.value, d.features.autoclave.value], [true, false])
  check('array: dotazione assente = non_trovato, mai "no"', [d.features.lucernari.state, d.features.lucernari.value], ['non_trovato', null])
  check('array: tutte e 19 le chiavi presenti nella bozza', Object.keys(d.features), KEYS)
  const dup = arr([w('ascensore', 'si'), w('ascensore', 'no')])
  check('array: chiave duplicata con risposte diverse = non_trovato', [dup.features.ascensore.state, dup.features.ascensore.value], ['non_trovato', null])
  const dup2 = arr([w('ascensore', 'si'), w('ascensore', 'si'), w('autoclave', 'no')])
  check('array: la duplicazione non contagia le altre chiavi', dup2.features.autoclave.value, false)
  const unk = arr([w('piscina', 'si'), w('ascensore', 'si')])
  check('array: chiave sconosciuta ignorata, nessuna dotazione inventata', [Object.keys(unk.features).length, unk.features.ascensore.value], [19, true])
  check('array: voce non oggetto ignorata', arr([null, 5, 'x', w('ascensore', 'si')]).features.ascensore.value, true)
  check('array vuoto: tutte non trovate', Object.values(arr([]).features).every(f => f.state === 'non_trovato'), true)
  check('dotazioni nè oggetto né array: proposta non valida', normalizeDraftProposal({ ...proposal(), dotazioni: 'x' }), { error: 'Proposta non valida: dotazioni mancanti' })
  check('forma a oggetto ancora accettata', normalizeDraftProposal(proposal()).draft !== undefined, true)
}

// ---------- forma sul filo ----------
{
  const wire = (valore, confidenza = 'alta', citazione = 'p. 3') => ({ valore, confidenza, citazione })
  const d = draftOf({
    dotazioni: dotazioni({
      ascensore: wire('si'),
      autoclave: wire('no'),
      centrale_termica: wire('non_trovato', 'nessuna', ''),
      impianto_fotovoltaico: wire('boh'),
    }),
    classe_energetica: wire('', 'nessuna', ''),
    unita: [{ etichetta: 'Int. 1', scala: '', piano: null, confidenza: 'nessuna', citazione: '' }],
  })
  check('"si" sul filo = vero dal documento', [d.features.ascensore.state, d.features.ascensore.value], ['dal_documento', true])
  check('"no" sul filo con citazione = falso dal documento', [d.features.autoclave.state, d.features.autoclave.value], ['dal_documento', false])
  check('"non_trovato" sul filo: nessun valore, mai "no"', [d.features.centrale_termica.state, d.features.centrale_termica.value], ['non_trovato', null])
  check('valore sconosciuto sul filo: non_trovato, mai "no"', [d.features.impianto_fotovoltaico.state, d.features.impianto_fotovoltaico.value], ['non_trovato', null])
  check('testo vuoto + confidenza "nessuna": non_trovato', [d.energyClass.state, d.energyClass.value], ['non_trovato', null])
  check('scala vuota: etichetta senza prefisso', d.units[0].value.label, 'Int. 1')
  check('unità senza piano né confidenza: da_verificare', d.units[0].state, 'da_verificare')
  const noSenzaCit = draftOf({ dotazioni: dotazioni({ ascensore: wire('no', 'alta', '') }) })
  check('"no" sul filo senza citazione: da_verificare', noSenzaCit.features.ascensore.state, 'da_verificare')
  check('"no" sul filo da_verificare non conta come risposta', effectiveFeatureAnswer(noSenzaCit, {}, 'ascensore') === undefined, true)
}

console.log(`\n${eseguiti - fallimenti}/${eseguiti} casi ok`)
if (fallimenti > 0) {
  console.error(`✗ ${fallimenti} casi divergenti`)
  process.exit(1)
}
console.log('✓ bozza di residenza: tutti i casi coincidono')
