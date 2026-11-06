// ============================================================
// CasaZero — verifica della tabella "Tutti i documenti" (E1b, 7a).
// Uso:  node --experimental-strip-types scripts/verify-document-table.mjs
//       (oppure: npm run verify:doctable)
// ------------------------------------------------------------
// COSA GARANTISCE: che filtri (unità, tipo, stato, nome), ordinamento e
// etichette di src/lib/document-table.ts rispondano alle regole decise, e che
// la tabella non muti l'elenco che riceve.
//
// PERCHE' ESISTE: un filtro che sbaglia non da' errore, mostra solo meno (o
// piu') righe del dovuto, e a occhio su 13 documenti non si vede.
//
// Exit: 0 = ok; 1 = caso divergente; 2 = import fallito.
// ============================================================
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let T, R
try {
  T = await import(new URL('../src/lib/document-table.ts', import.meta.url).href)
  R = await import(new URL('../src/lib/document-rows.ts', import.meta.url).href)
} catch (err) {
  console.error(`\n✗ Impossibile importare il modulo: ${err.message}`)
  process.exit(2)
}
const {
  EMPTY_TABLE_FILTERS, STATE_FILTER_OPTIONS, UNIT_FILTER_NONE,
  documentNameText, filterTableDocs, isTableFiltered, presentDocTypes,
  sortTableDocs, sortedUnits, tableStateLabel,
} = T

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

let n = 0
function doc(over) {
  n++
  return {
    id: `d${n}`, title: `doc_${n}`, category: 'tecnici', file_name: `doc_${n}.pdf`,
    storage_path: `r/tecnici/${n}.pdf`, file_date: '2026-01-01', unit_id: null,
    created_at: '2026-01-01T10:00:00Z', classification_status: 'completata',
    doc_type: 'dich_conformita_dm37', sistema: null, classification_confidence: 0.9,
    extracted_metadata: null, extraction: null, overrides: [],
    proposed_unit_id: null, unit_proposal_confidence: null, unit_proposal_dismissed_at: null,
    ...over,
  }
}
const ids = list => list.map(d => d.id)
const f = over => ({ ...EMPTY_TABLE_FILTERS, ...over })

const A = 'unit-a', B = 'unit-b'
const d1 = doc({ id: 'd1', title: 'certificato_garanzia_caldaia', file_name: 'GARANZIA-2026.pdf', unit_id: A, doc_type: 'garanzia', classification_status: 'completata' })
const d2 = doc({ id: 'd2', title: 'DiCo_impianto_VMC', file_name: 'vmc.pdf', unit_id: B, doc_type: 'dich_conformita_dm37', classification_status: 'da_revisionare' })
const d3 = doc({ id: 'd3', title: 'planimetria_catastale', file_name: 'plan.pdf', unit_id: null, doc_type: 'planimetria_catastale', classification_status: 'non_classificato' })
const d4 = doc({ id: 'd4', title: 'agibilita', file_name: 'agib.pdf', unit_id: null, doc_type: 'dich_conformita_dm37', classification_status: 'fallita' })
const d5 = doc({ id: 'd5', title: 'senza_tipo', file_name: 'x.pdf', unit_id: A, doc_type: null, classification_status: 'in_corso' })
const ALL = [d1, d2, d3, d4, d5]

// --- filtri vuoti -----------------------------------------------------------------
check('senza filtri passano tutti', ids(filterTableDocs(ALL, f({}))), ['d1', 'd2', 'd3', 'd4', 'd5'])
check('isTableFiltered: vuoto', isTableFiltered(f({})), false)
check('isTableFiltered: ricerca di soli spazi non conta', isTableFiltered(f({ search: '   ' })), false)
check('isTableFiltered: unita', isTableFiltered(f({ unit: A })), true)
check('isTableFiltered: tipo', isTableFiltered(f({ docType: 'garanzia' })), true)
check('isTableFiltered: stato', isTableFiltered(f({ state: 'chiusa' })), true)
check('ricerca di soli spazi non filtra', ids(filterTableDocs(ALL, f({ search: '  ' }))).length, 5)

// --- unita -----------------------------------------------------------------------
check('unita A', ids(filterTableDocs(ALL, f({ unit: A }))), ['d1', 'd5'])
check('unita B', ids(filterTableDocs(ALL, f({ unit: B }))), ['d2'])
check('Senza unita', ids(filterTableDocs(ALL, f({ unit: UNIT_FILTER_NONE }))), ['d3', 'd4'])
check('unita senza documenti: nessuna riga', ids(filterTableDocs(ALL, f({ unit: 'unit-c' }))), [])

// --- tipo ------------------------------------------------------------------------
check('tipo garanzia', ids(filterTableDocs(ALL, f({ docType: 'garanzia' }))), ['d1'])
check('tipo dich_conformita_dm37', ids(filterTableDocs(ALL, f({ docType: 'dich_conformita_dm37' }))), ['d2', 'd4'])
check('un documento senza tipo non passa un filtro per tipo', ids(filterTableDocs([d5], f({ docType: 'garanzia' }))), [])

// --- stato (raggruppa per reviewState) -----------------------------------------------
check('stato Da verificare', ids(filterTableDocs(ALL, f({ state: 'da_rivedere' }))), ['d2'])
check('stato Classificato', ids(filterTableDocs(ALL, f({ state: 'chiusa' }))), ['d1'])
check('stato Da classificare = non classificato, fallita e in corso', ids(filterTableDocs(ALL, f({ state: 'in_lavorazione' }))), ['d3', 'd4', 'd5'])

