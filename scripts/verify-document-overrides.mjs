// ============================================================
// CasaZero — verifica dell'unione "correzione manuale > AI" sui campi
// estratti dei documenti (R10, migrazione 048).
// Uso:  node --experimental-strip-types scripts/verify-document-overrides.mjs
//       (oppure: npm run verify:overrides)
// ------------------------------------------------------------
// COSA GARANTISCE: che src/lib/document-overrides.ts e le funzioni di riga
// di src/lib/document-rows.ts (currentExtraction, documentFacts,
// extractionFacts) applichino le correzioni con le regole del piano R10:
//   - nessuna correzione = output identico a oggi (stesso oggetto);
//   - manuale > AI;
//   - correzione con for_doc_type diverso dal doc_type attuale ignorata;
//   - valid_until ricalcolata dai campi uniti;
//   - value null ("il documento non lo riporta") vince sul valore AI;
//   - chiavi non ammesse per il tipo ignorate;
//   - normalizzazione dell'input (date, interi, P.IVA, classe, testo vuoto).
//
// PERCHE' NON E' UN TEST UNITARIO: il repo non ha un test runner; lo script
// segue il pattern di scripts/verify-document-export.mjs.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente (elencato atteso vs ottenuto); exit 2 = import fallito.
// ============================================================

import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

const OVERRIDES = new URL('../src/lib/document-overrides.ts', import.meta.url)
const ROWS = new URL('../src/lib/document-rows.ts', import.meta.url)

let ov, rows
try {
  ov = await import(OVERRIDES.href)
  rows = await import(ROWS.href)
} catch (err) {
  console.error(
    `\n✗ Impossibile importare i moduli: ${err.message}\n` +
    '  Rilancia con:  node --experimental-strip-types scripts/verify-document-overrides.mjs\n' +
    '  (serve Node >= 22.6; da Node 23.6 il flag non è più necessario)'
  )
  process.exit(2)
}

const { overridableKeys, overrideRequiresExtraction, normalizeOverrideInput, effectiveExtraction, fieldProvenance, hasCurrentOverrides } = ov
const { currentExtraction, documentFacts, extractionFacts, canCorrectFields, correctionFields, hasCorrections, correctionsLostOnTypeChange, correctionAuthorIds } = rows

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
  for_doc_type: 'garanzia', status: 'completata', document_date: null, ambito: null,
  unita_riferimento: null, valid_until: null, fields: {}, ...over,
})
const o = (for_doc_type, field_key, value) => ({
  for_doc_type, field_key, value, set_by: 'u-admin', set_at: '2026-11-02T10:00:00+00:00',
})

// Garanzia AI: caldaia, Rossi, 2020-01-01 + 2 anni.
const garanziaExt = ext({
  for_doc_type: 'garanzia', document_date: '2020-01-01', ambito: 'parti_comuni',
  valid_until: '2022-01-01',
  fields: { inizio: '2020-01-01', durata_anni: 2, oggetto: 'Caldaia', rilasciata_da: 'Rossi' },
})
const garanzia = (overrides = []) => doc({ doc_type: 'garanzia', extraction: garanziaExt, overrides })

// --- 1. Nessuna correzione = output identico a oggi --------------------------
{
  const d = garanzia([])
  check('nessun override: currentExtraction restituisce la stessa riga AI', currentExtraction(d) === garanziaExt, true)
  check('nessun override: fatti in riga invariati', extractionFacts(d),
    ['Parti comuni', 'Caldaia', 'Rilasciata da Rossi', 'Valida fino al 1 gen 2022'])
  const senzaCampo = doc({ doc_type: 'garanzia', extraction: garanziaExt, overrides: undefined })
  check('overrides assente (riga vecchia): stessa riga AI', currentExtraction(senzaCampo) === garanziaExt, true)
  // Correzione presente ma di un altro tipo: anche qui stesso oggetto.
  const altroTipo = garanzia([o('polizza_decennale', 'durata_anni', '10')])
  check('override non attuale: stessa riga AI', currentExtraction(altroTipo) === garanziaExt, true)
  const dico = doc({
    doc_type: 'dich_conformita_dm37',
    extracted_metadata: { ragione_sociale_installatore: 'Elettro Srl', partita_iva_installatore: '01234567891' },
  })
  const f = documentFacts(dico)
  check('nessun override DiCo: installatore e P.IVA dal verbale', [f.installatore, f.partitaIva], ['Elettro Srl', '01234567891'])
  check('nessun override: hasCurrentOverrides false', hasCurrentOverrides('garanzia', []), false)
}

