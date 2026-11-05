// ============================================================
// CasaZero — verifica delle schede dell'Excel di residenza (oltre ai
// Documenti, già coperti da verify-document-export.mjs).
// Uso:  node --experimental-strip-types scripts/verify-residence-export.mjs
//       (oppure: npm run verify:schede)
// ------------------------------------------------------------
// COSA GARANTISCE:
//  - fetchAllRows legge tutte le pagine, si ferma sull'errore senza
//    restituire dati parziali e non cicla all'infinito;
//  - scheda Scadenze (src/lib/deadline-export.ts): solo voci del piano
//    attivo; modalità, tipo e frequenza ereditati dal template; stato live;
//    INVARIANTE PROMEMORIA (mai "Scaduta", data vuota, anche con status
//    scaduta e data passata); colonna Fornitore solo se richiesta;
//  - un file xlsx vero con più schede si genera e contiene un foglio per
//    scheda.
//
// PERCHE' ESISTE: un file troncato in silenzio, una promemoria "Scaduta" o
// un fornitore mostrato a chi non deve vederlo passano il type-check e si
// vedono solo aprendo il file.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente; exit 2 = import fallito — mai confuso con un esito positivo.
// ============================================================

import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

const DEADLINE = new URL('../src/lib/deadline-export.ts', import.meta.url)
const FETCH_ALL = new URL('../src/lib/supabase/fetch-all.ts', import.meta.url)
const XLSX = new URL('../src/lib/xlsx-helpers.ts', import.meta.url)
const UNIT_EXPORT = new URL('../src/lib/unit-export.ts', import.meta.url)
const SUPPLIER_EXPORT = new URL('../src/lib/supplier-export.ts', import.meta.url)

let deadline, fetchAll, xlsxHelpers, writeXlsxFile, unitExport, supplierExport
try {
  supplierExport = await import(SUPPLIER_EXPORT.href)
  deadline = await import(DEADLINE.href)
  fetchAll = await import(FETCH_ALL.href)
  xlsxHelpers = await import(XLSX.href)
  unitExport = await import(UNIT_EXPORT.href)
  writeXlsxFile = (await import('write-excel-file/node')).default
} catch (err) {
  console.error(
    `\n✗ Impossibile importare i moduli: ${err.message}\n` +
    '  Rilancia con:  node --experimental-strip-types scripts/verify-residence-export.mjs\n' +
    '  (serve Node >= 22.6; da Node 23.6 il flag non è più necessario)'
  )
  process.exit(2)
}

const { deadlineExportHeaders, deadlineExportRows, toDeadlineItem } = deadline
const { fetchAllRows } = fetchAll
const { buildSheet, toSheetCell, numberCell } = xlsxHelpers
const { unitExportHeaders, unitExportRows, toUnitExportUnit, NO_ACCOUNT_LABEL, NOT_DELIVERED_LABEL } = unitExport

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

const T = value => ({ type: 'text', value })
const D = value => ({ type: 'date', value })
const _ = null

// --- fetchAllRows ------------------------------------------------------------
const pager = (total, { failAt = null } = {}) => async (from, to) => {
  if (failAt !== null && from === failAt) return { data: null, error: { message: 'boom' } }
  const data = []
  for (let i = from; i <= to && i < total; i++) data.push(i)
  return { data, error: null }
}
{
  const r = await fetchAllRows(pager(2500), 1000)
  check('paginazione: 2500 righe in 3 pagine, nessuna persa né ripetuta', [r.error, r.data?.length, r.data?.[0], r.data?.[2499]], [null, 2500, 0, 2499])
}
{
  const r = await fetchAllRows(pager(2000), 1000)
  check('paginazione: multiplo esatto della pagina (2000) → 2000 righe, pagina vuota di chiusura', [r.error, r.data?.length], [null, 2000])
}
{
  const r = await fetchAllRows(pager(0), 1000)
  check('paginazione: nessuna riga → array vuoto, nessun errore', [r.error, r.data], [null, []])
}
{
  const r = await fetchAllRows(pager(2500, { failAt: 1000 }), 1000)
  check('paginazione: errore alla seconda pagina → errore e NESSUN dato parziale', [r.data, r.error?.message], [null, 'boom'])
}
{
  const r = await fetchAllRows(async () => ({ data: [1], error: null }), 1)
  check('paginazione: non cicla all\'infinito (tetto di pagine) → errore', [r.data, typeof r.error?.message], [null, 'string'])
}

