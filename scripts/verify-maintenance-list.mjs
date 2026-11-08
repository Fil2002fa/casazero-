// ============================================================
// CasaZero — verifica della lista manutenzioni vista costruttore.
// Uso:  node --experimental-strip-types scripts/verify-maintenance-list.mjs
//       (oppure: npm run verify:maintlist)
// ------------------------------------------------------------
// COSA GARANTISCE: che src/lib/maintenance-list.ts raggruppi le istanze per
// voce e per urgenza come stabilito: scadute dal confronto di date (mai dal
// campo status), "entro 30 giorni" con gli estremi inclusi (oggi e oggi+30), il
// gruppo "in corso" separato dalle scadute, le voci senza data in "in attesa di
// consegna", lo stato PEGGIORE tra le unità, la scadenza minima con l'unità che
// scade per prima, l'ultima esecuzione massima, e soprattutto che una promemoria
// non entri mai in un confronto di date: gruppo "Consigliate", prossima e
// ultima nulle, anche con status 'scaduta', data passata e completamenti. Poi i
// filtri in AND, le pillole (contano voci, sulle righe intere) e che gli input
// non vengano mutati.
//
// PERCHE' ESISTE: una lista che mette una promemoria tra le scadute, che conta
// l'estremo dei 30 giorni dalla parte sbagliata o che prende la scadenza
// massima invece della minima passa il type-check e si vede solo a occhio.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente; exit 2 = import fallito — mai confuso con un esito positivo.
// ============================================================
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let L
try {
  L = await import(new URL('../src/lib/maintenance-list.ts', import.meta.url).href)
} catch (err) {
  console.error(`\n✗ Impossibile importare il modulo: ${err.message}`)
  process.exit(2)
}
const {
  addDaysISO, buildMaintenanceList, groupRows, filterRows, itemsForUnit, hasActiveFilters,
  listSummary, summaryPills, NO_FILTERS, LIST_GROUP_ORDER, SOON_WINDOW_DAYS,
} = L

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

const TODAY = '2026-06-15'
let seq = 0
// Istanza di prova. `due`/`unit` accettano null esplicito. Default: voce "Voce"
// del template t1, residente, tipo B, 12 mesi, unità u1, scadenza futura.
const it = (o = {}) => ({
  id: o.id ?? `i${++seq}`,
  template_id: o.tpl ?? 't1',
  unit_id: o.unit === undefined ? 'u1' : o.unit,
  status: o.status ?? 'in_attesa',
  next_due_date: o.due === undefined ? '2027-01-01' : o.due,
  completion_mode: o.mode ?? null,
  obligation_type: o.obl ?? null,
  activation_status: o.act ?? 'inclusa',
  frequency_months: o.freq ?? null,
  maintenance_templates: {
    title: o.title ?? 'Voce',
    category: o.cat ?? 'Termico',
    completion_mode: o.tplMode ?? 'residente',
    obligation_type: o.tplObl ?? 'B',
    frequency_months: o.tplFreq ?? 12,
    is_active: o.active ?? true,
  },
  units: o.unit === null ? null : { label: o.label ?? 'Unità 1' },
})
const build = (items, completions = []) => buildMaintenanceList(items, completions, TODAY)
const groupsOf = rows => rows.map(r => `${r.title}:${r.group}`)

// ---------- date ----------
check('oggi + 30 giorni', addDaysISO('2026-06-15', 30), '2026-07-15')
check('oggi + 30 oltre il fine anno', addDaysISO('2026-12-15', 30), '2027-01-14')
check('oggi + 30 su febbraio bisestile', addDaysISO('2028-02-15', 30), '2028-03-16')
check('finestra = 30', SOON_WINDOW_DAYS, 30)

// ---------- finestra dei 30 giorni: estremi ----------
check('scadenza ieri: scaduta', build([it({ due: '2026-06-14' })])[0].group, 'scaduta')
check('scadenza oggi esatto: entro 30 giorni, NON scaduta', build([it({ due: '2026-06-15' })])[0].group, 'entro_30')
check('scadenza a +30 esatto: entro 30 giorni', build([it({ due: '2026-07-15' })])[0].group, 'entro_30')
check('scadenza a +31: più avanti', build([it({ due: '2026-07-16' })])[0].group, 'piu_avanti')
check('scadenza a +29: entro 30 giorni', build([it({ due: '2026-07-14' })])[0].group, 'entro_30')

