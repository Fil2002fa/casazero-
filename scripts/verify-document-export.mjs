// ============================================================
// CasaZero — verifica della mappa righe dell'export Excel dei documenti.
// Uso:  node --experimental-strip-types scripts/verify-document-export.mjs
//       (oppure: npm run verify:export)
// ------------------------------------------------------------
// COSA GARANTISCE: che documentExportRow / documentExportRows
// (src/lib/document-export.ts) diano le 12 celle attese, con il tipo giusto
// (data o testo), su casi positivi E negativi: documento senza estrazione,
// non classificato, DiCo con installatore e P.IVA con zero iniziale,
// garanzia, polizza senza date (formula), APE di unità, estrazione non
// attuale, estrazione saltata, ordine delle righe. Verifica anche le
// funzioni di riga condivise con lo schermo (documentFacts,
// extractionFacts, validitySubject in src/lib/document-rows.ts).
//
// PERCHE' ESISTE: l'export e la pagina leggono gli stessi dati estratti; un
// campo letto dal tipo sbagliato, una P.IVA diventata numero o una data
// diventata testo passano il type-check e si vedono solo aprendo il file.
//
// PERCHE' NON E' UN TEST UNITARIO: il repo non ha un test runner; lo script
// segue il pattern di scripts/verify-extraction.mjs.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente (elencato atteso vs ottenuto); exit 2 = import fallito — mai
// confuso con un esito positivo.
// ============================================================

import { register } from 'node:module'
// Import relativi senza estensione nei moduli di lib: vedi
// scripts/ts-resolve-hooks.mjs.
register('./ts-resolve-hooks.mjs', import.meta.url)

const EXPORT = new URL('../src/lib/document-export.ts', import.meta.url)
const ROWS = new URL('../src/lib/document-rows.ts', import.meta.url)

let exp, rows
try {
  exp = await import(EXPORT.href)
  rows = await import(ROWS.href)
} catch (err) {
  console.error(
    `\n✗ Impossibile importare i moduli: ${err.message}\n` +
    '  Rilancia con:  node --experimental-strip-types scripts/verify-document-export.mjs\n' +
    '  (serve Node >= 22.6; da Node 23.6 il flag non è più necessario)'
  )
  process.exit(2)
}

const { DOCUMENT_EXPORT_HEADERS, documentExportRow, documentExportRows } = exp
const { documentFacts, extractionFacts, validitySubject } = rows

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
  created_at: '2026-09-10T23:30:00.123456+00:00', classification_status: 'confermato',
  doc_type: null, sistema: null, classification_confidence: null,
  extracted_metadata: null, extraction: null, ...over,
})
const ext = (over = {}) => ({
  for_doc_type: 'garanzia', status: 'completata', document_date: null, ambito: null,
  unita_riferimento: null, valid_until: null, fields: {}, ...over,
})
const T = value => ({ type: 'text', value })
const D = value => ({ type: 'date', value })
const _ = null