// --- 2. Manuale > AI ---------------------------------------------------------
{
  const d = garanzia([o('garanzia', 'oggetto', 'Pompa di calore'), o('garanzia', 'document_date', '2021-03-15')])
  const f = documentFacts(d)
  check('manuale > AI: oggetto', f.oggetto, 'Pompa di calore')
  check('manuale > AI: campo non corretto resta AI', f.rilasciataDa, 'Rossi')
  check('manuale > AI: colonna document_date', currentExtraction(d).document_date, '2021-03-15')
  check('la riga AI non viene mutata', garanziaExt.fields.oggetto, 'Caldaia')
  check('manuale > AI: ambito', documentFacts(garanzia([o('garanzia', 'ambito', 'residenza')])).ambito, 'Residenza')
  check('hasCurrentOverrides true', hasCurrentOverrides('garanzia', d.overrides), true)
}

// --- 3. for_doc_type diverso = ignorato --------------------------------------
{
  const d = garanzia([o('ape', 'oggetto', 'Ignorato'), o('polizza_decennale', 'durata_anni', '10')])
  const f = documentFacts(d)
  check('override di altro tipo ignorato: oggetto', f.oggetto, 'Caldaia')
  check('override di altro tipo ignorato: valid_until', f.validUntil, '2022-01-01')
  // Torna attivo se il documento torna a quel tipo.
  const polizza = doc({
    doc_type: 'polizza_decennale',
    extraction: ext({ for_doc_type: 'polizza_decennale', fields: { decorrenza: '2020-06-01', durata_anni: null } }),
    overrides: d.overrides,
  })
  check('override torna attivo col suo tipo', documentFacts(polizza).validUntil, '2030-06-01')
  // Chiave non ammessa per il tipo attuale: ignorata.
  const ape = doc({
    doc_type: 'ape',
    extraction: ext({ for_doc_type: 'ape', valid_until: '2030-01-01', fields: { classe_energetica: 'B', valida_fino_al: '2030-01-01' } }),
    overrides: [o('ape', 'oggetto', 'Non ammesso'), o('ape', 'valid_until', '2099-01-01')],
  })
  check('chiave non ammessa (oggetto, valid_until su APE) ignorata', currentExtraction(ape) === ape.extraction, true)
}

// --- 4. valid_until ricalcolata dai campi uniti ------------------------------
{
  check('garanzia: durata corretta 2 → 10, valid_until ricalcolata',
    documentFacts(garanzia([o('garanzia', 'durata_anni', '10')])).validUntil, '2030-01-01')
  check('garanzia: inizio corretto, valid_until ricalcolata',
    documentFacts(garanzia([o('garanzia', 'inizio', '2024-05-10')])).validUntil, '2026-05-10')
  check('durata_anni unita come numero, non testo',
    currentExtraction(garanzia([o('garanzia', 'durata_anni', '10')])).fields.durata_anni, 10)
  const polizzaFormula = doc({
    doc_type: 'polizza_decennale',
    extraction: ext({
      for_doc_type: 'polizza_decennale',
      fields: { compagnia: 'Assicura', numero_polizza: null, decorrenza: null, durata_anni: 10, evento_decorrenza: 'fine lavori', scadenza: null },
    }),
  })
  check('polizza senza date: formula', documentFacts(polizzaFormula).validityFormula, '10 anni dalla data di fine lavori')
  const conScadenza = { ...polizzaFormula, overrides: [o('polizza_decennale', 'scadenza', '2035-12-31')] }
  check('polizza: scadenza manuale → valid_until', documentFacts(conScadenza).validUntil, '2035-12-31')
  check('polizza: con data la formula sparisce', documentFacts(conScadenza).validityFormula, null)
  const ape = doc({
    doc_type: 'ape',
    extraction: ext({ for_doc_type: 'ape', valid_until: '2030-01-01', fields: { classe_energetica: 'B', valida_fino_al: '2030-01-01' } }),
    overrides: [o('ape', 'valida_fino_al', '2034-02-01'), o('ape', 'classe_energetica', 'A2')],
  })
  check('APE: valida_fino_al manuale → valid_until', documentFacts(ape).validUntil, '2034-02-01')
  check('APE: classe manuale', documentFacts(ape).classeEnergetica, 'A2')
}