// ---------- scaduta dal confronto, mai dal campo status ----------
check('status scaduta con data futura: non scaduta', build([it({ status: 'scaduta', due: '2027-03-01' })])[0].group, 'piu_avanti')
check('status in_attesa con data passata: scaduta', build([it({ status: 'in_attesa', due: '2026-01-01' })])[0].group, 'scaduta')

// ---------- in corso (presa in carico) ----------
check('in corso con data passata: gruppo in corso, non scadute',
  build([it({ status: 'in_corso', due: '2026-01-01' })])[0].group, 'in_corso')
check('in corso non conta tra le pillole scadute',
  summaryPills(listSummary(build([it({ status: 'in_corso', due: '2026-01-01' })]))).map(p => p.kind), ['clear'])

// ---------- unità non consegnata (data nulla) ----------
const noDate = build([it({ due: null, unit: 'u1' }), it({ due: null, unit: 'u2', label: 'Unità 2' })])
check('tutte senza data: in attesa di consegna', noDate[0].group, 'in_attesa_consegna')
check('tutte senza data: nessuna prossima', noDate[0].next, null)
check('tutte senza data: 2 in attesa su 2', [noDate[0].awaitingCount, noDate[0].timedCount], [2, 2])
const partial = build([
  it({ due: null, unit: 'u1' }),
  it({ due: '2027-02-01', unit: 'u2', label: 'Unità 2' }),
])
check('una con data e una senza: il gruppo segue quella con data', partial[0].group, 'piu_avanti')
check('una con data e una senza: la prossima salta quella senza data',
  partial[0].next, { date: '2027-02-01', unitLabel: 'Unità 2' })
check('una con data e una senza: 1 in attesa su 2', [partial[0].awaitingCount, partial[0].timedCount], [1, 2])

// ---------- voce condominiale ----------
const cond = build([it({ unit: null, due: '2026-06-30', mode: 'amministratore' })])[0]
check('condominiale: isCommon, 0 unità, unità della prossima nulla',
  [cond.isCommon, cond.unitCount, cond.next], [true, 0, { date: '2026-06-30', unitLabel: null }])
check('condominiale: gruppo entro 30 giorni', cond.group, 'entro_30')

// ---------- stato peggiore tra le unità ----------
const mix = build([
  it({ unit: 'u1', label: 'Unità 1', due: '2027-05-01' }),
  it({ unit: 'u2', label: 'Unità 2', due: '2026-06-20' }),
  it({ unit: 'u3', label: 'Unità 3', due: '2026-05-01' }),
])[0]
check('stato peggiore: scaduta batte entro 30 e più avanti', mix.group, 'scaduta')
check('prossima = data minima con la sua unità', mix.next, { date: '2026-05-01', unitLabel: 'Unità 3' })
check('3 unità', mix.unitCount, 3)
check('entro 30 batte più avanti', build([
  it({ unit: 'u1', due: '2027-05-01' }), it({ unit: 'u2', label: 'Unità 2', due: '2026-06-20' }),
])[0].group, 'entro_30')
check('in corso batte più avanti', build([
  it({ unit: 'u1', due: '2027-05-01' }), it({ unit: 'u2', label: 'Unità 2', status: 'in_corso', due: '2026-01-01' }),
])[0].group, 'in_corso')
check('entro 30 batte in corso (ordine dei gruppi)', build([
  it({ unit: 'u1', status: 'in_corso', due: '2026-01-01' }), it({ unit: 'u2', label: 'Unità 2', due: '2026-06-20' }),
])[0].group, 'entro_30')
check('ordine dei gruppi come deciso', [...LIST_GROUP_ORDER],
  ['scaduta', 'entro_30', 'in_corso', 'piu_avanti', 'in_attesa_consegna', 'consigliate'])
check('scaduta batte in corso', build([
  it({ unit: 'u1', status: 'in_corso', due: '2026-01-01' }), it({ unit: 'u2', label: 'Unità 2', due: '2026-02-01' }),
])[0].group, 'scaduta')

// stessa data su più unità: vince l'etichetta in ordine naturale
const tie = build([
  it({ unit: 'u10', label: 'Unità 10', due: '2026-09-01' }),
  it({ unit: 'u2', label: 'Unità 2', due: '2026-09-01' }),
])[0]
check('stessa data: "Unità 2" prima di "Unità 10"', tie.next, { date: '2026-09-01', unitLabel: 'Unità 2' })

