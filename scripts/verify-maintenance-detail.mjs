// ============================================================
// CasaZero — verifica del pannello di dettaglio di una voce (vista costruttore).
// Uso:  node --experimental-strip-types scripts/verify-maintenance-detail.mjs
//       (oppure: npm run verify:maintdetail)
// ------------------------------------------------------------
// COSA GARANTISCE: che src/lib/maintenance-detail.ts costruisca il dettaglio
// come stabilito: la riga è la STESSA della lista; regola e frase "chi la
// chiude" per modalità; garanzia nessuna/uguale/mista; fornitori nessuno/uno/
// diversi per unità con telefono ed email, e assenti senza permesso; le
// promemoria senza stato né date nella griglia unità, qualunque cosa dica il DB;
// l'evidenziazione dell'unità del filtro; i valori diversi elencati per
// conteggio (mai uniformati); lo storico per ordine, archiviate incluse, tetto,
// allegati e "Eseguito da"; la voce condominiale senza sezione Unità; che gli
// input non vengano mutati.
//
// PERCHE' ESISTE: un pannello che mostra una promemoria come scaduta, che
// uniforma in silenzio valori diversi tra le unità o che perde dallo storico i
// completamenti delle istanze archiviate passa il type-check e si vede solo a
// occhio.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente; exit 2 = import fallito — mai confuso con un esito positivo.
// ============================================================
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let D, L
try {
  D = await import(new URL('../src/lib/maintenance-detail.ts', import.meta.url).href)
  L = await import(new URL('../src/lib/maintenance-list.ts', import.meta.url).href)
} catch (err) {
  console.error(`\n✗ Impossibile importare il modulo: ${err.message}`)
  process.exit(2)
}
const { buildVoceDetail, COMMON_AREAS_LABEL, NO_WARRANTY_TEXT } = D
// Il tetto dello storico è scritto qui in chiaro, non importato: importarlo renderebbe il caso circolare.
const HISTORY_CAP = 20
const { buildMaintenanceList } = L

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
// Istanza di prova: voce t1, residente, tipo B, 12 mesi, unità u1, futura, senza garanzia né fornitore.
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
  warranty_info: o.warranty ?? null,
  suppliers: o.supplier ?? null,
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
const comp = (itemId, at, o = {}) => ({
  id: o.id ?? `c${++seq}`,
  item_id: itemId,
  completed_at: at,
  performed_by_name: o.by === undefined ? null : o.by,
  attachments: Array.from({ length: o.files ?? 0 }, (_, k) => ({ id: `a${k}` })),
})
const OPT = { highlightUnitId: null, showSuppliers: true }
const build = (items, completions = [], opt = OPT, tpl = 't1') => buildVoceDetail(tpl, items, completions, TODAY, opt)
const sup = (id, name, phone = null, email = null) => ({ id, name, phone, email })

// ---------- la riga è quella della lista ----------
{
  const items = [
    it({ unit: 'u1', label: 'Unità 1', due: '2026-06-01' }),
    it({ unit: 'u2', label: 'Unità 2', due: '2026-12-01' }),
  ]
  const completions = [comp(items[0].id, '2026-01-10T09:00:00+00:00')]
  check('la riga del dettaglio coincide con quella della lista',
    build(items, completions).row, buildMaintenanceList(items, completions, TODAY)[0])
  check('titolo e sistema dalla riga', [build(items).title, build(items).category], ['Voce', 'Termico'])
}

// ---------- voce inesistente o fuori dal piano ----------
check('id sconosciuto: nessun dettaglio', build([it()], [], OPT, 'zzz'), null)
check('tutte archiviate: nessun dettaglio', build([it({ act: 'archiviata' })]), null)
check('template non attivo: nessun dettaglio', build([it({ active: false })]), null)
check('nessuna istanza: nessun dettaglio', build([]), null)

