// ============================================================
// CasaZero — verifica della sezione "Dal costruttore" della pagina Documenti
// del residente.
// Uso:  npm run verify:resdocs
// COSA GARANTISCE: versioni dello stesso file+tipo in una riga ("+N versioni",
// più recente per prima); titolo dal tipo documento; riga sotto con ambito,
// impianto e data; sezioni per categoria nell'ordine del DB, senza sezioni
// vuote; conteggio della card verde, della sezione e delle righe sempre
// coerenti (stesso elenco), anche con filtri; ricerca su titolo, nome file e
// dati estratti visibili, MAI su P.IVA; stati vuoto e nessun risultato.
// exit 0 = ok; 1 = caso divergente; 2 = import fallito.
// ============================================================
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let V, H
try {
  V = await import(new URL('../src/lib/resident-documents-view.ts', import.meta.url).href)
  H = await import(new URL('../src/lib/home-documents.ts', import.meta.url).href)
} catch (err) {
  console.error('Import fallito:', err)
  process.exit(2)
}

let failed = 0
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}

const doc = (id, file, type, category, created, o = {}) => ({
  id,
  title: o.title ?? file.replace(/\.pdf$/, ''),
  category,
  file_name: file,
  storage_path: `res/${category}/${id}_${file}`,
  file_date: o.fileDate ?? null,
  unit_id: o.unit ?? null,
  created_at: created,
  classification_status: 'completata',
  doc_type: type,
  sistema: o.sistema ?? null,
  classification_confidence: null,
  extracted_metadata: o.meta ?? null,
  extraction: o.extraction ?? null,
  overrides: [],
  proposed_unit_id: null,
  unit_proposal_confidence: null,
  unit_proposal_dismissed_at: null,
})

const apeExtraction = {
  for_doc_type: 'ape', status: 'completata', document_date: '2026-05-20',
  ambito: null, unita_riferimento: null, valid_until: null, fields: { classe_energetica: 'B' },
}

const docs = [
  // Tre versioni dello stesso file e tipo.
  doc('l1', '09_Libretto.pdf', 'manuale', 'proprieta', '2026-06-01T10:00:00Z', { fileDate: '2026-06-01' }),
  doc('l2', '09_Libretto.pdf', 'manuale', 'proprieta', '2026-10-25T10:00:00Z', { fileDate: '2026-10-25' }),
  doc('l3', '09_Libretto.pdf', 'manuale', 'proprieta', '2026-06-01T11:00:00Z', { fileDate: '2026-06-01' }),
  // Due versioni.
  doc('a1', '12_Agibilita.pdf', 'agibilita', 'amministrativi', '2026-05-28T10:00:00Z', { fileDate: '2026-05-28' }),
  doc('a2', '12_Agibilita.pdf', 'agibilita', 'amministrativi', '2026-05-29T10:00:00Z', { fileDate: '2026-05-29' }),
  // Unità, con dato estratto.
  doc('e1', '05_APE_B12.pdf', 'ape', 'energetici', '2026-05-20T10:00:00Z', { unit: 'u1', extraction: apeExtraction }),
  // DiCo con impianto e installatore (P.IVA nel verbale: non deve essere cercabile).
  doc('c1', '07_DiCo_termico.pdf', 'dich_conformita_dm37', 'conformita', '2026-05-21T10:00:00Z', {
    fileDate: '2026-05-21', sistema: 'termico',
    meta: { ragione_sociale_installatore: 'Termotecnica Colli S.r.l.', partita_iva_installatore: '01234567890' },
  }),
  // Senza tipo: titolo umanizzato.
  doc('t1', 'nota_varia.pdf', null, 'tecnici', '2026-04-01T10:00:00Z', { title: 'nota_varia', fileDate: '2026-04-01' }),
]

const items = V.toResidentDocumentItems(docs)
const byFile = Object.fromEntries(items.map(i => [i.fileName, i]))

// --- Raggruppamento e righe ---------------------------------------------------
eq('8 righe → 5 gruppi', items.length, 5)
eq('stesso numero dei gruppi della home', items.length, H.groupHomeDocuments(docs).length)
eq('tre versioni: etichetta', byFile['09_Libretto.pdf'].versionsLabel, '+2 versioni')
eq('due versioni: etichetta singolare', byFile['12_Agibilita.pdf'].versionsLabel, '+1 versione')
eq('una versione: nessuna etichetta', byFile['05_APE_B12.pdf'].versionsLabel, null)
eq('versioni: più recente per prima', byFile['09_Libretto.pdf'].versions.map(v => v.id), ['l2', 'l3', 'l1'])
eq('versioni: solo la prima è la più recente', byFile['09_Libretto.pdf'].versions.map(v => v.isLatest), [true, false, false])
eq('versioni: date', byFile['09_Libretto.pdf'].versions.map(v => v.dateLabel), ['25 ott 2026', '1 giu 2026', '1 giu 2026'])
eq('versione: percorso del file', byFile['12_Agibilita.pdf'].versions[0].storagePath, 'res/amministrativi/a2_12_Agibilita.pdf')
eq('titolo dal tipo documento', byFile['12_Agibilita.pdf'].title, 'Agibilità')
eq('titolo senza tipo: umanizzato', byFile['nota_varia.pdf'].title, 'Nota varia')
eq('ambito residenza', byFile['12_Agibilita.pdf'].scopeLabel, 'Residenza')
eq('ambito unità', byFile['05_APE_B12.pdf'].scopeLabel, 'Il tuo appartamento')
eq('riga sotto con impianto', byFile['07_DiCo_termico.pdf'].subtitle, 'Residenza · Impianto termico · 21 mag 2026')
eq('riga sotto senza impianto', byFile['12_Agibilita.pdf'].subtitle, 'Residenza · 29 mag 2026')
eq('data dall\'estrazione (APE)', byFile['05_APE_B12.pdf'].subtitle, 'Il tuo appartamento · 20 mag 2026')
eq('dati estratti visibili: classe APE', byFile['05_APE_B12.pdf'].facts, ['Classe B'])
eq('dati estratti visibili: installatore, senza P.IVA', byFile['07_DiCo_termico.pdf'].facts, ['Installatore: Termotecnica Colli S.r.l.'])