// --- 5. value null ("non lo riporta") vince sul valore AI --------------------
{
  const d = garanzia([o('garanzia', 'rilasciata_da', null)])
  check('null vince: rilasciata_da', documentFacts(d).rilasciataDa, null)
  const senzaDurata = garanzia([o('garanzia', 'durata_anni', null)])
  check('null su durata: valid_until torna null', documentFacts(senzaDurata).validUntil, null)
  check('null su durata: nessuna formula', documentFacts(senzaDurata).validityFormula, null)
  const dico = doc({
    doc_type: 'dich_conformita_dm37',
    extraction: ext({ for_doc_type: 'dich_conformita_dm37' }),
    extracted_metadata: { ragione_sociale_installatore: 'Elettro Srl', partita_iva_installatore: '01234567891' },
    overrides: [o('dich_conformita_dm37', 'partita_iva_installatore', null)],
  })
  const f = documentFacts(dico)
  check('null vince: P.IVA DiCo, nome resta dal verbale', [f.installatore, f.partitaIva], ['Elettro Srl', null])
}

// --- 6. DiCo come f949ac0f: verbale vuoto, installatore a mano ---------------
{
  const d = doc({
    doc_type: 'dich_conformita_dm37',
    extraction: ext({ for_doc_type: 'dich_conformita_dm37' }),
    extracted_metadata: { doc_type: 'altro', ragione_sociale_installatore: null, partita_iva_installatore: null },
    overrides: [
      o('dich_conformita_dm37', 'ragione_sociale_installatore', 'Impianti Bianchi Srl'),
      o('dich_conformita_dm37', 'partita_iva_installatore', '09876543210'),
    ],
  })
  const f = documentFacts(d)
  check('DiCo: installatore e P.IVA manuali', [f.installatore, f.partitaIva], ['Impianti Bianchi Srl', '09876543210'])
  check('DiCo: fatti in riga', extractionFacts(d), ['Installatore: Impianti Bianchi Srl'])
  check('DiCo: le chiavi installatore non toccano l\'estrazione', currentExtraction(d) === d.extraction, true)
  // Installatore su un documento non DiCo: ignorato.
  const g = garanzia([o('garanzia', 'ragione_sociale_installatore', 'X')])
  check('installatore su garanzia ignorato', documentFacts(g).installatore, null)
}

// --- 7. Estrazione non corrente o assente ------------------------------------
{
  const riclassificato = doc({ doc_type: 'ape', extraction: garanziaExt, overrides: [o('ape', 'classe_energetica', 'A1')] })
  check('estrazione non corrente: nessuna estrazione effettiva', currentExtraction(riclassificato), null)
  check('effectiveExtraction(null) = null', effectiveExtraction('garanzia', null, [o('garanzia', 'oggetto', 'X')]), null)
}

// --- 8. Valori salvati non validi: letti in difesa come null -----------------
{
  check('durata salvata non numerica → null',
    currentExtraction(garanzia([o('garanzia', 'durata_anni', 'dieci')])).fields.durata_anni, null)
  check('data salvata non valida → null',
    currentExtraction(garanzia([o('garanzia', 'document_date', '2021-02-30')])).document_date, null)
}

// --- 9. Chiavi ammesse per tipo ----------------------------------------------
check('chiavi: altro', overridableKeys('altro'), [])
check('chiavi: null', overridableKeys(null), [])
check('chiavi: tipo sconosciuto', overridableKeys('inventato'), [])
check('chiavi: manuale', overridableKeys('manuale'), ['document_date', 'ambito', 'unita_riferimento'])
check('chiavi: DiCo', overridableKeys('dich_conformita_dm37'),
  ['document_date', 'ambito', 'unita_riferimento', 'ragione_sociale_installatore', 'partita_iva_installatore'])
check('chiavi: polizza', overridableKeys('polizza_decennale'),
  ['document_date', 'ambito', 'unita_riferimento', 'compagnia', 'numero_polizza', 'decorrenza', 'durata_anni', 'evento_decorrenza', 'scadenza'])
check('chiavi: valid_until mai correggibile',
  ['garanzia', 'ape', 'polizza_decennale'].some(t => overridableKeys(t).includes('valid_until')), false)

