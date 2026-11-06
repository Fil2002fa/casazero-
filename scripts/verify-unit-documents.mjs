// ============================================================
// CasaZero — verifica dei documenti attesi per unità.
// Uso:  node --experimental-strip-types scripts/verify-unit-documents.mjs
//       (oppure: npm run verify:unitdocs)
// ------------------------------------------------------------
// COSA GARANTISCE: che unitDocumentRows (src/lib/unit-documents.ts) dia lo
// stato giusto (presente / da verificare / mancante) per APE, planimetria
// catastale e DiCo dell'impianto elettrico di ogni unità, con i dati chiave
// corretti, su casi positivi E negativi: documento di un'altra unità o della
// residenza, tipo o sistema sbagliati, classificazione non chiusa, due
// documenti dello stesso tipo, unità senza documenti.
//
// PERCHE' ESISTE: il quadro in pagina e il riepilogo dell'Excel leggono lo
// stesso calcolo; un documento attribuito all'unità sbagliata o una cella
// "presente" costruita dalla proposta AI invece che dalla colonna confermata
// passano il type-check e si vedono solo a occhio.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente; exit 2 = import fallito — mai confuso con un esito positivo.
// ============================================================

import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

const MOD = new URL('../src/lib/unit-documents.ts', import.meta.url)

let mod
try {
  mod = await import(MOD.href)
} catch (err) {
  console.error(
    `\n✗ Impossibile importare il modulo: ${err.message}\n` +
    '  Rilancia con:  node --experimental-strip-types scripts/verify-unit-documents.mjs\n' +
    '  (serve Node >= 22.6; da Node 23.6 il flag non è più necessario)'
  )
  process.exit(2)
}

const { UNIT_EXPECTATIONS, unitDocumentRows, documentsMentioningUnitWithoutAssignment, sistemaMatches, formatCellKeyData, otherVersions } = mod

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

// --- fixture ---------------------------------------------------------------
const doc = (over = {}) => ({
  id: 'doc', title: 'documento_prova', category: 'tecnici', file_name: 'documento.pdf',
  storage_path: 'r/documento.pdf', file_date: null, unit_id: null,
  created_at: '2026-09-10T23:30:00+00:00', classification_status: 'completata',
  doc_type: null, sistema: null, classification_confidence: null,
  extracted_metadata: null, extraction: null, overrides: [], ...over,
})
const ext = (over = {}) => ({
  for_doc_type: 'ape', status: 'completata', document_date: null, ambito: null,
  unita_riferimento: null, valid_until: null, fields: {}, ...over,
})
const apeDoc = (id, unit, over = {}) => doc({
  id, unit_id: unit, doc_type: 'ape', file_date: '2024-02-01',
  extraction: ext({
    for_doc_type: 'ape', document_date: '2024-02-20', valid_until: '2034-02-20',
    fields: { classe_energetica: 'A2', valida_fino_al: '2034-02-20' },
  }),
  ...over,
})
const planDoc = (id, unit, over = {}) => doc({ id, unit_id: unit, doc_type: 'planimetria_catastale', file_date: '2023-05-01', ...over })
const dicoDoc = (id, unit, sistema, over = {}) => doc({
  id, unit_id: unit, doc_type: 'dich_conformita_dm37', sistema, file_date: '2025-01-15',
  extracted_metadata: { ragione_sociale_installatore: 'Elettro Veneta S.r.l.', partita_iva_installatore: '01234567890' },
  ...over,
})

const U = id => ({ id, label: `Unità ${id}` })
const stati = row => row.cells.map(c => c.state)
const chiavi = UNIT_EXPECTATIONS.map(e => e.key)

check('attesi: APE, planimetria, DiCo elettrica (D1)', chiavi, ['ape', 'planimetria_catastale', 'dico_elettrico'])
check('attesi: DiCo con sistema elettrico', UNIT_EXPECTATIONS[2].sistema, 'elettrico')