// --- Sezioni e conteggi ---------------------------------------------------------
const all = V.filterResidentDocuments(items, V.EMPTY_RESIDENT_DOC_FILTERS)
eq('tutti: sezioni nell\'ordine delle categorie, senza vuote', all.sections.map(s => s.category), ['proprieta', 'tecnici', 'energetici', 'conformita', 'amministrativi'])
eq('tutti: etichette delle categorie', all.sections.map(s => s.label), ['Proprietà', 'Tecnici', 'Energetici', 'Conformità', 'Amministrativi'])
eq('tutti: total = visible', [all.total, all.visible], [5, 5])
eq('tutti: nessun filtro, nessun vuoto', [all.filtering, all.empty], [false, null])

const sumItems = view => view.sections.reduce((n, s) => n + s.items.length, 0)
const coherent = (label, view) => eq(`${label}: conteggio = somma delle righe`, view.visible, sumItems(view))
coherent('tutti', all)

const cat = V.filterResidentDocuments(items, { category: 'conformita', search: '' })
eq('categoria: una sola sezione', cat.sections.map(s => s.category), ['conformita'])
eq('categoria: visible, total invariato', [cat.visible, cat.total], [1, 5])
eq('categoria: filtro attivo', cat.filtering, true)
coherent('categoria', cat)

const emptyCat = V.filterResidentDocuments(items.filter(i => i.category !== 'tecnici'), { category: 'tecnici', search: '' })
eq('categoria vuota: nessun risultato', [emptyCat.visible, emptyCat.empty], [0, 'no-results'])

// --- Ricerca --------------------------------------------------------------------
const q = search => V.filterResidentDocuments(items, { category: 'all', search }).sections.flatMap(s => s.items.map(i => i.fileName))
eq('ricerca: etichetta del tipo', q('agibilità'), ['12_Agibilita.pdf'])
eq('ricerca: maiuscole indifferenti', q('AGIBILITÀ'), ['12_Agibilita.pdf'])
eq('ricerca: nome file', q('libretto'), ['09_Libretto.pdf'])
eq('ricerca: dato estratto visibile', q('classe b'), ['05_APE_B12.pdf'])
eq('ricerca: installatore', q('termotecnica'), ['07_DiCo_termico.pdf'])
eq('ricerca: impianto', q('impianto termico'), ['07_DiCo_termico.pdf'])
eq('ricerca: ambito', q('appartamento'), ['05_APE_B12.pdf'])
eq('ricerca: la P.IVA non si trova', q('01234567890'), [])
eq('ricerca: spazi attorno ignorati', q('  libretto  '), ['09_Libretto.pdf'])
eq('ricerca: solo spazi non filtra', V.isFiltering({ category: 'all', search: '   ' }), false)

const searched = V.filterResidentDocuments(items, { category: 'all', search: 'a' })
coherent('ricerca "a"', searched)
const none = V.filterResidentDocuments(items, { category: 'all', search: 'zzzz' })
eq('nessun risultato', [none.visible, none.empty, none.filtering, none.total], [0, 'no-results', true, 5])

// --- Indirizzo del file ---------------------------------------------------------
eq('url: scaricamento (come prima)', V.residentDocumentUrl('res/conformita/17_DiCo termico.pdf'), '/api/download?bucket=documents&path=res%2Fconformita%2F17_DiCo%20termico.pdf')
eq('url: apertura in linea', V.residentDocumentUrl('res/a.pdf', true), '/api/download?bucket=documents&path=res%2Fa.pdf&inline=1')

// --- Nessun documento -----------------------------------------------------------
const nothing = V.filterResidentDocuments(V.toResidentDocumentItems([]), V.EMPTY_RESIDENT_DOC_FILTERS)
eq('nessun documento: stato vuoto', [nothing.total, nothing.visible, nothing.empty, nothing.sections], [0, 0, 'none', []])

if (failed) { console.error(`\n${failed} casi divergenti`); process.exit(1) }
console.log('\nTutti i casi ok')