// --- 10. Normalizzazione dell'input ------------------------------------------
check('input: data valida', normalizeOverrideInput('garanzia', 'inizio', ' 2024-02-29 '), { value: '2024-02-29' })
check('input: data impossibile', normalizeOverrideInput('garanzia', 'inizio', '2023-02-29'), { error: 'Data non valida.' })
check('input: vuoto = non riportato', normalizeOverrideInput('garanzia', 'oggetto', '   '), { value: null })
check('input: null = non riportato', normalizeOverrideInput('garanzia', 'oggetto', null), { value: null })
check('input: testo ripulito', normalizeOverrideInput('garanzia', 'oggetto', '  Caldaia  '), { value: 'Caldaia' })
check('input: durata 10', normalizeOverrideInput('garanzia', 'durata_anni', '10'), { value: '10' })
check('input: durata 0', 'error' in normalizeOverrideInput('garanzia', 'durata_anni', '0'), true)
check('input: durata decimale', 'error' in normalizeOverrideInput('garanzia', 'durata_anni', '2.5'), true)
check('input: P.IVA con prefisso', normalizeOverrideInput('dich_conformita_dm37', 'partita_iva_installatore', 'IT 012 345 678 91'), { value: '01234567891' })
check('input: P.IVA 10 cifre', normalizeOverrideInput('dich_conformita_dm37', 'partita_iva_installatore', '0123456789'), { error: 'La partita IVA deve avere 11 cifre.' })
check('input: classe minuscola', normalizeOverrideInput('ape', 'classe_energetica', 'a4'), { value: 'A4' })
check('input: classe inesistente', 'error' in normalizeOverrideInput('ape', 'classe_energetica', 'A5'), true)
check('input: ambito', normalizeOverrideInput('manuale', 'ambito', 'unita'), { value: 'unita' })
check('input: ambito non valido', 'error' in normalizeOverrideInput('manuale', 'ambito', 'cantina'), true)
check('input: chiave non ammessa per il tipo', 'error' in normalizeOverrideInput('ape', 'oggetto', 'X'), true)
check('input: valid_until', 'error' in normalizeOverrideInput('garanzia', 'valid_until', '2030-01-01'), true)
check('input: documento altro', 'error' in normalizeOverrideInput('altro', 'document_date', '2024-01-01'), true)
check('input: testo troppo lungo', 'error' in normalizeOverrideInput('garanzia', 'oggetto', 'x'.repeat(301)), true)

// --- 11. Provenienza ---------------------------------------------------------
{
  const p = fieldProvenance('garanzia', [o('garanzia', 'oggetto', 'X'), o('ape', 'classe_energetica', 'A1')])
  check('provenienza: oggetto manuale con chi e quando', p.oggetto,
    { source: 'manuale', setBy: 'u-admin', setAt: '2026-11-02T10:00:00+00:00' })
  check('provenienza: altri campi AI', p.rilasciata_da, { source: 'ai' })
  check('provenienza: chiavi solo del tipo attuale', Object.keys(p),
    ['document_date', 'ambito', 'unita_riferimento', 'inizio', 'durata_anni', 'oggetto', 'rilasciata_da'])
}

// --- 12. Quali chiavi richiedono un'estrazione corrente ---------------------
check('estrazione richiesta: ragione sociale installatore no', overrideRequiresExtraction('ragione_sociale_installatore'), false)
check('estrazione richiesta: P.IVA installatore no', overrideRequiresExtraction('partita_iva_installatore'), false)
for (const k of ['document_date', 'ambito', 'unita_riferimento', 'inizio', 'durata_anni', 'oggetto', 'classe_energetica', 'scadenza']) {
  check(`estrazione richiesta: ${k} sì`, overrideRequiresExtraction(k), true)
}
// Ogni chiave ammessa per qualche tipo: le sole senza estrazione sono le due dell'installatore.
{
  const senza = new Set()
  for (const t of ['dich_conformita_dm37', 'garanzia', 'ape', 'polizza_decennale', 'manuale', 'altro']) {
    for (const k of overridableKeys(t)) if (!overrideRequiresExtraction(k)) senza.add(k)
  }
  check('estrazione non richiesta: solo le due chiavi installatore', [...senza].sort(),
    ['partita_iva_installatore', 'ragione_sociale_installatore'])
}