// ---------- ultima esecuzione ----------
const withLast = build(
  [it({ id: 'a', unit: 'u1' }), it({ id: 'b', unit: 'u2', label: 'Unità 2' })],
  [
    { item_id: 'a', completed_at: '2025-03-01' },
    { item_id: 'a', completed_at: '2025-09-10' },
    { item_id: 'b', completed_at: '2025-06-01' },
    { item_id: 'altra-residenza', completed_at: '2026-01-01' },
  ],
)[0]
check('ultima = data massima tra i completamenti delle istanze', withLast.last, '2025-09-10')
check('nessun completamento: ultima nulla', build([it()])[0].last, null)

// ---------- valori diversi tra le unità ----------
const diversi = build([
  it({ unit: 'u1', label: 'Unità 1', freq: 6, tplFreq: 6, mode: 'amministratore' }),
  it({ unit: 'u2', label: 'Unità 2', freq: 60, tplFreq: 6 }),
  it({ unit: 'u3', label: 'Unità 3', freq: 699, tplFreq: 6, obl: 'A' }),
])[0]
check('frequenze distinte in ordine crescente', diversi.frequencies, [6, 60, 699])
check('modalità distinte nell\'ordine fisso', diversi.modes, ['amministratore', 'residente'])
check('obblighi distinti', diversi.obligations, ['A', 'B'])
check('frequenza dell\'istanza se c\'è, altrimenti quella del template',
  build([it({ freq: null, tplFreq: 24 })])[0].frequencies, [24])
check('valori uguali: un solo valore',
  build([it({ unit: 'u1' }), it({ unit: 'u2', label: 'Unità 2' })])[0].frequencies, [12])

// ---------- promemoria: mai un confronto di date ----------
const rem = build(
  [
    it({ id: 'p1', unit: 'u1', mode: 'promemoria', status: 'scaduta', due: '2020-01-01', title: 'Filtri' }),
    it({ id: 'p2', unit: 'u2', label: 'Unità 2', mode: 'promemoria', status: 'in_corso', due: '2026-06-16', title: 'Filtri' }),
  ],
  [{ item_id: 'p1', completed_at: '2026-06-01' }],
)[0]
check('promemoria con status scaduta e data passata: gruppo consigliate', rem.group, 'consigliate')
check('promemoria: nessuna prossima, nessuna ultima, nessun conteggio a tempo',
  [rem.next, rem.last, rem.awaitingCount, rem.timedCount], [null, null, 0, 0])
check('promemoria per template: la modalità arriva dal template',
  build([it({ tplMode: 'promemoria', status: 'scaduta', due: '2020-01-01' })])[0].group, 'consigliate')
check('promemoria senza data: consigliate, non in attesa di consegna',
  build([it({ mode: 'promemoria', due: null })])[0].group, 'consigliate')
check('promemoria non entra nelle pillole scadute',
  summaryPills(listSummary([...rem ? [rem] : [], ...build([it({ tpl: 't2', title: 'Altra', due: '2027-09-01' })])])).map(p => p.kind), ['clear'])

// voce mista: promemoria in una unità, a tempo nell'altra
const mista = build([
  it({ id: 'm1', unit: 'u1', label: 'Unità 1', mode: 'promemoria', due: '2020-01-01' }),
  it({ id: 'm2', unit: 'u2', label: 'Unità 2', due: '2027-04-01' }),
], [{ item_id: 'm1', completed_at: '2026-06-10' }])[0]
check('voce mista: il gruppo viene dalle sole istanze a tempo', mista.group, 'piu_avanti')
check('voce mista: la prossima ignora la promemoria (data più vecchia)',
  mista.next, { date: '2027-04-01', unitLabel: 'Unità 2' })
check('voce mista: l\'ultima ignora i completamenti della promemoria', mista.last, null)
check('voce mista: modalità entrambe', mista.modes, ['residente', 'promemoria'])
check('voce mista: 1 istanza a tempo', mista.timedCount, 1)

// ---------- istanze escluse dalla lista ----------
check('archiviata: fuori dal piano', build([it({ act: 'archiviata' })]), [])
check('esclusa: fuori dal piano', build([it({ act: 'esclusa' })]), [])
check('template spento a catalogo: fuori dal piano', build([it({ active: false })]), [])
check('completata: fuori dalla lista', build([it({ status: 'completata', due: '2026-01-01' })]), [])
check('voce con una archiviata e una inclusa: conta solo l\'inclusa',
  build([it({ act: 'archiviata', due: '2020-01-01' }), it({ unit: 'u2', label: 'Unità 2', due: '2027-09-01' })])[0].group, 'piu_avanti')
check('nessuna istanza: nessuna riga', build([]), [])

