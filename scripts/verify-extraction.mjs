// ============================================================
// CasaZero — verifica delle regole pure dell'estrazione dati documenti.
// Uso:  node --experimental-strip-types scripts/verify-extraction.mjs
//       (oppure: npm run verify:extraction)
// ------------------------------------------------------------
// COSA GARANTISCE: che computeValidUntil, extractionIsCurrent,
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

const SOURCE = new URL('../src/lib/document-extraction.ts', import.meta.url)
const FORMAT = new URL('../src/lib/formatDate.ts', import.meta.url)

let lib, fmt
try {
  lib = await import(SOURCE.href)
  fmt = await import(FORMAT.href)
} catch (err) {
  console.error(
    `\n✗ Impossibile importare i moduli: ${err.message}\n` +
    '  Rilancia con:  node --experimental-strip-types scripts/verify-extraction.mjs\n' +
    '  (serve Node >= 22.6; da Node 23.6 il flag non è più necessario)'
  )
  process.exit(2)
}

const {
  computeValidUntil, extractionIsCurrent, needsExtraction, upcomingDeadlines,
  normalizeIsoDate, addYearsIso, isExtractableDocType, isTypedDocType, emptyFields,
} = lib
const { formatDateIT } = fmt

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
check('polizza: scadenza', computeValidUntil('polizza_decennale', { decorrenza: '2024-05-01', scadenza: '2034-05-01' }), '2034-05-01')
check('polizza: scadenza null → null (non si deduce da decorrenza)', computeValidUntil('polizza_decennale', { decorrenza: '2024-05-01', scadenza: null }), null)
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
check('emptyFields polizza', emptyFields('polizza_decennale'), { compagnia: null, numero_polizza: null, decorrenza: null, scadenza: null })

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

// --- esito -----------------------------------------------------------------
if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
process.exit(0)
