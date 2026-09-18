// ============================================================
// CasaZero — verifica delle regole pure dell'estrazione dati documenti.
// Uso:  node --experimental-strip-types scripts/verify-extraction.mjs
//       (oppure: npm run verify:extraction)
// ------------------------------------------------------------
// COSA GARANTISCE: che computeValidUntil, validityFormula, extractionIsCurrent,
// needsExtraction, upcomingDeadlines, normalizeIsoDate, addYearsIso
// (src/lib/document-extraction.ts) e formatDateIT (src/lib/formatDate.ts)
// diano l'esito atteso su casi positivi E negativi.
//
// PERCHE' ESISTE: valid_until è CALCOLATA in TS e scritta come colonna (040):
// una regola sbagliata qui produce una scadenza sbagliata in tabella e nel
// blocco Scadenze, senza alcun errore di compilazione. needsExtraction decide
// quali documenti rientrano nel batch "Estrai dati": un falso negativo lascia
// un documento senza dati, un falso positivo rilancia chiamate AI a pagamento.
// formatDateIT è l'unico formatter dei blocchi nuovi e deve restare
// deterministico tra server e client (hydration).
//
// PERCHE' NON E' UN TEST UNITARIO: questo repo non ha un test runner
// (nessun vitest/jest in package.json, nessuno script `test`); lo script
// segue il pattern di scripts/verify-supplier-match.mjs.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente (elencato atteso vs ottenuto); exit 2 = import fallito — mai
// confuso con un esito positivo.
// ============================================================

import { register } from 'node:module'
// document-extraction.ts importa './pluralize' senza estensione: vedi
// scripts/ts-resolve-hooks.mjs per il perché serve un hook.
register('./ts-resolve-hooks.mjs', import.meta.url)

const SOURCE = new URL('../src/lib/document-extraction.ts', import.meta.url)
const FORMAT = new URL('../src/lib/formatDate.ts', import.meta.url)
const TITLE = new URL('../src/lib/documentTitle.ts', import.meta.url)

let lib, fmt, ttl
try {
  lib = await import(SOURCE.href)
  fmt = await import(FORMAT.href)
  ttl = await import(TITLE.href)
} catch (err) {
  console.error(
    `\n✗ Impossibile importare i moduli: ${err.message}\n` +
    '  Rilancia con:  node --experimental-strip-types scripts/verify-extraction.mjs\n' +
    '  (serve Node >= 22.6; da Node 23.6 il flag non è più necessario)'
  )
  process.exit(2)
}

const {
  computeValidUntil, validityFormula, extractionIsCurrent, needsExtraction, upcomingDeadlines, validityEntries,
  normalizeIsoDate, addYearsIso, isExtractableDocType, isTypedDocType, emptyFields,
} = lib
const { formatDateIT } = fmt
const { humanizeDocumentTitle } = ttl

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

// --- normalizeIsoDate ------------------------------------------------------
check('iso valida', normalizeIsoDate('2026-09-12'), '2026-09-12')
check('iso con spazi', normalizeIsoDate(' 2026-09-12 '), '2026-09-12')
check('iso con ora → null (solo DATE)', normalizeIsoDate('2026-09-12T10:00:00Z'), null)
check('30 febbraio → null', normalizeIsoDate('2026-02-30'), null)
check('29 feb bisestile ok', normalizeIsoDate('2024-02-29'), '2024-02-29')
check('29 feb non bisestile → null', normalizeIsoDate('2025-02-29'), null)
check('formato italiano → null', normalizeIsoDate('12/09/2026'), null)
check('null → null', normalizeIsoDate(null), null)
check('numero → null', normalizeIsoDate(20260912), null)

// --- addYearsIso -----------------------------------------------------------
check('+5 anni', addYearsIso('2024-03-15', 5), '2029-03-15')
check('+0 anni', addYearsIso('2024-03-15', 0), '2024-03-15')
check('29 feb + 1 → 1 marzo (nativo Date)', addYearsIso('2024-02-29', 1), '2025-03-01')
check('29 feb + 4 → 29 feb', addYearsIso('2024-02-29', 4), '2028-02-29')
check('anni non interi → null', addYearsIso('2024-03-15', 2.5), null)
check('data invalida → null', addYearsIso('2024-13-01', 1), null)