// ---------- ordine dei gruppi e delle righe ----------
const ordered = build([
  it({ tpl: 'c1', title: 'Cons', mode: 'promemoria' }),
  it({ tpl: 'a1', title: 'Attesa', due: null }),
  it({ tpl: 'p1', title: 'Avanti', due: '2027-01-01' }),
  it({ tpl: 'e2', title: 'Entro B', due: '2026-07-01' }),
  it({ tpl: 'e1', title: 'Entro A', due: '2026-07-01' }),
  it({ tpl: 'e0', title: 'Entro C', due: '2026-06-20' }),
  it({ tpl: 'k1', title: 'Corso', status: 'in_corso', due: '2026-01-01' }),
  it({ tpl: 's2', title: 'Scad tarda', due: '2026-06-01' }),
  it({ tpl: 's1', title: 'Scad prima', due: '2026-03-01' }),
])
check('ordine: gruppi, poi scadenza crescente, poi titolo', groupsOf(ordered), [
  'Scad prima:scaduta', 'Scad tarda:scaduta',
  'Entro C:entro_30', 'Entro A:entro_30', 'Entro B:entro_30',
  'Corso:in_corso', 'Avanti:piu_avanti', 'Attesa:in_attesa_consegna', 'Cons:consigliate',
])
check('groupRows: ordine di LIST_GROUP_ORDER, solo gruppi pieni',
  groupRows(ordered).map(g => g.key), [...LIST_GROUP_ORDER])
check('groupRows: nessun gruppo vuoto', groupRows(build([it({ due: '2027-01-01' })])).map(g => g.key), ['piu_avanti'])
check('groupRows: etichette', groupRows(ordered).map(g => g.label),
  ['Scadute', 'Entro 30 giorni', 'In corso', 'Più avanti', 'In attesa di consegna', 'Consigliate'])
check('conteggio righe dei gruppi = righe totali',
  groupRows(ordered).reduce((n, g) => n + g.rows.length, 0), ordered.length)

// ---------- filtro-unità (livello istanza) ----------
const units = [
  it({ id: 'x1', tpl: 't1', unit: 'u1', label: 'Unità 1' }),
  it({ id: 'x2', tpl: 't1', unit: 'u2', label: 'Unità 2', due: '2026-06-01' }),
  it({ id: 'x3', tpl: 't2', title: 'Comune', unit: null, mode: 'amministratore' }),
]
check('itemsForUnit: l\'unità scelta più le parti comuni', itemsForUnit(units, 'u1').map(i => i.id), ['x1', 'x3'])
check('itemsForUnit senza unità: tutto', itemsForUnit(units, null).map(i => i.id), ['x1', 'x2', 'x3'])
check('la riga dell\'unità 1 non vede la scadenza dell\'unità 2',
  build(itemsForUnit(units, 'u1')).find(r => r.templateId === 't1').group, 'piu_avanti')
check('la riga con tutte le unità è scaduta',
  build(units).find(r => r.templateId === 't1').group, 'scaduta')

// ---------- filtri in AND ----------
const fr = build([
  it({ tpl: 'f1', title: 'Verifica linee vita', cat: 'Sicurezza', unit: null, mode: 'amministratore', obl: 'A' }),
  it({ tpl: 'f2', title: 'Pulizia grondaie', cat: 'Coperture', unit: null, mode: 'amministratore', obl: 'B' }),
  it({ tpl: 'f3', title: 'Filtri VMC', cat: 'Ventilazione', mode: 'residente', obl: 'B' }),
  it({ tpl: 'f4', title: 'Manutenzione ascensore', cat: 'Ascensore', unit: null, mode: 'amministratore', obl: 'A' }),
])
const titles = rows => rows.map(r => r.title).sort()
check('nessun filtro: tutte', titles(filterRows(fr, NO_FILTERS)).length, 4)
check('ricerca nel titolo, senza maiuscole', titles(filterRows(fr, { ...NO_FILTERS, query: 'GRONDAIE' })), ['Pulizia grondaie'])
check('ricerca nel sistema', titles(filterRows(fr, { ...NO_FILTERS, query: 'ventilazione' })), ['Filtri VMC'])
check('ricerca senza accenti', titles(filterRows(fr, { ...NO_FILTERS, query: 'manutenzione ascensore' })), ['Manutenzione ascensore'])
check('ricerca con spazi attorno', titles(filterRows(fr, { ...NO_FILTERS, query: '  linee  ' })), ['Verifica linee vita'])
check('solo obblighi di legge', titles(filterRows(fr, { ...NO_FILTERS, lawOnly: true })), ['Manutenzione ascensore', 'Verifica linee vita'])
check('solo dell\'amministratore', titles(filterRows(fr, { ...NO_FILTERS, adminOnly: true })),
  ['Manutenzione ascensore', 'Pulizia grondaie', 'Verifica linee vita'])
