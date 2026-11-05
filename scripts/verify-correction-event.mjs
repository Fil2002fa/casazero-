// ============================================================
// CasaZero — verifica dell'evento documento_corretto (R10, migrazione 049).
// Uso:  node --experimental-strip-types scripts/verify-correction-event.mjs
//       (oppure: npm run verify:evento)
// ------------------------------------------------------------
// COSA GARANTISCE: che le funzioni pure di src/lib/document-overrides.ts che
// alimentano il registro attività facciano quello che il contratto della 049
// dichiara:
//   - documentCorrectionPayload: chiavi e valori del payload (piatto, solo
//     dati), `value` presente solo per "impostato", had_previous/previous
//     coerenti con la lettura della correzione precedente (anche fallita);
//   - isNoopCorrection: salvare lo stesso valore già corretto non è un atto;
//   - documentCorrectionText: la frase a schermo, costruita a lettura, con
//     ripiego su payload incompleti (la tabella è immutabile);
//   - overrideFieldLabel: etichette note e nessuna perdita su chiavi ignote.
//
// NON COPRE: activity-event-view.ts (importa '@/' e lucide, non caricabile
// con strip-types: ne risponde tsc) né la scrittura nel DB (prova dal vivo).
//
// exit 0 = tutti i casi ok; exit 1 = almeno un caso divergente; exit 2 =
// import fallito.
// ============================================================

import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

const OVERRIDES = new URL('../src/lib/document-overrides.ts', import.meta.url)

let ov
try {
  ov = await import(OVERRIDES.href)
} catch (err) {
  console.error(
    `\n✗ Impossibile importare il modulo: ${err.message}\n` +
    '  Rilancia con:  node --experimental-strip-types scripts/verify-correction-event.mjs\n' +
    '  (serve Node >= 22.6; da Node 23.6 il flag non è più necessario)'
  )
  process.exit(2)
}

const {
  documentCorrectionPayload, documentCorrectionText, isNoopCorrection,
  overrideFieldLabel, DOCUMENT_CORRECTED_NEUTRAL_LABEL,
} = ov

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

const base = {
  documentId: 'doc-1', title: 'Dichiarazione di conformità elettrico', docType: 'dico',
  fieldKey: 'partita_iva_installatore', action: 'impostato', value: '12345678903',
  previous: { known: true, exists: false }, source: 'correggi_dati',
}

// --- payload ----------------------------------------------------------------
check('payload impostato, nessuna correzione precedente',
  documentCorrectionPayload(base),
  { document_id: 'doc-1', title: 'Dichiarazione di conformità elettrico', doc_type: 'dico',
    field_key: 'partita_iva_installatore', action: 'impostato', had_previous: false,
    previous: null, source: 'correggi_dati', value: '12345678903' })

check('payload impostato su correzione precedente',
  documentCorrectionPayload({ ...base, previous: { known: true, exists: true, value: '99999999999' } }),
  { document_id: 'doc-1', title: 'Dichiarazione di conformità elettrico', doc_type: 'dico',
    field_key: 'partita_iva_installatore', action: 'impostato', had_previous: true,
    previous: '99999999999', source: 'correggi_dati', value: '12345678903' })

check('payload: precedente "il documento non lo riporta" (null) ≠ nessun precedente',
  documentCorrectionPayload({ ...base, previous: { known: true, exists: true, value: null } }).had_previous, true)
check('payload: precedente null con had_previous true',
  documentCorrectionPayload({ ...base, previous: { known: true, exists: true, value: null } }).previous, null)

check('payload: value null ("il documento non lo riporta") resta presente',
  'value' in documentCorrectionPayload({ ...base, value: null }), true)
check('payload: value null ha valore null',
  documentCorrectionPayload({ ...base, value: null }).value, null)

check('payload: lettura precedente fallita → had_previous null, previous null',
  (() => { const p = documentCorrectionPayload({ ...base, previous: { known: false } }); return [p.had_previous, p.previous] })(),
  [null, null])