// --- unità senza documenti ---------------------------------------------------
{
  const [r] = unitDocumentRows([], [U('u1')])
  check('unità senza documenti: tutto mancante', stati(r), ['mancante', 'mancante', 'mancante'])
  check('unità senza documenti: conteggi a zero', [r.documentCount, r.toVerifyCount], [0, 0])
}

// --- presente e dati chiave -----------------------------------------------------
{
  const docs = [apeDoc('a', 'u1'), planDoc('p', 'u1'), dicoDoc('d', 'u1', 'elettrico')]
  const [r] = unitDocumentRows(docs, [U('u1')])
  check('tre documenti confermati: tutto presente', stati(r), ['presente', 'presente', 'presente'])
  check('dati chiave APE: classe e validità',
    r.cells[0].keyData, [
      { label: 'Classe energetica', value: 'A2', kind: 'text' },
      { label: 'Valida fino al', value: '2034-02-20', kind: 'date' },
    ])
  check('dati chiave planimetria: data documento (dal file)',
    r.cells[1].keyData, [{ label: 'Data documento', value: '2023-05-01', kind: 'date' }])
  check('dati chiave DiCo: impresa e data',
    r.cells[2].keyData, [
      { label: 'Impresa installatrice', value: 'Elettro Veneta S.r.l.', kind: 'text' },
      { label: 'Data documento', value: '2025-01-15', kind: 'date' },
    ])
  check('conteggio documenti dell\'unità', r.documentCount, 3)
}

// --- attribuzione all'unità --------------------------------------------------
{
  const docs = [apeDoc('a2', 'u2'), planDoc('p0', null)]
  const [r1, r2] = unitDocumentRows(docs, [U('u1'), U('u2')])
  check('documento di un\'altra unità o della residenza non conta', stati(r1), ['mancante', 'mancante', 'mancante'])
  check('lo stesso documento conta solo per la sua unità', stati(r2), ['presente', 'mancante', 'mancante'])
}

// --- tipo e sistema ------------------------------------------------------------
{
  const [r] = unitDocumentRows([dicoDoc('d', 'u1', 'ventilazione')], [U('u1')])
  check('DiCo di un altro impianto: la voce elettrica resta mancante', stati(r), ['mancante', 'mancante', 'mancante'])
}
{
  const [r] = unitDocumentRows([dicoDoc('d', 'u1', null)], [U('u1')])
  check('DiCo senza sistema: combacia (stessa regola di B4)', stati(r), ['mancante', 'mancante', 'presente'])
}
{
  const [r] = unitDocumentRows([doc({ id: 'x', unit_id: 'u1', doc_type: 'altro' })], [U('u1')])
  check('documento "altro": conta come documento, non riempie nessuna voce',
    [stati(r), r.documentCount], [['mancante', 'mancante', 'mancante'], 1])
}
check('sistemaMatches: null da una parte combacia',
  [sistemaMatches('elettrico', null), sistemaMatches(null, 'idrico'), sistemaMatches('elettrico', 'elettrico')], [true, true, true])
check('sistemaMatches: sistemi diversi non combaciano', sistemaMatches('elettrico', 'ventilazione'), false)