// ---------- regola e chi la chiude, per modalità ----------
for (const [mode, rule, closer] of [
  ['residente', 'Dall’ultima esecuzione', 'Lo fa il residente'],
  ['amministratore', 'Dall’ultima esecuzione', 'Lo fa l’amministratore'],
  ['promemoria', 'Date fisse', 'Solo promemoria'],
]) {
  const d = build([it({ mode })])
  check(`${mode}: regola`, d.rule, { mixed: false, text: rule })
  check(`${mode}: chi la chiude`, d.closer, { mixed: false, text: closer })
}
check('la modalità si risolve item poi template',
  [build([it({ mode: null, tplMode: 'amministratore' })]).closer.text, build([it({ mode: 'residente', tplMode: 'amministratore' })]).closer.text],
  ['Lo fa l’amministratore', 'Lo fa il residente'])
{
  const d = build([
    it({ unit: 'u1', label: 'Unità 1', mode: 'residente' }),
    it({ unit: 'u2', label: 'Unità 2', mode: 'residente' }),
    it({ unit: 'u3', label: 'Unità 3', mode: 'amministratore' }),
  ])
  check('modalità diverse: valori diversi per conteggio',
    d.closer, { mixed: true, entries: [
      { label: 'Lo fa il residente', count: 2, text: 'Lo fa il residente: 2 unità' },
      { label: 'Lo fa l’amministratore', count: 1, text: 'Lo fa l’amministratore: 1 unità' },
    ] })
  check('regola uguale se nessuna è promemoria', d.rule, { mixed: false, text: 'Dall’ultima esecuzione' })
}
{
  const d = build([
    it({ unit: 'u1', label: 'Unità 1', mode: 'residente' }),
    it({ unit: 'u2', label: 'Unità 2', mode: 'promemoria' }),
  ])
  check('regola mista tra non promemoria e promemoria', d.rule.mixed, true)
  check('regola mista: elenco', d.rule.entries.map(e => e.text), ['Dall’ultima esecuzione: 1 unità', 'Date fisse: 1 unità'])
}

// ---------- obbligo e frequenza ----------
check('obbligo uguale', build([it({ obl: 'A' })]).obligation, { mixed: false, text: 'Obbligo di legge' })
check('obbligo dal template se manca sull’istanza', build([it({ tplObl: 'C' })]).obligation, { mixed: false, text: 'Consiglio' })
check('obbligo misto: ordine A, B, C a parità di conteggio',
  build([it({ unit: 'u1', obl: 'C' }), it({ unit: 'u2', label: 'Unità 2', obl: 'A' })]).obligation.entries.map(e => e.label),
  ['Obbligo di legge', 'Consiglio'])
check('frequenza uguale', build([it({ freq: 6 })]).frequency, { mixed: false, text: 'ogni 6 mesi' })
check('frequenza singolare', build([it({ freq: 1 })]).frequency, { mixed: false, text: 'ogni 1 mese' })
check('frequenza dal template', build([it({ tplFreq: 24 })]).frequency, { mixed: false, text: 'ogni 24 mesi' })
{
  const items = [
    ...Array.from({ length: 10 }, (_, k) => it({ unit: `u${k}`, label: `Unità ${k + 1}`, freq: 6 })),
    it({ unit: 'ux', label: 'Unità 11', freq: 699 }),
    it({ unit: 'uy', label: 'Unità 12', freq: 60 }),
  ]
  const d = build(items)
  check('3 frequenze: elencate per conteggio, poi per valore',
    d.frequency.entries.map(e => e.text), ['ogni 6 mesi: 10 unità', 'ogni 60 mesi: 1 unità', 'ogni 699 mesi: 1 unità'])
  check('3 frequenze: il campo è "diverso", mai uniformato', d.frequency.mixed, true)
}

// ---------- garanzia ----------
check('garanzia nessuna', build([it({}), it({ unit: 'u2', label: 'Unità 2' })]).warranty, { mixed: false, text: NO_WARRANTY_TEXT })
check('garanzia solo spazi = nessuna', build([it({ warranty: '   ' })]).warranty, { mixed: false, text: NO_WARRANTY_TEXT })
check('garanzia uguale (trim)', build([it({ warranty: ' 10 anni ' }), it({ unit: 'u2', label: 'Unità 2', warranty: '10 anni' })]).warranty,
  { mixed: false, text: '10 anni' })