check('payload ripristinato: nessuna chiave value, previous = valore tolto',
  documentCorrectionPayload({ ...base, action: 'ripristinato', value: null,
    previous: { known: true, exists: true, value: '12345678903' } }),
  { document_id: 'doc-1', title: 'Dichiarazione di conformità elettrico', doc_type: 'dico',
    field_key: 'partita_iva_installatore', action: 'ripristinato', had_previous: true,
    previous: '12345678903', source: 'correggi_dati' })

check('payload: proposta fornitore',
  documentCorrectionPayload({ ...base, source: 'proposta_fornitore' }).source, 'proposta_fornitore')
check('payload: titolo assente resta null',
  documentCorrectionPayload({ ...base, title: null }).title, null)

// Solo dati: nessun valore del payload è un oggetto o un array.
check('payload: solo valori piatti',
  Object.values(documentCorrectionPayload(base)).every(v => v === null || ['string', 'number', 'boolean'].includes(typeof v)), true)

// --- isNoopCorrection ---------------------------------------------------------
check('noop: stesso valore già corretto', isNoopCorrection({ known: true, exists: true, value: 'A' }, 'A'), true)
check('noop: valore diverso', isNoopCorrection({ known: true, exists: true, value: 'A' }, 'B'), false)
check('noop: null su null (già "non riportato")', isNoopCorrection({ known: true, exists: true, value: null }, null), true)
check('noop: nessuna correzione precedente, anche se uguale al valore AI', isNoopCorrection({ known: true, exists: false }, 'A'), false)
check('noop: lettura precedente fallita → si registra', isNoopCorrection({ known: false }, 'A'), false)

// --- frase ---------------------------------------------------------------------
check('frase impostato: titolo e campo',
  documentCorrectionText({ action: 'impostato', title: 'Dichiarazione di conformità elettrico', field_key: 'partita_iva_installatore' }),
  'Dato corretto a mano: «Dichiarazione di conformità elettrico», Partita IVA dell’impresa')
check('frase ripristinato: titolo e campo',
  documentCorrectionText({ action: 'ripristinato', title: 'Garanzia caldaia', field_key: 'durata_anni' }),
  'Valore AI ripristinato: «Garanzia caldaia», Durata (anni)')
check('frase: senza titolo',
  documentCorrectionText({ action: 'impostato', title: null, field_key: 'document_date' }),
  'Dato corretto a mano: Data del documento')
check('frase: senza campo noto',
  documentCorrectionText({ action: 'impostato', title: 'Garanzia caldaia', field_key: 'campo_inesistente' }),
  'Dato corretto a mano: «Garanzia caldaia»')
check('frase: payload vuoto → etichetta neutra',
  documentCorrectionText({}), DOCUMENT_CORRECTED_NEUTRAL_LABEL)
check('frase: ripristinato senza dettagli',
  documentCorrectionText({ action: 'ripristinato' }), 'Valore AI ripristinato')
check('frase: titolo vuoto trattato come assente',
  documentCorrectionText({ action: 'impostato', title: '', field_key: 'ambito' }), 'Dato corretto a mano: Ambito')
check('frase: tipi sbagliati nel payload non rompono',
  documentCorrectionText({ action: 5, title: { x: 1 }, field_key: ['a'] }), DOCUMENT_CORRECTED_NEUTRAL_LABEL)
check('frase: i valori non compaiono mai nella frase',
  documentCorrectionText({ action: 'impostato', title: 'T', field_key: 'partita_iva_installatore', value: '12345678903', previous: '99999999999' }).includes('1234'), false)

// --- etichette -----------------------------------------------------------------
check('etichetta nota', overrideFieldLabel('ragione_sociale_installatore'), 'Impresa installatrice')
check('etichetta ignota → null', overrideFieldLabel('campo_inesistente'), null)
check('etichetta: chiave del prototipo → null', overrideFieldLabel('constructor'), null)

// --- esito -------------------------------------------------------------------
if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