// --- nome ------------------------------------------------------------------------
check('nome: titolo grezzo con underscore', ids(filterTableDocs(ALL, f({ search: 'garanzia_caldaia' }))), ['d1'])
check('nome: titolo leggibile con spazi', ids(filterTableDocs(ALL, f({ search: 'garanzia caldaia' }))), ['d1'])
check('nome: nome del file, maiuscole ignorate', ids(filterTableDocs(ALL, f({ search: 'garanzia-2026' }))), ['d1'])
check('nome: ricerca con maiuscole', ids(filterTableDocs(ALL, f({ search: 'DICO' }))), ['d2'])
check('nome: spazi ai bordi ignorati', ids(filterTableDocs(ALL, f({ search: '  vmc ' }))), ['d2'])
check('nome: nessun risultato', ids(filterTableDocs(ALL, f({ search: 'zzz' }))), [])
check('nome: non cerca nei dati estratti', ids(filterTableDocs([doc({ id: 'e1', title: 'a', file_name: 'a.pdf', extraction: { fields: { compagnia: 'Zurich' } } })], f({ search: 'zurich' }))), [])
check('documentNameText: minuscolo, titolo grezzo, leggibile e file', documentNameText({ title: 'DiCo_VMC', file_name: 'A.PDF' }), 'dico_vmc dico vmc a.pdf')

// --- combinazioni (AND) ---------------------------------------------------------------
check('unita A + tipo garanzia', ids(filterTableDocs(ALL, f({ unit: A, docType: 'garanzia' }))), ['d1'])
check('unita A + stato Classificato', ids(filterTableDocs(ALL, f({ unit: A, state: 'chiusa' }))), ['d1'])
check('unita B + stato Classificato = nessuno', ids(filterTableDocs(ALL, f({ unit: B, state: 'chiusa' }))), [])
check('senza unita + tipo + nome', ids(filterTableDocs(ALL, f({ unit: UNIT_FILTER_NONE, docType: 'dich_conformita_dm37', search: 'agib' }))), ['d4'])

// --- non muta l'input -----------------------------------------------------------------
const copia = JSON.stringify(ALL)
filterTableDocs(ALL, f({ unit: A }))
sortTableDocs(ALL)
check('filtri e ordine non mutano l\'elenco', JSON.stringify(ALL), copia)

// --- ordine ----------------------------------------------------------------------
const s1 = doc({ id: 's1', title: 'b', file_date: '2026-03-01' })
const s2 = doc({ id: 's2', title: 'a', file_date: '2026-03-01' })
const s3 = doc({ id: 's3', title: 'c', file_date: '2026-05-01' })
const s4 = doc({ id: 's4', title: 'a', file_date: '2026-03-01' })
check('piu recenti in alto, poi titolo, poi id', ids(sortTableDocs([s1, s2, s3, s4])), ['s3', 's2', 's4', 's1'])
check('l\'ordine non dipende da quello di ingresso', ids(sortTableDocs([s4, s3, s2, s1])), ['s3', 's2', 's4', 's1'])
check('data di upload quando manca la data del documento', ids(sortTableDocs([
  doc({ id: 'u1', file_date: null, created_at: '2026-02-01T00:00:00Z' }),
  doc({ id: 'u2', file_date: null, created_at: '2026-06-01T00:00:00Z' }),
])), ['u2', 'u1'])

// --- etichette di stato ----------------------------------------------------------
check('etichetta: classificato', tableStateLabel({ classification_status: 'completata' }), 'Classificato')
check('etichetta: da verificare', tableStateLabel({ classification_status: 'da_revisionare' }), 'Da verificare')
check('etichetta: da verificare = REVIEW_LABEL', tableStateLabel({ classification_status: 'da_revisionare' }), R.REVIEW_LABEL)
check('etichetta: non classificato', tableStateLabel({ classification_status: 'non_classificato' }), 'Non classificato')
check('etichetta: fallita', tableStateLabel({ classification_status: 'fallita' }), 'Non classificabile')
check('etichetta: in corso', tableStateLabel({ classification_status: 'in_corso' }), 'In classificazione')
check('le opzioni del filtro stato coprono tutti i reviewState', STATE_FILTER_OPTIONS.map(o => o.value), ['all', 'da_rivedere', 'chiusa', 'in_lavorazione'])
check('"Da rivedere" non compare tra le etichette di stato (e\' il tab del commit 8)', STATE_FILTER_OPTIONS.some(o => /rivedere/i.test(o.label)), false)

// --- tipi presenti e unita ---------------------------------------------------------
const presenti = presentDocTypes(ALL, 'all')
check('tipi presenti: solo quelli dei documenti', presenti.every(t => ['garanzia', 'dich_conformita_dm37', 'planimetria_catastale'].includes(t)) && presenti.length === 3, true)
check('tipi presenti: il tipo selezionato resta anche a zero documenti', presentDocTypes([], 'garanzia'), ['garanzia'])
check('tipi presenti: nessun documento, nessun filtro', presentDocTypes([], 'all'), [])
check('unita in ordine naturale: 2 prima di 10', sortedUnits([{ id: 'x', label: 'Unità 10' }, { id: 'y', label: 'Unità 2' }]).map(u => u.label), ['Unità 2', 'Unità 10'])
check('unita: l\'elenco di ingresso non cambia', (() => { const u = [{ id: 'x', label: 'B' }, { id: 'y', label: 'A' }]; sortedUnits(u); return u.map(v => v.id) })(), ['x', 'y'])

// --- la mappa degli stati e' una sola, usata anche dall'Excel -----------------------------
check('la mappa degli stati e\' esportata da document-rows', typeof R.CLASSIFICATION_STATUS_LABELS, 'object')

if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
process.exit(0)