check('garanzia mista: testo contro nessuna',
  build([it({ warranty: '10 anni' }), it({ unit: 'u2', label: 'Unità 2' })]).warranty.entries.map(e => e.text),
  ['10 anni: 1 unità', 'Non indicata: 1 unità'])

// ---------- fornitori ----------
check('fornitori: nessuno', build([it({})]).suppliers, { kind: 'none' })
check('fornitori: uno su tutte le unità, telefono ed email',
  build([
    it({ supplier: sup('s1', 'Termo Srl', '0432 111', 'info@termo.it') }),
    it({ unit: 'u2', label: 'Unità 2', supplier: sup('s1', 'Termo Srl', '0432 111', 'info@termo.it') }),
  ]).suppliers,
  { kind: 'single', supplier: { id: 's1', name: 'Termo Srl', phone: '0432 111', email: 'info@termo.it' } })
check('fornitori: telefono ed email assenti o vuoti diventano null',
  build([it({ supplier: { id: 's1', name: 'Termo Srl', phone: '  ', email: undefined } })]).suppliers,
  { kind: 'single', supplier: { id: 's1', name: 'Termo Srl', phone: null, email: null } })
{
  const d = build([
    it({ unit: 'u1', label: 'Unità 1' }),
    it({ unit: 'u2', label: 'Unità 10', supplier: sup('s1', 'Termo Srl', '0432 111') }),
    it({ unit: 'u3', label: 'Unità 2', supplier: sup('s2', 'Idro Snc', null, 'a@b.it') }),
  ])
  check('fornitori diversi: elenco per unità in ordine naturale, con "nessuno" dove manca',
    d.suppliers, { kind: 'per_unit', entries: [
      { unitLabel: 'Unità 1', supplier: null },
      { unitLabel: 'Unità 2', supplier: { id: 's2', name: 'Idro Snc', phone: null, email: 'a@b.it' } },
      { unitLabel: 'Unità 10', supplier: { id: 's1', name: 'Termo Srl', phone: '0432 111', email: null } },
    ] })
}
{
  // Caso Santa Giustina: fornitore su 1 unità di 5.
  const items = Array.from({ length: 5 }, (_, k) =>
    it({ unit: `u${k}`, label: `Unità ${k + 1}`, supplier: k === 2 ? sup('s1', 'Clima Srl') : null }))
  const d = build(items)
  check('fornitore su 1 unità di 5: elenco per unità, non "uno"', d.suppliers.kind, 'per_unit')
  check('fornitore su 1 unità di 5: 4 senza fornitore',
    d.suppliers.entries.filter(e => e.supplier === null).length, 4)
}
check('senza permesso (admin): la sezione non esiste, nemmeno "nessun fornitore"',
  build([it({ supplier: sup('s1', 'Termo Srl') })], [], { highlightUnitId: null, showSuppliers: false }).suppliers, null)
check('parti comuni: il fornitore diverso usa l’etichetta Parti comuni',
  build([it({ unit: null, supplier: sup('s1', 'Termo Srl') }), it({ unit: null })]).suppliers.entries.map(e => e.unitLabel),
  [COMMON_AREAS_LABEL, COMMON_AREAS_LABEL])

// ---------- promemoria: nessuno stato, nessuna data ----------
{
  const rem = it({ unit: 'u1', label: 'Unità 1', mode: 'promemoria', status: 'scaduta', due: '2020-01-01' })
  const d = build([rem], [comp(rem.id, '2025-05-05T10:00:00+00:00')])
  check('promemoria con status scaduta e data passata: gruppo Consigliate', d.row.group, 'consigliate')
  check('promemoria: prossima e ultima della riga nulle', [d.row.next, d.row.last], [null, null])
  check('promemoria: griglia unità senza stato, prossima né ultima',
    d.units.map(u => [u.state, u.next, u.last]), [[null, null, null]])
}
{
  const d = build([
    it({ unit: 'u1', label: 'Unità 1', mode: 'promemoria', status: 'scaduta', due: '2020-01-01' }),
    it({ unit: 'u2', label: 'Unità 2', due: '2026-06-01' }),
  ])
  check('voce mista: la promemoria resta senza stato, l’altra è scaduta',
    d.units.map(u => [u.label, u.state, u.next]), [['Unità 1', null, null], ['Unità 2', 'scaduta', '2026-06-01']])
}