// --- classificazione non chiusa --------------------------------------------------
{
  const proposta = doc({
    id: 'r', unit_id: 'u1', classification_status: 'da_revisionare', doc_type: null,
    extracted_metadata: { doc_type: 'ape', confidence: 0.6 },
  })
  const [r] = unitDocumentRows([proposta], [U('u1')])
  check('da rivedere con proposta APE: voce APE "da verificare", niente dati chiave',
    [stati(r), r.cells[0].keyData], [['da_verificare', 'mancante', 'mancante'], []])
  check('da rivedere: conta tra i documenti da verificare', [r.documentCount, r.toVerifyCount], [1, 1])
}
{
  const senzaProposta = doc({ id: 'n', unit_id: 'u1', classification_status: 'non_classificato' })
  const [r] = unitDocumentRows([senzaProposta], [U('u1')])
  check('non classificato senza proposta: nessuna voce marcata, ma da verificare nel conteggio',
    [stati(r), r.toVerifyCount], [['mancante', 'mancante', 'mancante'], 1])
}
{
  const propostaDico = doc({
    id: 'r2', unit_id: 'u1', classification_status: 'da_revisionare',
    extracted_metadata: { doc_type: 'dich_conformita_dm37', sistema: 'ventilazione' },
  })
  const [r] = unitDocumentRows([propostaDico], [U('u1')])
  check('proposta DiCo di un altro impianto: la voce elettrica non si marca', stati(r), ['mancante', 'mancante', 'mancante'])
}
{
  const confermato = apeDoc('ok', 'u1')
  const inRevisione = doc({ id: 'r3', unit_id: 'u1', classification_status: 'da_revisionare', extracted_metadata: { doc_type: 'ape' } })
  const [r] = unitDocumentRows([inRevisione, confermato], [U('u1')])
  check('a parità di data un documento confermato precede uno in revisione dello stesso tipo', [r.cells[0].state, r.cells[0].doc.id], ['presente', 'ok'])
}
{
  // Il verbale AI da solo non rende "presente": serve la colonna confermata.
  const soloVerbale = doc({ id: 'v', unit_id: 'u1', classification_status: 'completata', doc_type: null, extracted_metadata: { doc_type: 'ape' } })
  const [r] = unitDocumentRows([soloVerbale], [U('u1')])
  check('completata ma doc_type null e solo verbale AI: non presente', r.cells[0].state, 'mancante')
}

// --- due documenti dello stesso tipo ------------------------------------------
{
  const [r] = unitDocumentRows([apeDoc('nuovo', 'u1'), apeDoc('vecchio', 'u1')], [U('u1')])
  check('due APE: decide il primo nell\'ordine ricevuto', r.cells[0].doc.id, 'nuovo')
}

// --- ordine e quantità --------------------------------------------------------
{
  const rows = unitDocumentRows([], [U('u3'), U('u1'), U('u2')])
  check('una riga per unità, nell\'ordine ricevuto', rows.map(r => r.unit.id), ['u3', 'u1', 'u2'])
}

// --- documenti che citano un'unità ma non sono assegnati --------------------
{
  const citaAmbito = apeDoc('c1', null, { extraction: ext({ for_doc_type: 'ape', ambito: 'unita', unita_riferimento: 'interno 3' }) })
  const citaSoloTesto = doc({ id: 'c2', doc_type: 'planimetria_catastale', extraction: ext({ for_doc_type: 'planimetria_catastale', unita_riferimento: 'Unità 1' }) })
  const residenza = doc({ id: 'c3', doc_type: 'agibilita', extraction: ext({ for_doc_type: 'agibilita', ambito: 'residenza' }) })
  const giaAssegnato = apeDoc('c4', 'u1', { extraction: ext({ for_doc_type: 'ape', ambito: 'unita', unita_riferimento: 'interno 3' }) })
  const senzaEstrazione = doc({ id: 'c5', doc_type: 'ape' })
  const vuoto = doc({ id: 'c6', doc_type: 'ape', extraction: ext({ for_doc_type: 'ape', unita_riferimento: '  ' }) })
  check('citano un\'unità senza assegnazione: ambito unità o unità di riferimento',
    documentsMentioningUnitWithoutAssignment([citaAmbito, citaSoloTesto, residenza, giaAssegnato, senzaEstrazione, vuoto]).map(d => d.id),
    ['c1', 'c2'])
  const corretto = apeDoc('c7', null, {
    extraction: ext({ for_doc_type: 'ape', ambito: 'unita', unita_riferimento: 'interno 3' }),
    overrides: [
      { for_doc_type: 'ape', field_key: 'ambito', value: 'residenza', set_by: 'u', set_at: '2026-11-04T10:00:00+00:00' },
      { for_doc_type: 'ape', field_key: 'unita_riferimento', value: null, set_by: 'u', set_at: '2026-11-04T10:00:00+00:00' },
    ],
  })
  check('correzione manuale che toglie ambito e unità: non è più un avviso',
    documentsMentioningUnitWithoutAssignment([corretto]).map(d => d.id), [])
}