// --- scheda Scadenze --------------------------------------------------------
const TODAY = '2026-11-05'
const tpl = (over = {}) => ({
  title: 'Controllo caldaia', category: 'Impianti', frequency_months: 12,
  completion_mode: 'residente', obligation_type: 'A', is_active: true, ...over,
})
const item = (over = {}) => ({
  unit_id: null, status: 'in_attesa', next_due_date: '2026-12-01', completion_mode: null,
  obligation_type: null, frequency_months: null, activation_status: 'inclusa',
  maintenance_templates: tpl(), unitLabel: null, supplierName: null, ...over,
})
const rows = (items, includeSupplier = false) => deadlineExportRows(items, { today: TODAY, includeSupplier })

check('intestazioni senza fornitore', deadlineExportHeaders(false),
  ['Unità', 'Manutenzione', 'Categoria', 'Modalità', 'Tipo', 'Frequenza', 'Prossima scadenza', 'Stato'])
check('intestazioni con fornitore: una colonna in più in coda', deadlineExportHeaders(true).slice(8), ['Fornitore'])

check('voce di parti comuni, tutto dal template',
  rows([item()]),
  [[T('Parti comuni'), T('Controllo caldaia'), T('Impianti'), T('Residente'), T('Obbligo di legge'), T('ogni 12 mesi'), D('2026-12-01'), T('Pianificata')]])
check('la voce prevale sul template (modalità, tipo, frequenza)',
  rows([item({ completion_mode: 'amministratore', obligation_type: 'B', frequency_months: 1 })])[0].slice(3, 6),
  [T('Amministratore'), T('Raccomandata'), T('ogni 1 mese')])
check('pluralizzazione italiana della frequenza', rows([item({ frequency_months: 6 })])[0][5], T('ogni 6 mesi'))

// Stato live
check('data passata e non completata → Scaduta (calcolata, non dal campo status)',
  rows([item({ status: 'in_attesa', next_due_date: '2026-10-01' })])[0][7], T('Scaduta'))
check('in corso → In corso', rows([item({ status: 'in_corso', next_due_date: '2026-10-01' })])[0][7], T('In corso'))
check('senza data (consegna non registrata) → In attesa di consegna',
  rows([item({ next_due_date: null })])[0].slice(6), [_, T('In attesa di consegna')])
check('completata → Completata', rows([item({ status: 'completata', next_due_date: '2026-10-01' })])[0][7], T('Completata'))
check('scadenza oggi non è scaduta', rows([item({ next_due_date: TODAY })])[0][7], T('Pianificata'))

// INVARIANTE PROMEMORIA
{
  const promemoria = [
    item({ completion_mode: 'promemoria', status: 'scaduta', next_due_date: '2025-01-01' }),
    item({ maintenance_templates: tpl({ completion_mode: 'promemoria' }), status: 'in_attesa', next_due_date: '2025-01-01' }),
    item({ completion_mode: 'promemoria', status: 'in_corso', next_due_date: null }),
    item({ completion_mode: 'promemoria', status: 'completata', next_due_date: '2025-01-01' }),
  ]
  for (const [i, p] of promemoria.entries()) {
    const [r] = rows([p])
    check(`promemoria #${i + 1}: mai "Scaduta", data vuota, sempre "Consigliata · ogni 12 mesi"`, r.slice(6), [_, T('Consigliata · ogni 12 mesi')])
  }
  check('promemoria senza frequenza: solo "Consigliata", mai "ogni ? mesi"',
    rows([item({ completion_mode: 'promemoria', maintenance_templates: tpl({ frequency_months: null }) })])[0].slice(5),
    [_, _, T('Consigliata')])
}

// Perimetro: solo piano attivo
check('archiviate, escluse e template non attivi restano fuori',
  rows([
    item({ activation_status: 'archiviata' }),
    item({ activation_status: 'esclusa' }),
    item({ maintenance_templates: tpl({ is_active: false }) }),
    item({ maintenance_templates: null }),
  ]),
  [])

// Soggetto, ordine
{
  const out = rows([
    item({ unit_id: 'u10', unitLabel: 'Unità 10', maintenance_templates: tpl({ title: 'B' }) }),
    item({ unit_id: 'u2', unitLabel: 'Unità 2', maintenance_templates: tpl({ title: 'A' }) }),
    item({ unit_id: null, maintenance_templates: tpl({ title: 'Z' }) }),
    item({ unit_id: 'u2', unitLabel: 'Unità 2', maintenance_templates: tpl({ title: 'A0' }) }),
    item({ unit_id: 'ux', unitLabel: null, maintenance_templates: tpl({ title: 'Q' }) }),
  ]).map(r => `${r[0].value}|${r[1].value}`)
  check('ordine: parti comuni, poi unità in ordine naturale, poi titolo; unità senza etichetta dichiarata',
    out, ['Parti comuni|Z', 'Unità 2|A', 'Unità 2|A0', 'Unità 10|B', 'Unità sconosciuta|Q'])
}