// --- computeValidUntil -----------------------------------------------------
check('garanzia: inizio + durata', computeValidUntil('garanzia', { inizio: '2025-06-01', durata_anni: 10 }), '2035-06-01')
check('garanzia: durata null → null', computeValidUntil('garanzia', { inizio: '2025-06-01', durata_anni: null }), null)
check('garanzia: inizio null → null', computeValidUntil('garanzia', { inizio: null, durata_anni: 5 }), null)
check('garanzia: durata 0 → null', computeValidUntil('garanzia', { inizio: '2025-06-01', durata_anni: 0 }), null)
check('garanzia: durata negativa → null', computeValidUntil('garanzia', { inizio: '2025-06-01', durata_anni: -2 }), null)
check('garanzia: durata stringa → null', computeValidUntil('garanzia', { inizio: '2025-06-01', durata_anni: '5' }), null)
check('ape: valida_fino_al', computeValidUntil('ape', { classe_energetica: 'A2', valida_fino_al: '2034-01-20' }), '2034-01-20')
check('ape: valida_fino_al invalida → null', computeValidUntil('ape', { classe_energetica: 'A2', valida_fino_al: '20/01/2034' }), null)
check('polizza: scadenza esplicita vince', computeValidUntil('polizza_decennale', { decorrenza: '2024-05-01', durata_anni: 10, scadenza: '2034-06-30' }), '2034-06-30')
check('polizza: decorrenza + durata', computeValidUntil('polizza_decennale', { decorrenza: '2024-05-01', durata_anni: 10, scadenza: null }), '2034-05-01')
check('polizza: solo durata ed evento → null (nessuna data)', computeValidUntil('polizza_decennale', { decorrenza: null, durata_anni: 10, evento_decorrenza: 'fine lavori', scadenza: null }), null)
check('polizza: decorrenza senza durata → null', computeValidUntil('polizza_decennale', { decorrenza: '2024-05-01', durata_anni: null, scadenza: null }), null)
check('polizza: durata non intera → null', computeValidUntil('polizza_decennale', { decorrenza: '2024-05-01', durata_anni: 10.5, scadenza: null }), null)

// --- validityFormula -------------------------------------------------------
check('formula polizza: durata + evento', validityFormula('polizza_decennale', { durata_anni: 10, evento_decorrenza: 'fine lavori', decorrenza: null, scadenza: null }), '10 anni dalla data di fine lavori')
check('formula polizza: evento con spazi', validityFormula('polizza_decennale', { durata_anni: 10, evento_decorrenza: '  collaudo statico ', decorrenza: null, scadenza: null }), '10 anni dalla data di collaudo statico')
check('formula polizza: solo durata', validityFormula('polizza_decennale', { durata_anni: 10, evento_decorrenza: null, decorrenza: null, scadenza: null }), '10 anni')
check('formula polizza: 1 anno singolare', validityFormula('polizza_decennale', { durata_anni: 1, evento_decorrenza: 'collaudo', decorrenza: null, scadenza: null }), '1 anno dalla data di collaudo')
check('formula polizza: null se valid_until calcolabile', validityFormula('polizza_decennale', { durata_anni: 10, evento_decorrenza: 'fine lavori', decorrenza: '2024-05-01', scadenza: null }), null)
check('formula polizza: null senza durata', validityFormula('polizza_decennale', { durata_anni: null, evento_decorrenza: 'fine lavori', decorrenza: null, scadenza: null }), null)
check('formula garanzia: durata senza inizio', validityFormula('garanzia', { inizio: null, durata_anni: 5 }), '5 anni')
check('formula garanzia: null se inizio presente', validityFormula('garanzia', { inizio: '2024-03-10', durata_anni: 5 }), null)
check('formula ape → null', validityFormula('ape', { classe_energetica: 'A2', valida_fino_al: null }), null)
check('formula manuale → null', validityFormula('manuale', {}), null)
check('dich_conformita → null', computeValidUntil('dich_conformita_dm37', {}), null)
check('manuale → null', computeValidUntil('manuale', {}), null)
check('altro → null', computeValidUntil('altro', {}), null)
check('doc_type null → null', computeValidUntil(null, {}), null)
check('fields null → null', computeValidUntil('garanzia', null), null)