// --- dati chiave in forma breve per la cella ------------------------------------
{
  const d = (label, value, kind = 'text') => ({ label, value, kind })
  check('cella APE: classe e validità', formatCellKeyData('ape', [d('Classe energetica', 'B'), d('Valida fino al', '2034-02-20', 'date')]), 'Classe B · fino al 20 feb 2034')
  check('cella APE: solo la classe', formatCellKeyData('ape', [d('Classe energetica', 'B')]), 'Classe B')
  check('cella APE: solo la validità', formatCellKeyData('ape', [d('Valida fino al', '2034-02-20', 'date')]), 'fino al 20 feb 2034')
  check('cella planimetria: la data', formatCellKeyData('planimetria_catastale', [d('Data documento', '2026-03-12', 'date')]), 'del 12 mar 2026')
  check('cella DiCo: impresa e data', formatCellKeyData('dico_elettrico', [d('Impresa installatrice', 'Rossi Impianti'), d('Data documento', '2026-03-12', 'date')]), 'Rossi Impianti · 12 mar 2026')
  check('cella DiCo: senza impresa, solo la data', formatCellKeyData('dico_elettrico', [d('Data documento', '2026-03-12', 'date')]), '12 mar 2026')
  check('cella: nessun dato = null', [formatCellKeyData('ape', []), formatCellKeyData('planimetria_catastale', []), formatCellKeyData('dico_elettrico', [])], [null, null, null])
  check('categorie di caricamento delle tre voci', UNIT_EXPECTATIONS.map(e => e.category), ['energetici', 'proprieta', 'conformita'])
}