// Fornitore
check('fornitore: colonna presente solo se richiesta',
  [rows([item({ supplierName: 'Termo Srl' })], true)[0].length, rows([item({ supplierName: 'Termo Srl' })], false)[0].length], [9, 8])
check('fornitore: valore e cella vuota se assente',
  [rows([item({ supplierName: 'Termo Srl' })], true)[0][8], rows([item()], true)[0][8]], [T('Termo Srl'), _])
check('senza includeSupplier il nome del fornitore non compare in nessuna cella',
  JSON.stringify(rows([item({ supplierName: 'Termo Srl' })], false)).includes('Termo'), false)

// Normalizzazione degli embed PostgREST
{
  const raw = {
    unit_id: 'u1', status: 'in_attesa', next_due_date: '2026-12-01', completion_mode: null, obligation_type: null,
    frequency_months: null, activation_status: 'inclusa',
    maintenance_templates: [tpl({ title: 'Da array' })], units: [{ label: 'Unità 1' }], suppliers: { name: 'Termo Srl' },
  }
  const it = toDeadlineItem(raw)
  check('toDeadlineItem: embed come array o come oggetto', [it.maintenance_templates.title, it.unitLabel, it.supplierName], ['Da array', 'Unità 1', 'Termo Srl'])
  const senza = toDeadlineItem({ ...raw, units: null, suppliers: undefined })
  check('toDeadlineItem: embed assenti → null', [senza.unitLabel, senza.supplierName], [null, null])
}

// --- scheda Riepilogo unità -------------------------------------------------
const N = value => ({ type: 'number', value })
const member = (over = {}) => ({ ended_at: null, is_primary: true, full_name: 'Maria Rossi', ...over })
const unit = (over = {}) => ({ id: 'u1', label: 'Unità 1', floor: 1, delivery_date: '2026-06-01', members: [member()], ...over })
const docOf = (over = {}) => ({
  id: 'doc', title: 'documento', category: 'tecnici', file_name: 'doc.pdf', storage_path: 'r/doc.pdf', file_date: null,
  unit_id: null, created_at: '2026-09-10T10:00:00+00:00', classification_status: 'completata', doc_type: null, sistema: null,
  classification_confidence: null, extracted_metadata: null, extraction: null, overrides: [], ...over,
})
const apeOf = unitId => docOf({
  id: 'ape-' + unitId, unit_id: unitId, doc_type: 'ape', file_date: '2024-02-01',
  extraction: {
    for_doc_type: 'ape', status: 'completata', document_date: '2024-02-20', ambito: null, unita_riferimento: null,
    valid_until: '2034-02-20', fields: { classe_energetica: 'A2', valida_fino_al: '2034-02-20' },
  },
})
const uRows = (units, items = [], docs = []) => unitExportRows(units, items, docs, { today: TODAY })

check('riepilogo: 15 intestazioni (9 + 2 per ognuno dei 3 documenti attesi)', unitExportHeaders().length, 15)
check('riepilogo: intestazioni di base', unitExportHeaders().slice(0, 9),
  ['Unità', 'Piano', 'Consegna', 'Residente', 'Documenti assegnati', 'Documenti da verificare', 'Voci attive', 'Voci scadute', 'Prossima scadenza'])
check('riepilogo: una colonna dati per ogni documento atteso',
  unitExportHeaders().slice(9).filter((h, i) => i % 2 === 1).every(h => h.endsWith('(dati)')), true)