// --- tipi estraibili -------------------------------------------------------
check('altro non estraibile', isExtractableDocType('altro'), false)
check('null non estraibile', isExtractableDocType(null), false)
check('manuale estraibile (solo comuni)', isExtractableDocType('manuale'), true)
check('garanzia tipizzata', isTypedDocType('garanzia'), true)
check('manuale non tipizzata', isTypedDocType('manuale'), false)
check('emptyFields garanzia', emptyFields('garanzia'), { inizio: null, durata_anni: null, oggetto: null, rilasciata_da: null })
check('emptyFields ape', emptyFields('ape'), { classe_energetica: null, valida_fino_al: null })
check('emptyFields polizza', emptyFields('polizza_decennale'), { compagnia: null, numero_polizza: null, decorrenza: null, durata_anni: null, evento_decorrenza: null, scadenza: null })

// --- extractionIsCurrent / needsExtraction ---------------------------------
const completata = (doc_type) => ({ doc_type, classification_status: 'completata' })
check('nessuna riga → non corrente', extractionIsCurrent(completata('garanzia'), null), false)
check('stesso doc_type → corrente', extractionIsCurrent(completata('garanzia'), { for_doc_type: 'garanzia' }), true)
check('riclassificato → non corrente', extractionIsCurrent(completata('manuale'), { for_doc_type: 'garanzia' }), false)
check('doc_type null → non corrente', extractionIsCurrent({ doc_type: null, classification_status: 'completata' }, { for_doc_type: 'garanzia' }), false)

check('da estrarre: completata, garanzia, nessuna riga', needsExtraction(completata('garanzia'), null), true)
check('da estrarre: riclassificato', needsExtraction(completata('manuale'), { for_doc_type: 'garanzia' }), true)
check('non da estrarre: già corrente', needsExtraction(completata('garanzia'), { for_doc_type: 'garanzia' }), false)
check('non da estrarre: altro', needsExtraction(completata('altro'), null), false)
check('non da estrarre: da_revisionare', needsExtraction({ doc_type: 'garanzia', classification_status: 'da_revisionare' }, null), false)
check('non da estrarre: non_classificato', needsExtraction({ doc_type: null, classification_status: 'non_classificato' }, null), false)
check('non da estrarre: fallita corrente (non si rilancia da sola)', needsExtraction(completata('garanzia'), { for_doc_type: 'garanzia' }), false)

// --- upcomingDeadlines -----------------------------------------------------
const today = '2026-09-18'
const docs = [
  { id: 'a', v: '2027-01-01' },
  { id: 'b', v: null },
  { id: 'c', v: '2025-12-31' },   // scaduta
  { id: 'd', v: '2026-09-18' },   // oggi: non scaduta
  { id: 'e', v: '2026-09-17' },   // ieri: scaduta
  { id: 'f', v: '2030-01-01' },
  { id: 'g', v: '2028-01-01' },
  { id: 'h', v: '2029-01-01' },
  { id: 'i', v: 'non-una-data' },
]
const dl = upcomingDeadlines(docs, d => d.v, today)
check('scadenze: max 6, ordine crescente, scadute in cima', dl.map(x => x.item.id), ['c', 'e', 'd', 'a', 'g', 'h'])
check('scadenze: flag expired', dl.map(x => x.expired), [true, true, false, false, false, false])
check('scadenze: null e invalide escluse', dl.some(x => x.item.id === 'b' || x.item.id === 'i'), false)
check('scadenze: limit personalizzato', upcomingDeadlines(docs, d => d.v, today, 2).map(x => x.item.id), ['c', 'e'])
check('scadenze: lista vuota', upcomingDeadlines([], d => d.v, today), [])
check('scadenze: parità di data conserva ordine di input',
  upcomingDeadlines([{ id: 'x', v: '2027-01-01' }, { id: 'y', v: '2027-01-01' }], d => d.v, today).map(x => x.item.id), ['x', 'y'])