// ---------- griglia unità ----------
{
  const items = [
    it({ unit: 'u1', label: 'Unità 10', due: '2026-06-14' }),
    it({ unit: 'u2', label: 'Unità 2', due: '2026-06-15' }),
    it({ unit: 'u3', label: 'Unità 3', due: '2026-07-16' }),
    it({ unit: 'u4', label: 'Unità 4', due: null }),
    it({ unit: 'u5', label: 'Unità 5', status: 'in_corso', due: '2026-06-01' }),
  ]
  const d = build(items, [comp(items[1].id, '2026-03-01T08:00:00+00:00'), comp(items[1].id, '2026-05-01T08:00:00+00:00')])
  check('ordine naturale delle etichette', d.units.map(u => u.label), ['Unità 2', 'Unità 3', 'Unità 4', 'Unità 5', 'Unità 10'])
  check('stati delle unità: stessa regola della lista',
    d.units.map(u => u.state), ['entro_30', 'piu_avanti', 'in_attesa_consegna', 'in_corso', 'scaduta'])
  check('ultima = completamento più recente dell’istanza',
    d.units.map(u => u.last), ['2026-05-01T08:00:00+00:00', null, null, null, null])
  check('unità senza data: prossima nulla', d.units.find(u => u.label === 'Unità 4').next, null)
  check('sezione unità: una riga per istanza', d.units.length, 5)
}
{
  const done = it({ unit: 'u1', label: 'Unità 1', status: 'completata', due: '2026-01-01' })
  const live = it({ unit: 'u2', label: 'Unità 2', due: '2027-01-01' })
  const d = build([done, live])
  check('istanza completata: stato completata, nessuna data', d.units.map(u => [u.state, u.next]), [['completata', null], ['piu_avanti', '2027-01-01']])
}
check('voce condominiale: nessuna sezione Unità', build([it({ unit: null })]).units, null)
check('voce condominiale: la riga è comunque costruita', build([it({ unit: null })]).row.isCommon, true)

// ---------- evidenziazione dell'unità filtrata ----------
{
  const items = [
    it({ unit: 'u1', label: 'Unità 1' }),
    it({ unit: 'u2', label: 'Unità 2' }),
  ]
  const hl = o => build(items, [], { ...OPT, ...o }).units.map(u => u.highlighted)
  check('nessun filtro: nessuna riga evidenziata', hl({ highlightUnitId: null }), [false, false])
  check('filtro su u2: solo la sua riga evidenziata', hl({ highlightUnitId: 'u2' }), [false, true])
  check('filtro su unità senza istanza: nessuna riga', hl({ highlightUnitId: 'zzz' }), [false, false])
  check('il filtro non toglie righe: il pannello resta sulla voce intera', build(items, [], { ...OPT, highlightUnitId: 'u2' }).units.length, 2)
}

// ---------- piano ≠ fascicolo: archiviate ----------
{
  const live = it({ unit: 'u1', label: 'Unità 1', warranty: '5 anni' })
  const archived = it({ unit: 'u2', label: 'Unità 2', act: 'archiviata', warranty: '99 anni', freq: 3 })
  const d = build([live, archived], [comp(archived.id, '2026-02-02T10:00:00+00:00', { by: 'Mario Rossi' })])
  check('archiviata: non rende la garanzia mista', d.warranty, { mixed: false, text: '5 anni' })
  check('archiviata: non rende la frequenza mista', d.frequency, { mixed: false, text: 'ogni 12 mesi' })
  check('archiviata: fuori dalla griglia unità', d.units.map(u => u.label), ['Unità 1'])
  check('archiviata: il suo completamento resta nello storico',
    d.history.entries.map(h => [h.scope, h.registeredBy]), [['Unità 2', 'Mario Rossi']])
}