{
  const items = [
    item({ unit_id: 'u1', next_due_date: '2026-10-01' }),                                                   // scaduta
    item({ unit_id: 'u1', next_due_date: '2027-03-01' }),                                                   // futura
    item({ unit_id: 'u1', completion_mode: 'promemoria', status: 'scaduta', next_due_date: '2025-01-01' }), // promemoria: mai scaduta, mai "prossima"
    item({ unit_id: 'u1', status: 'completata', next_due_date: '2026-09-01' }),                             // completata: non è "prossima"
    item({ unit_id: 'u1', activation_status: 'archiviata', next_due_date: '2026-08-01' }),                  // fuori dal piano
    item({ unit_id: 'u2', next_due_date: '2026-10-01' }),                                                   // altra unità
    item({ unit_id: null, next_due_date: '2026-10-01' }),                                                   // parti comuni
  ]
  const [r] = uRows([unit()], items, [apeOf('u1')])
  check('riepilogo: anagrafica e residente', r.slice(0, 4), [T('Unità 1'), N(1), D('2026-06-01'), T('Maria Rossi')])
  check('riepilogo: documenti assegnati e da verificare', r.slice(4, 6), [N(1), N(0)])
  check('riepilogo: voci attive = piano attivo della sola unità (4)', r[6], N(4))
  check('riepilogo: voci scadute live, promemoria esclusa', r[7], N(1))
  check('riepilogo: prossima scadenza = la più vicina tra le aperte non promemoria', r[8], D('2026-10-01'))
  check('riepilogo: APE presente con dati chiave, planimetria e DiCo mancanti',
    r.slice(9), [T('Presente'), T('Classe energetica: A2 · Valida fino al: 20 feb 2034'), T('Mancante'), _, T('Mancante'), _])
}
{
  const [r] = uRows([unit()], [item({ unit_id: 'u1', completion_mode: 'promemoria', next_due_date: '2025-01-01' })])
  check('riepilogo: solo promemoria → nessuna prossima scadenza, nessuna scaduta', [r[6], r[7], r[8]], [N(1), N(0), _])
}
{
  const [r] = uRows([unit({ id: 'u9', floor: null, delivery_date: null, members: [] })])
  check('riepilogo: non consegnata, senza piano e senza account', [r[1], r[2], r[3]], [_, T(NOT_DELIVERED_LABEL), T(NO_ACCOUNT_LABEL)])
  check('riepilogo: unità vuota → conteggi a zero e nessuna scadenza', [r[4], r[5], r[6], r[7], r[8]], [N(0), N(0), N(0), N(0), _])
}
check('riepilogo: solo membri terminati → Nessun account',
  uRows([unit({ members: [member({ ended_at: '2026-01-01' })] })])[0][3], T(NO_ACCOUNT_LABEL))
check('riepilogo: il primario attivo prevale, i membri terminati non contano',
  uRows([unit({ members: [member({ ended_at: '2026-01-01', full_name: 'Ex Inquilino' }), member({ is_primary: false, full_name: 'Luca Bianchi' }), member({ full_name: 'Maria Rossi' })] })])[0][3],
  T('Maria Rossi'))
check('riepilogo: account attivo senza nome → "Account attivo"',
  uRows([unit({ members: [member({ full_name: null })] })])[0][3], T('Account attivo'))
check('riepilogo: unità in ordine naturale (2 prima di 10)',
  uRows([unit({ id: 'a', label: 'Unità 10' }), unit({ id: 'b', label: 'Unità 2' })]).map(r => r[0].value), ['Unità 2', 'Unità 10'])
{
  const daRivedere = docOf({ id: 'x', unit_id: 'u1', classification_status: 'da_revisionare', extracted_metadata: { doc_type: 'ape' } })
  const [r] = uRows([unit()], [], [daRivedere])
  check('riepilogo: documento da rivedere → da verificare nel conteggio e nella cella APE', [r[4], r[5], r[9]], [N(1), N(1), T('Da verificare')])
}
{
  const u = toUnitExportUnit({
    id: 'u1', label: 'Unità 1', floor: 2, delivery_date: null,
    unit_members: [
      { ended_at: null, is_primary: true, profiles: [{ full_name: 'Maria Rossi' }] },
      { ended_at: '2026-01-01', is_primary: false, profiles: null },
    ],
  })
  check('toUnitExportUnit: profilo come array o assente', u.members, [
    { ended_at: null, is_primary: true, full_name: 'Maria Rossi' },
    { ended_at: '2026-01-01', is_primary: false, full_name: null },
  ])
  check('toUnitExportUnit: unit_members assente → nessun membro',
    toUnitExportUnit({ id: 'u', label: 'U', floor: null, delivery_date: null, unit_members: null }).members, [])
}
check('numberCell: numeri validi, il resto → null',
  [numberCell(0), numberCell(3), numberCell(null), numberCell(undefined), numberCell(Number.NaN)], [N(0), N(3), _, _, _])
{
  const c = toSheetCell(N(7))
  check('toSheetCell: numero → cella numerica', [c.type === Number, c.value], [true, 7])
}