// --- validityEntries -------------------------------------------------------
const src = (docType, validUntil, fields = {}) => ({ docType, validUntil, fields })
const ventries = [
  { id: 'polizza-formula', s: src('polizza_decennale', null, { durata_anni: 10, evento_decorrenza: 'fine lavori', decorrenza: null, scadenza: null }) },
  { id: 'garanzia-2029', s: src('garanzia', '2029-03-10', { inizio: '2024-03-10', durata_anni: 5 }) },
  { id: 'ape-scaduto', s: src('ape', '2025-01-01', {}) },
  { id: 'dico-niente', s: src('dich_conformita_dm37', null, {}) },
  { id: 'escluso', s: null },
  { id: 'garanzia-solo-durata', s: src('garanzia', null, { inizio: null, durata_anni: 2 }) },
  { id: 'ape-2027', s: src('ape', '2027-06-30', {}) },
]
const ve = validityEntries(ventries, x => x.s, today)
check('validità: date prima (scadute in cima), poi formule, esclusi null e senza nulla',
  ve.map(e => e.item.id), ['ape-scaduto', 'ape-2027', 'garanzia-2029', 'polizza-formula', 'garanzia-solo-durata'])
check('validità: kind per voce', ve.map(e => e.kind), ['date', 'date', 'date', 'formula', 'formula'])
check('validità: expired sulla data passata', ve[0].kind === 'date' && ve[0].expired, true)
check('validità: formula polizza', ve[3].kind === 'formula' ? ve[3].formula : null, '10 anni dalla data di fine lavori')
check('validità: formula garanzia senza inizio', ve[4].kind === 'formula' ? ve[4].formula : null, '2 anni')
check('validità: limit tronca anche le formule', validityEntries(ventries, x => x.s, today, 4).map(e => e.item.id), ['ape-scaduto', 'ape-2027', 'garanzia-2029', 'polizza-formula'])
check('validità: lista vuota', validityEntries([], x => x.s, today), [])

// --- formatDateIT ----------------------------------------------------------
check('formato DATE', formatDateIT('2026-09-12'), '12 set 2026')
check('formato TIMESTAMPTZ (primi 10 char)', formatDateIT('2026-01-05T23:30:00+00:00'), '5 gen 2026')
check('primo del mese senza zero', formatDateIT('2026-03-01'), '1 mar 2026')
check('dicembre', formatDateIT('2025-12-31'), '31 dic 2025')
check('null → vuoto', formatDateIT(null), '')
check('undefined → vuoto', formatDateIT(undefined), '')
check('stringa vuota → vuoto', formatDateIT(''), '')
check('mese 13 → vuoto', formatDateIT('2026-13-01'), '')
check('formato italiano → vuoto', formatDateIT('12/09/2026'), '')

// --- humanizeDocumentTitle -------------------------------------------------
check('titolo: underscore → spazi, prima maiuscola', humanizeDocumentTitle('certificato_garanzia_caldaia'), 'Certificato garanzia caldaia')
check('titolo: sigle e maiuscole interne intatte', humanizeDocumentTitle('DiCo_impianto_VMC_ClimaNordest'), 'DiCo impianto VMC ClimaNordest')
check('titolo: già con spazi', humanizeDocumentTitle('domanda b0 - b4'), 'Domanda b0 - b4')
check('titolo: underscore multipli e spazi doppi collassati', humanizeDocumentTitle('a__b  c'), 'A b c')
check('titolo: già maiuscolo invariato', humanizeDocumentTitle('Garanzia_copertura_CopertureFriulane'), 'Garanzia copertura CopertureFriulane')
check('titolo: null → vuoto', humanizeDocumentTitle(null), '')
check('titolo: solo underscore → vuoto', humanizeDocumentTitle('___'), '')

// --- esito -----------------------------------------------------------------
if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
process.exit(0)