const nonClassificato = doc({ title: 'scansione_001', file_date: '2026-05-04' })
const soloCaricamento = doc({ title: 'foto cantiere' })
const dico = doc({
  title: 'DiCo_impianto_VMC', doc_type: 'dich_conformita_dm37', sistema: 'ventilazione', file_date: '2025-03-28',
  extracted_metadata: { ragione_sociale_installatore: 'Clima Nordest S.r.l.', partita_iva_installatore: '01234567890' },
})
const dicoSenzaImpresa = doc({
  title: 'dico_elettrico', doc_type: 'dich_conformita_dm37', file_date: '2025-01-15',
  extracted_metadata: { ragione_sociale_installatore: '', partita_iva_installatore: null },
})
const garanzia = doc({
  title: 'certificato_garanzia_caldaia', doc_type: 'garanzia', file_date: '2025-04-01',
  // Verbale di classificazione con un installatore: su un doc_type diverso
  // da DiCo non deve comparire (riclassificazione umana).
  extracted_metadata: { ragione_sociale_installatore: 'Impresa Vecchia', partita_iva_installatore: '99999999999' },
  extraction: ext({
    for_doc_type: 'garanzia', document_date: '2025-03-10', ambito: 'parti_comuni', valid_until: '2029-03-10',
    fields: { inizio: '2025-03-10', durata_anni: 4, oggetto: 'Caldaia a condensazione', rilasciata_da: 'Termo Srl' },
  }),
})
const polizza = doc({
  title: 'polizza_decennale_postuma', doc_type: 'polizza_decennale',
  extraction: ext({
    for_doc_type: 'polizza_decennale', document_date: '2026-02-01', ambito: 'residenza', valid_until: null,
    fields: {
      compagnia: 'Assicuratrice Esempio', numero_polizza: 'DEC-2026-0042', decorrenza: null, durata_anni: 10,
      evento_decorrenza: 'emissione del certificato di collaudo', scadenza: null,
    },
  }),
})
const ape = doc({
  title: 'APE_interno_3', doc_type: 'ape', unit_id: 'u3', file_date: '2024-02-01',
  extraction: ext({
    for_doc_type: 'ape', document_date: '2024-02-20', ambito: 'unita', unita_riferimento: 'interno 3',
    valid_until: '2034-02-20', fields: { classe_energetica: 'A2', valida_fino_al: '2034-02-20' },
  }),
})
const nonAttuale = doc({
  title: 'ape_riclassificato', doc_type: 'ape', file_date: '2023-06-30',
  extraction: ext({
    for_doc_type: 'garanzia', document_date: '2020-01-01', ambito: 'residenza', valid_until: '2030-01-01',
    fields: { oggetto: 'Non deve comparire' },
  }),
})
const saltata = doc({
  title: 'manuale_caldaia', doc_type: 'manuale', file_date: '2025-02-02',
  extraction: ext({ for_doc_type: 'manuale', status: 'saltata', fields: {} }),
})

// --- intestazioni ----------------------------------------------------------
check('intestazioni: 12 colonne nell\'ordine concordato', DOCUMENT_EXPORT_HEADERS, [
  'Titolo', 'Tipo', 'Ambito', 'Unità', 'Data documento', 'Scadenza o validità',
  'Installatore', 'Partita IVA', 'Compagnia', 'Numero polizza', 'Classe energetica', 'Oggetto coperto',
])

// --- una riga per caso -----------------------------------------------------
check('non classificato, senza estrazione: solo titolo e data',
  documentExportRow(nonClassificato, null),
  [T('Scansione 001'), _, _, _, D('2026-05-04'), _, _, _, _, _, _, _])
check('senza file_date: data dal created_at (primi 10 caratteri, come a schermo)',
  documentExportRow(soloCaricamento, null),
  [T('Foto cantiere'), _, _, _, D('2026-09-10'), _, _, _, _, _, _, _])
check('DiCo: installatore e P.IVA dal verbale, P.IVA come testo',
  documentExportRow(dico, null),
  [T('DiCo impianto VMC'), T('Dichiarazione di conformità DM 37/08'), _, _, D('2025-03-28'), _,
    T('Clima Nordest S.r.l.'), T('01234567890'), _, _, _, _])
check('DiCo con ragione sociale vuota: celle vuote',
  documentExportRow(dicoSenzaImpresa, null),
  [T('Dico elettrico'), T('Dichiarazione di conformità DM 37/08'), _, _, D('2025-01-15'), _, _, _, _, _, _, _])
check('garanzia: ambito, data estratta, scadenza come data, oggetto; installatore del verbale ignorato',
  documentExportRow(garanzia, null),
  [T('Certificato garanzia caldaia'), T('Garanzia'), T('Parti comuni'), _, D('2025-03-10'), D('2029-03-10'),
    _, _, _, _, _, T('Caldaia a condensazione')])
check('polizza senza date: formula di validità come testo, compagnia e numero',
  documentExportRow(polizza, null),
  [T('Polizza decennale postuma'), T('Polizza decennale postuma'), T('Residenza'), _, D('2026-02-01'),
    T('10 anni dalla data di emissione del certificato di collaudo'), _, _,
    T('Assicuratrice Esempio'), T('DEC-2026-0042'), _, _])
check('APE di unità: ambito con unità citata, unità assegnata, classe',
  documentExportRow(ape, 'Unità 3'),
  [T('APE interno 3'), T('Attestato di prestazione energetica'), T('Unità: interno 3'), T('Unità 3'),
    D('2024-02-20'), D('2034-02-20'), _, _, _, _, T('A2'), _])