// ---------- storico ----------
{
  const a = it({ unit: 'u1', label: 'Unità 1', mode: 'residente' })
  const b = it({ unit: null, mode: 'amministratore' })
  const r = it({ unit: 'u3', label: 'Unità 3', mode: 'promemoria' })
  const other = it({ tpl: 't2', title: 'Altra' })
  const cs = [
    comp(a.id, '2025-03-01T10:00:00+00:00', { id: 'c-old' }),
    comp(b.id, '2026-04-01T10:00:00+00:00', { id: 'c-new', by: 'Impresa Rossi', files: 2 }),
    comp(r.id, '2026-01-01T10:00:00+00:00', { id: 'c-rem', files: 1 }),
    comp(other.id, '2026-05-05T10:00:00+00:00', { id: 'c-other' }),
  ]
  const d = build([a, b, r, other], cs)
  check('storico: dal più recente, solo di questa voce', d.history.entries.map(h => h.id), ['c-new', 'c-rem', 'c-old'])
  check('storico: parti comuni, unità e totale', [d.history.entries.map(h => h.scope), d.history.total, d.history.hidden],
    [[COMMON_AREAS_LABEL, 'Unità 3', 'Unità 1'], 3, 0])
  check('storico: "Eseguito da" con nome oppure etichetta per modalità (formatRegisteredBy)',
    d.history.entries.map(h => h.registeredBy), ['Impresa Rossi', 'Autocertificato', 'Residente'])
  check('storico: numero di allegati', d.history.entries.map(h => h.attachmentCount), [2, 1, 0])
  check('storico: niente note né link nella forma', Object.keys(d.history.entries[0]).sort(),
    ['attachmentCount', 'completedAt', 'id', 'registeredBy', 'scope'])
}
{
  const a = it({ unit: 'u1', label: 'Unità 1' })
  const cs = Array.from({ length: HISTORY_CAP + 5 }, (_, k) =>
    comp(a.id, `2026-01-${String((k % 28) + 1).padStart(2, '0')}T10:00:00+00:00`, { id: `c${String(k).padStart(3, '0')}` }))
  const d = build([a], cs)
  check('storico: tetto a 20', d.history.entries.length, HISTORY_CAP)
  check('storico: "e altri N"', [d.history.total, d.history.hidden], [HISTORY_CAP + 5, 5])
  const dates = d.history.entries.map(h => h.completedAt)
  check('storico: ordine decrescente anche col tetto', dates, [...dates].sort().reverse())
}
check('storico vuoto', build([it()]).history, { entries: [], total: 0, hidden: 0 })
check('storico: completamento senza istanza nota ignorato', build([it()], [comp('zzz', '2026-01-01T00:00:00+00:00')]).history.total, 0)

// ---------- gli input non vengono mutati ----------
{
  const items = [
    it({ unit: 'u1', label: 'Unità 1', due: '2026-01-01', supplier: sup('s1', 'Termo Srl', '1', 'a@b.it'), warranty: 'x' }),
    it({ unit: 'u2', label: 'Unità 2', mode: 'promemoria' }),
  ]
  const completions = [comp(items[0].id, '2026-01-01T00:00:00+00:00', { files: 1 })]
  items.forEach(i => {
    Object.freeze(i); Object.freeze(i.maintenance_templates); Object.freeze(i.units); if (i.suppliers) Object.freeze(i.suppliers)
  })
  completions.forEach(c => { Object.freeze(c); Object.freeze(c.attachments) })
  Object.freeze(items); Object.freeze(completions)
  let errore = null
  try { build(items, completions, { highlightUnitId: 'u1', showSuppliers: true }) } catch (e) { errore = e.message }
  check('buildVoceDetail non muta gli input', errore, null)
}

console.log(`\n${eseguiti - fallimenti}/${eseguiti} casi ok`)
if (fallimenti > 0) {
  console.error(`✗ ${fallimenti} casi divergenti`)
  process.exit(1)
}
console.log('✓ dettaglio manutenzioni: tutti i casi coincidono')
