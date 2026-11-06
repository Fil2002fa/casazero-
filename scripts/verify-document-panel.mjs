// ============================================================
// CasaZero — verifica della logica del pannello documento (E1b).
// Uso:  node --experimental-strip-types scripts/verify-document-panel.mjs
//       (oppure: npm run verify:panel)
// ------------------------------------------------------------
// COSA GARANTISCE: che il pannello (src/lib/document-panel.ts) non mostri più
// Ambito e Unità di riferimento tra i campi, che mostri il testo letto a parte,
// che il Salva scriva solo ciò che è cambiato (e tolga la correzione quando un
// campo torna al valore dell'AI), che un tipo cambiato non applichi bozze di
// campi del tipo vecchio, e che un documento non chiuso venga confermato anche
// senza toccare il tipo.
//
// PERCHE' ESISTE: un solo Salva che chiama tre action (classificazione, unità,
// campi) è dove nascono le scritture dimenticate o doppie. Il piano di
// salvataggio è puro proprio per poterlo provare senza browser.
//
// Exit: 0 = ok; 1 = caso divergente; 2 = import fallito.
// ============================================================
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let mod
try {
  mod = await import(new URL('../src/lib/document-panel.ts', import.meta.url).href)
} catch (err) {
  console.error(`\n✗ Impossibile importare il modulo: ${err.message}`)
  process.exit(2)
}
const { panelFields, readInDocumentText, differsFromAi, planFieldChanges, manualFieldKeys, planPanelSave, savePlanIsEmpty } = mod

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

const doc = (over = {}) => ({
  id: 'd', title: 't', category: 'energetici', file_name: 'ape.pdf', storage_path: 'r/ape.pdf', file_date: null,
  unit_id: null, created_at: '2026-11-01T00:00:00+00:00', classification_status: 'completata',
  doc_type: 'ape', sistema: null, classification_confidence: 0.9, extracted_metadata: null,
  extraction: {
    for_doc_type: 'ape', status: 'completata', document_date: '2026-03-01', ambito: 'unita',
    unita_riferimento: 'Interno A2', valid_until: '2036-03-01', fields: { classe_energetica: 'B' },
  },
  overrides: [],
  proposed_unit_id: null, unit_proposal_confidence: null, unit_proposal_dismissed_at: null, ...over,
})
const ov = (key, value) => ({ for_doc_type: 'ape', field_key: key, value, set_by: 'u', set_at: '2026-11-04T10:00:00+00:00' })
const chiavi = d => panelFields(d).map(f => f.key)

// --- campi del pannello ----------------------------------------------------------
check('APE: niente ambito né unità di riferimento', chiavi(doc()).filter(k => k === 'ambito' || k === 'unita_riferimento'), [])
check('APE: restano la data e la classe energetica', chiavi(doc()).includes('document_date') && chiavi(doc()).includes('classe_energetica'), true)
check('senza estrazione corrente: nessun campo', chiavi(doc({ extraction: null })), [])
check('tipo "altro": nessun campo', chiavi(doc({ doc_type: 'altro', extraction: { ...doc().extraction, for_doc_type: 'altro' } })), [])
check('testo letto: l\'unità di riferimento effettiva', readInDocumentText(doc()), 'Interno A2')
check('testo letto: una vecchia correzione vince',
  readInDocumentText(doc({ overrides: [ov('unita_riferimento', 'Interno B1')] })), 'Interno B1')
check('testo letto: assente', readInDocumentText(doc({ extraction: null })), null)

// --- valore AI ambra ---------------------------------------------------------------
{
  const campo = panelFields(doc()).find(f => f.key === 'classe_energetica')
  check('valore AI: uguale = non ambra', differsFromAi(campo, 'B'), false)
  check('valore AI: diverso = ambra', differsFromAi(campo, 'C'), true)
  check('valore AI: spazi ignorati', differsFromAi(campo, ' B '), false)
  check('valore AI: svuotato = ambra', differsFromAi(campo, ''), true)
}

// --- piano dei campi ----------------------------------------------------------------
{
  const campi = panelFields(doc())
  check('nessuna bozza: nessuna modifica', planFieldChanges(campi, {}), [])
  check('bozza uguale al valore attuale: nessuna modifica', planFieldChanges(campi, { classe_energetica: 'B' }), [])
  check('classe cambiata: un salvataggio', planFieldChanges(campi, { classe_energetica: 'C' }), [{ key: 'classe_energetica', action: 'save', value: 'C' }])
  check('classe svuotata: salvataggio vuoto ("non lo riporta")', planFieldChanges(campi, { classe_energetica: '' }), [{ key: 'classe_energetica', action: 'save', value: '' }])
}
{
  const d = doc({ overrides: [ov('classe_energetica', 'C')] })
  const campi = panelFields(d)
  check('correzione manuale presente: provenienza manuale', campi.find(f => f.key === 'classe_energetica').provenance.source, 'manuale')
  check('torna al valore AI: toglie la correzione', planFieldChanges(campi, { classe_energetica: 'B' }), [{ key: 'classe_energetica', action: 'clear', value: '' }])
  check('altro valore: salva ancora', planFieldChanges(campi, { classe_energetica: 'D' }), [{ key: 'classe_energetica', action: 'save', value: 'D' }])
  check('ripristina valori AI: le chiavi corrette a mano', manualFieldKeys(campi), ['classe_energetica'])
}
check('ripristina valori AI: nessuna correzione, nessuna chiave', manualFieldKeys(panelFields(doc())), [])

// --- piano del Salva ----------------------------------------------------------------
const bozza = (d, over = {}) => ({ docType: d.doc_type, sistema: d.sistema, unitId: d.unit_id, fields: {}, ...over })
{
  const d = doc()
  check('niente di cambiato su un documento chiuso: piano vuoto', savePlanIsEmpty(planPanelSave(d, bozza(d))), true)
  check('unità scelta: solo l\'unità', planPanelSave(d, bozza(d, { unitId: 'u1' })), { classification: false, unit: true, fields: [] })
  check('campo cambiato: solo il campo',
    planPanelSave(d, bozza(d, { fields: { classe_energetica: 'A' } })),
    { classification: false, unit: false, fields: [{ key: 'classe_energetica', action: 'save', value: 'A' }] })
  check('unità tolta dal documento assegnato', planPanelSave(doc({ unit_id: 'u1' }), bozza(doc({ unit_id: 'u1' }), { unitId: null })).unit, true)
}
{
  const d = doc()
  const piano = planPanelSave(d, bozza(d, { docType: 'garanzia', fields: { classe_energetica: 'A' } }))
  check('tipo cambiato: classificazione sì, bozze dei campi vecchi ignorate', [piano.classification, piano.fields], [true, []])
  check('impianto cambiato: classificazione', planPanelSave(d, bozza(d, { sistema: 'elettrico' })).classification, true)
}
{
  const d = doc({ classification_status: 'da_revisionare' })
  check('documento da rivedere, niente toccato: il Salva conferma comunque il tipo',
    planPanelSave(d, bozza(d)), { classification: true, unit: false, fields: [] })
  check('documento da rivedere: il piano non è vuoto', savePlanIsEmpty(planPanelSave(d, bozza(d))), false)
}
{
  const d = doc({ classification_status: 'fallita', doc_type: null, extraction: null })
  check('documento fallito: il Salva conferma il tipo scelto', planPanelSave(d, bozza(d, { docType: 'ape' })).classification, true)
}

if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
process.exit(0)