// --- più documenti sullo stesso slot: il più recente decide, gli altri sono versioni
{
  const ape = (id, creato, over = {}) => doc({ id, unit_id: 'u1', doc_type: 'ape', created_at: creato, ...over })
  const vecchio = ape('vecchio', '2026-01-10T10:00:00+00:00')
  const nuovo = ape('nuovo', '2026-05-10T10:00:00+00:00')
  const medio = ape('medio', '2026-03-10T10:00:00+00:00')
  // ordine ricevuto volutamente SBAGLIATO: il più recente è una garanzia della funzione
  const [r] = unitDocumentRows([vecchio, nuovo, medio], [U('u1')])
  check('slot con tre APE: la cella mostra il più recente', r.cells[0].doc.id, 'nuovo')
  check('slot con tre APE: le versioni sono le altre due, dal più recente', r.cells[0].versions.map(d => d.id), ['medio', 'vecchio'])
  check('slot con tre APE: nessuna cancellazione, i tre restano documenti della stessa unità', r.documentCount, 3)
  check('slot con un solo APE: nessuna versione', unitDocumentRows([nuovo], [U('u1')])[0].cells[0].versions, [])
  check('slot vuoto: nessuna versione', unitDocumentRows([], [U('u1')])[0].cells.map(c => c.versions.length), [0, 0, 0])
  check('le altre voci della stessa unità non hanno versioni', r.cells.slice(1).map(c => c.versions.length), [0, 0])

  const confermatoVecchio = ape('conf', '2026-01-10T10:00:00+00:00')
  const proposta = ape('prop', '2026-06-10T10:00:00+00:00', { classification_status: 'da_revisionare' })
  const [m] = unitDocumentRows([proposta, confermatoVecchio], [U('u1')])
  check('confermato vecchio + proposta nuova: decide il più recente, quindi da verificare', [m.cells[0].state, m.cells[0].doc.id], ['da_verificare', 'prop'])
  check('confermato vecchio + proposta nuova: il confermato è una versione', m.cells[0].versions.map(d => d.id), ['conf'])
  check('confermato vecchio + proposta nuova: nessun dato chiave finché non si conferma', m.cells[0].keyData, [])
  const confermatoNuovo = ape('conf2', '2026-07-10T10:00:00+00:00')
  const [n] = unitDocumentRows([proposta, confermatoVecchio, confermatoNuovo], [U('u1')])
  check('confermato più recente della proposta: presente, e la proposta è una versione',
    [n.cells[0].state, n.cells[0].doc.id, n.cells[0].versions.map(d => d.id)], ['presente', 'conf2', ['prop', 'conf']])
  const unaSola = ape('sola', '2026-01-10T10:00:00+00:00', { classification_status: 'da_revisionare' })
  check('una sola proposta: da verificare senza versioni', [unitDocumentRows([unaSola], [U('u1')])[0].cells[0].state, unitDocumentRows([unaSola], [U('u1')])[0].cells[0].versions.length], ['da_verificare', 0])

  const altraUnita = doc({ id: 'altra', unit_id: 'u2', doc_type: 'ape', created_at: '2026-07-01T10:00:00+00:00' })
  const tutti = [vecchio, nuovo, medio, altraUnita]
  check('otherVersions dal documento più recente', otherVersions(nuovo, tutti).map(d => d.id), ['medio', 'vecchio'])
  check('otherVersions da una versione vecchia include il più recente', otherVersions(vecchio, tutti).map(d => d.id), ['nuovo', 'medio'])
  check('otherVersions non include mai documenti di un’altra unità', otherVersions(nuovo, tutti).includes(altraUnita), false)
  check('otherVersions di un documento senza unità: vuoto', otherVersions(doc({ id: 'libero', unit_id: null, doc_type: 'ape' }), tutti), [])
  check('otherVersions di un tipo non atteso: vuoto', otherVersions(doc({ id: 'g', unit_id: 'u1', doc_type: 'garanzia' }), [...tutti]), [])
  const dicoTermica = doc({ id: 'dt', unit_id: 'u1', doc_type: 'dich_conformita_dm37', sistema: 'termico' })
  const dicoElettrica = doc({ id: 'de', unit_id: 'u1', doc_type: 'dich_conformita_dm37', sistema: 'elettrico' })
  check('DiCo di un altro impianto non è una versione della voce elettrica', otherVersions(dicoElettrica, [dicoTermica, dicoElettrica]), [])
}

// --- reviewState: unica definizione di "classificazione chiusa" -----------------
{
  const rows = await import(new URL('../src/lib/document-rows.ts', import.meta.url).href)
  const stato = s => rows.reviewState({ classification_status: s })
  check('etichetta unica dello stato ambra', rows.REVIEW_LABEL, 'Da verificare')
  check('reviewState: completata è chiusa', stato('completata'), 'chiusa')
  check('reviewState: da_revisionare è da rivedere', stato('da_revisionare'), 'da_rivedere')
  check('reviewState: gli altri tre stati sono in lavorazione',
    ['non_classificato', 'in_corso', 'fallita'].map(stato), ['in_lavorazione', 'in_lavorazione', 'in_lavorazione'])
  check('isReviewClosed: solo completata',
    ['completata', 'da_revisionare', 'non_classificato', 'in_corso', 'fallita'].map(s => rows.isReviewClosed({ classification_status: s })),
    [true, false, false, false, false])
  // Stessa regola per la cella del quadro: un documento fallito con unità è "da verificare".
  const [r] = unitDocumentRows([doc({ id: 'f', unit_id: 'u1', classification_status: 'fallita', doc_type: 'ape' })], [U('u1')])
  check('cella: fallita con tipo APE non è "presente"', r.cells[0].state, 'da_verificare')
}

// --- esito -------------------------------------------------------------------
if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
process.exit(0)