check('estrazione non attuale (for_doc_type diverso da doc_type): ignorata, data dal file',
  documentExportRow(nonAttuale, null),
  [T('Ape riclassificato'), T('Attestato di prestazione energetica'), _, _, D('2023-06-30'), _, _, _, _, _, _, _])
check('estrazione saltata: celle estratte vuote',
  documentExportRow(saltata, null),
  [T('Manuale caldaia'), T('Manuale'), _, _, D('2025-02-02'), _, _, _, _, _, _, _])

const tutti = [nonClassificato, soloCaricamento, dico, dicoSenzaImpresa, garanzia, polizza, ape, nonAttuale, saltata]
check('ogni riga ha 12 celle', tutti.map(d => documentExportRow(d, null).length), tutti.map(() => 12))
check('nessuna cella testo vuota: vuoto è sempre null',
  tutti.flatMap(d => documentExportRow(d, null)).filter(c => c !== null && c.value === '').length, 0)

// --- ordine delle righe ----------------------------------------------------
{
  const u10 = doc({ title: 'doc_unita_10', unit_id: 'u10' })
  const res1 = doc({ title: 'doc_residenza_1' })
  const u2 = doc({ title: 'doc_unita_2', unit_id: 'u2' })
  const res2 = doc({ title: 'doc_residenza_2' })
  const orfano = doc({ title: 'doc_orfano', unit_id: 'sconosciuta' })
  // Ordine della query: label come TEXT, "Unità 10" prima di "Unità 2".
  const units = [{ id: 'u10', label: 'Unità 10' }, { id: 'u2', label: 'Unità 2' }]
  const out = documentExportRows([u10, res1, u2, res2, orfano], units)
  check('ordine: residenza (ordine ricevuto), unità in ordine naturale, orfani in coda',
    out.map(r => [r[0].value, r[3]?.value ?? null]),
    [['Doc residenza 1', null], ['Doc residenza 2', null], ['Doc unita 2', 'Unità 2'], ['Doc unita 10', 'Unità 10'], ['Doc orfano', null]])
  check('nessun documento perso', out.length, 5)
  check('residenza senza documenti: nessuna riga', documentExportRows([], units), [])
}

// --- funzioni di riga condivise con lo schermo -----------------------------
check('documentFacts: garanzia', documentFacts(garanzia), {
  installatore: null, partitaIva: null, ambito: 'Parti comuni', unitaRiferimento: null,
  oggetto: 'Caldaia a condensazione', rilasciataDa: 'Termo Srl', classeEnergetica: null,
  compagnia: null, numeroPolizza: null, validUntil: '2029-03-10', validityFormula: null,
})
check('extractionFacts: DiCo senza estrazione', extractionFacts(dico), ['Installatore: Clima Nordest S.r.l.'])
check('extractionFacts: garanzia', extractionFacts(garanzia),
  ['Parti comuni', 'Caldaia a condensazione', 'Rilasciata da Termo Srl', 'Valida fino al 10 mar 2029'])
check('extractionFacts: polizza', extractionFacts(polizza),
  ['Residenza', 'Assicuratrice Esempio', 'Polizza n. DEC-2026-0042', 'Validità: 10 anni dalla data di emissione del certificato di collaudo'])
check('extractionFacts: APE', extractionFacts(ape), ['Unità: interno 3', 'Classe A2', 'Valida fino al 20 feb 2034'])
check('extractionFacts: non attuale', extractionFacts(nonAttuale), [])
check('extractionFacts: ambito assente, unità citata', extractionFacts(doc({
  doc_type: 'ape', extraction: ext({ for_doc_type: 'ape', unita_riferimento: 'interno 5' }),
})), ['Unità: interno 5'])
check('validitySubject: garanzia → oggetto', validitySubject(garanzia), 'Caldaia a condensazione')
check('validitySubject: polizza → compagnia', validitySubject(polizza), 'Assicuratrice Esempio')
check('validitySubject: APE → unità citata', validitySubject(ape), 'Unità: interno 3')
check('validitySubject: non attuale → tipo', validitySubject(nonAttuale), 'Attestato di prestazione energetica')
check('validitySubject: non classificato → null', validitySubject(nonClassificato), null)

// --- esito -----------------------------------------------------------------
if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
process.exit(0)