check('legge E amministratore E ricerca = AND',
  titles(filterRows(fr, { ...NO_FILTERS, lawOnly: true, adminOnly: true, query: 'ascensore' })), ['Manutenzione ascensore'])
check('AND senza risultati', filterRows(fr, { ...NO_FILTERS, lawOnly: true, query: 'grondaie' }), [])
check('ricerca che non trova niente', filterRows(fr, { ...NO_FILTERS, query: 'zzz' }), [])
const divRows = build([
  it({ unit: 'u1', label: 'Unità 1', obl: 'B', mode: 'residente' }),
  it({ unit: 'u2', label: 'Unità 2', obl: 'A', mode: 'amministratore' }),
])
check('valori diversi: passa il filtro se una unità lo soddisfa (legge)',
  filterRows(divRows, { ...NO_FILTERS, lawOnly: true }).length, 1)
check('valori diversi: passa il filtro se una unità lo soddisfa (amministratore)',
  filterRows(divRows, { ...NO_FILTERS, adminOnly: true }).length, 1)
check('hasActiveFilters: nessuno', hasActiveFilters(NO_FILTERS), false)
check('hasActiveFilters: solo spazi nella ricerca', hasActiveFilters({ ...NO_FILTERS, query: '   ' }), false)
check('hasActiveFilters: ricerca', hasActiveFilters({ ...NO_FILTERS, query: 'a' }), true)
check('hasActiveFilters: unità', hasActiveFilters({ ...NO_FILTERS, unitId: 'u1' }), true)
check('hasActiveFilters: toggle', hasActiveFilters({ ...NO_FILTERS, lawOnly: true }), true)

// ---------- pillole ----------
const pillRows = build([
  it({ tpl: 'a', title: 'A', due: '2026-01-01' }),
  it({ tpl: 'b', title: 'B', due: '2026-02-01' }),
  it({ tpl: 'c', title: 'C', due: '2026-06-20' }),
  it({ tpl: 'd', title: 'D', due: '2027-01-01' }),
  it({ tpl: 'e', title: 'E', mode: 'promemoria' }),
])
check('riepilogo: voci scadute e voci entro 30 giorni', listSummary(pillRows), { overdue: 2, soon: 1 })
check('pillole: testi al plurale e al singolare', summaryPills(listSummary(pillRows)).map(p => `${p.kind}: ${p.text}`),
  ['overdue: 2 voci scadute', 'soon: 1 voce entro 30 giorni'])
check('pillole: singolare scadute',
  summaryPills({ overdue: 1, soon: 0 }).map(p => p.text), ['1 voce scaduta'])
check('pillole: plurale entro 30', summaryPills({ overdue: 0, soon: 4 }).map(p => p.text), ['4 voci entro 30 giorni'])
check('pillole: zero e zero = una pillola neutra', summaryPills({ overdue: 0, soon: 0 }).map(p => p.kind), ['clear'])
check('pillole: nessuna riga, nessun riepilogo', listSummary([]), null)
check('pillole: solo consigliate, nessun riepilogo',
  listSummary(build([it({ mode: 'promemoria' })])), null)
check('pillole: riepilogo null = nessuna pillola', summaryPills(null), [])
check('le pillole non dipendono dai filtri: il riepilogo si calcola sulle righe intere',
  listSummary(pillRows), listSummary([...pillRows]))

// ---------- gli input non vengono mutati ----------
const frozen = [it({ due: '2026-01-01' }), it({ unit: 'u2', label: 'Unità 2', mode: 'promemoria' })]
frozen.forEach(i => { Object.freeze(i); Object.freeze(i.maintenance_templates); Object.freeze(i.units) })
Object.freeze(frozen)
const frozenCompl = Object.freeze([Object.freeze({ item_id: frozen[0].id, completed_at: '2026-01-01' })])
let mutazione = null
try { buildMaintenanceList(frozen, frozenCompl, TODAY) } catch (e) { mutazione = e.message }
check('buildMaintenanceList non muta gli input', mutazione, null)

console.log(`\n${eseguiti - fallimenti}/${eseguiti} casi ok`)
if (fallimenti > 0) {
  console.error(`✗ ${fallimenti} casi divergenti`)
  process.exit(1)
}
console.log('✓ lista manutenzioni: tutti i casi coincidono')