// --- scheda Fornitori ---------------------------------------------------------
{
  const { SUPPLIER_EXPORT_HEADERS, mergeSupplierSources, supplierExportRows } = supplierExport
  const sup = (id, name, over = {}) => ({ id, name, phone: null, email: null, vat_number: null, ...over })
  const inst = (supplierId, over = {}) => ({ supplier_id: supplierId, sistema: 'elettrico', source: 'manuale', source_document_id: null, ...over })
  const titles = new Map([['d1', 'dico_elettrico_interno_3'], ['d2', 'dico_termico']])

  check('fornitori: intestazioni', SUPPLIER_EXPORT_HEADERS,
    ['Fornitore', 'Partita IVA', 'Telefono', 'Email', 'Impianti in questa residenza', 'Origine del collegamento', 'Documenti collegati'])

  // Due fonti unite
  {
    const merged = mergeSupplierSources(
      [sup('a', 'Alfa Srl'), sup('b', 'Beta Srl')],
      [
        { sistema: 'elettrico', source: 'documento', source_document_id: 'd1', suppliers: { id: 'b', name: 'Beta Srl', phone: '0421', email: null, vat_number: '01234567890' } },
        { sistema: 'vmc', source: 'manuale', source_document_id: null, suppliers: [{ id: 'c', name: 'Gamma Spa', phone: null, email: 'g@x.it', vat_number: null }] },
        { sistema: 'elettrico', source: 'manuale', source_document_id: null, suppliers: null },
      ],
    )
    check('fornitori: unione per id (da residenza, da collegamento anche come array; collegamento senza fornitore scartato)',
      [merged.suppliers.map(s => s.id).sort(), merged.installations.length], [['a', 'b', 'c'], 2])
    check('fornitori: il dato completo del collegamento vince su quello della residenza',
      merged.suppliers.find(s => s.id === 'b').vat_number, '01234567890')
  }

  // Righe
  {
    const rowsOut = supplierExportRows(
      [sup('b', 'Beta Srl', { vat_number: '01234567890', phone: '0421 1', email: 'b@x.it' }), sup('a', 'alfa srl'), sup('c', 'Gamma Spa')],
      [
        inst('b', { sistema: 'vmc', source: 'manuale' }),
        inst('b', { sistema: 'elettrico', source: 'documento', source_document_id: 'd1' }),
        inst('b', { sistema: 'elettrico', source: 'documento', source_document_id: 'd1' }),
        inst('c', { sistema: 'termico', source: 'manuale', source_document_id: 'd-non-in-elenco' }),
      ],
      titles,
    )
    check('fornitori: ordine alfabetico senza distinguere maiuscole', rowsOut.map(r => r[0].value), ['alfa srl', 'Beta Srl', 'Gamma Spa'])
    check('fornitori: senza collegamenti → celle di collegamento vuote', rowsOut[0].slice(4), [_, _, _])
    check('fornitori: P.IVA come testo con lo zero iniziale, contatti, impianti senza doppioni nell\'ordine del catalogo, origine mista, documento',
      rowsOut[1], [T('Beta Srl'), T('01234567890'), T('0421 1'), T('b@x.it'),
        T('Impianto elettrico, VMC (ventilazione meccanica)'), T('Da documento e manuale'), T('Dico elettrico interno 3')])
    check('fornitori: documento non in elenco → nessun titolo, origine manuale', [rowsOut[2][5], rowsOut[2][6]], [T('Manuale'), _])
  }
  check('fornitori: sistema non in catalogo → chiave grezza, mai vuoto né errore',
    supplierExportRows([sup('z', 'Zeta')], [inst('z', { sistema: 'sistema_futuro' })], new Map())[0][4], T('sistema_futuro'))
  check('fornitori: nessun fornitore → nessuna riga', supplierExportRows([], [], new Map()), [])
}

// --- file xlsx vero ----------------------------------------------------------
{
  const sheets = [
    buildSheet('Scadenze', deadlineExportHeaders(false), rows([item(), item({ completion_mode: 'promemoria' })]), [18, 44, 22, 16, 18, 16, 16, 28]),
    buildSheet('Documenti', ['Titolo'], [[T('Doc')]], [30]),
  ]
  const buf = await writeXlsxFile(sheets).toBuffer()
  const bytes = new Uint8Array(buf)
  const text = Buffer.from(bytes).toString('latin1')
  check('xlsx: è un archivio zip (firma PK)', [bytes[0], bytes[1]], [0x50, 0x4b])
  check('xlsx: un foglio per scheda',
    ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'].map(n => text.includes(n)), [true, true])
  check('xlsx: non ci sono più di due fogli', text.includes('xl/worksheets/sheet3.xml'), false)
}

// --- esito -------------------------------------------------------------------
if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
process.exit(0)