// --- 13. Pannello "Correggi dati": campi, gate, avviso, autori ---------------
{
  const g = garanzia([o('garanzia', 'oggetto', 'Caldaia a condensazione'), o('ape', 'classe_energetica', 'A1')])
  const campi = correctionFields(g)
  const per = k => campi.find(c => c.key === k)
  check('pannello: chiavi in ordine di overridableKeys', campi.map(c => c.key), overridableKeys('garanzia'))
  check('pannello: oggetto corretto, AI come riferimento', [per('oggetto').ai, per('oggetto').effective, per('oggetto').provenance.source],
    ['Caldaia', 'Caldaia a condensazione', 'manuale'])
  check('pannello: provenienza con chi e quando', per('oggetto').provenance,
    { source: 'manuale', setBy: 'u-admin', setAt: '2026-11-02T10:00:00+00:00' })
  check('pannello: campo non corretto = AI', [per('rilasciata_da').ai, per('rilasciata_da').effective, per('rilasciata_da').provenance.source],
    ['Rossi', 'Rossi', 'ai'])
  check('pannello: durata intera come testo', [per('durata_anni').ai, per('durata_anni').kind], ['2', 'int'])
  check('pannello: data ISO e tipo', [per('inizio').effective, per('inizio').kind], ['2020-01-01', 'date'])
  check('pannello: override di altro tipo non compare', campi.some(c => c.key === 'classe_energetica'), false)

  // value null scelto a mano: effettivo null, AI resta come riferimento.
  const nullo = correctionFields(garanzia([o('garanzia', 'oggetto', null)])).find(c => c.key === 'oggetto')
  check('pannello: non riportato a mano', [nullo.ai, nullo.effective, nullo.provenance.source], ['Caldaia', null, 'manuale'])

  // DiCo come f949ac0f: installatore dal verbale (vuoto) + correzione.
  const dico = doc({
    doc_type: 'dich_conformita_dm37',
    extraction: ext({ for_doc_type: 'dich_conformita_dm37' }),
    extracted_metadata: { ragione_sociale_installatore: null, partita_iva_installatore: null },
    overrides: [o('dich_conformita_dm37', 'ragione_sociale_installatore', 'Elettrica Rossi Srl'),
                o('dich_conformita_dm37', 'partita_iva_installatore', '01234567891')],
  })
  const cd = correctionFields(dico)
  check('pannello DiCo: installatore AI vuoto, effettivo corretto',
    cd.filter(c => c.key.endsWith('_installatore')).map(c => [c.key, c.ai, c.effective]),
    [['ragione_sociale_installatore', null, 'Elettrica Rossi Srl'], ['partita_iva_installatore', null, '01234567891']])

  // Gate "Correggi dati": estrazione corrente + tipo con campi correggibili.
  check('gate: garanzia con estrazione corrente', canCorrectFields(garanzia([])), true)
  check('gate: nessuna estrazione', canCorrectFields(doc({ doc_type: 'garanzia' })), false)
  check('gate: estrazione di un altro tipo', canCorrectFields(doc({ doc_type: 'ape', extraction: garanziaExt })), false)
  check('gate: documento altro', canCorrectFields(doc({ doc_type: 'altro', extraction: ext({ for_doc_type: 'altro' }) })), false)
  check('gate: senza tipo', canCorrectFields(doc({ extraction: garanziaExt })), false)
  check('gate: estrazione fallita ammessa', canCorrectFields(doc({ doc_type: 'garanzia', extraction: { ...garanziaExt, status: 'fallita' } })), true)

  // Etichetta in riga e avviso di riclassificazione (D6).
  check('etichetta: nessuna correzione', hasCorrections(garanzia([])), false)
  check('etichetta: correzione attuale', hasCorrections(g), true)
  check('etichetta: solo correzione di altro tipo', hasCorrections(garanzia([o('ape', 'classe_energetica', 'A1')])), false)
  check('avviso: tipo diverso conta le attuali', correctionsLostOnTypeChange(g, 'ape'), 1)
  check('avviso: stesso tipo = 0', correctionsLostOnTypeChange(g, 'garanzia'), 0)
  check('avviso: nessuna correzione = 0', correctionsLostOnTypeChange(garanzia([]), 'ape'), 0)

  // Autori: solo correzioni in vigore, senza duplicati.
  const due = garanzia([o('garanzia', 'oggetto', 'X'), { ...o('garanzia', 'rilasciata_da', 'Y'), set_by: 'u-2' },
    { ...o('ape', 'classe_energetica', 'A1'), set_by: 'u-3' }])
  check('autori: solo correzioni in vigore, unici', correctionAuthorIds([due, g]), ['u-admin', 'u-2'])
}

// --- esito -------------------------------------------------------------------
if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
