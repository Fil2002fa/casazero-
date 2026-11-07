// ============================================================
// CasaZero — verifica del tab "Parti comuni" (E1b, commit 9).
// Uso:  node --experimental-strip-types scripts/verify-common-documents.mjs
//       (oppure: npm run verify:common)
// ------------------------------------------------------------
// COSA GARANTISCE: che src/lib/common-documents.ts presenti la checklist come
// deciso: una riga per voce applicabile nell'ordine della checklist, la riga
// apre il documento più recente tra quelli che la soddisfano, le voci non
// applicabili stanno fuori da righe e totale, il contatore è caricati/totale,
// la categoria da precaricare viene solo dalla mappa esistente (mai indovinata),
// e una checklist non disponibile non diventa mai "niente da caricare".
//
// PERCHE' ESISTE: contatore e righe devono dire la stessa cosa (bug class
// contatore/lista) e la riga caricata deve aprire il documento giusto.
//
// Exit: 0 = ok; 1 = caso divergente; 2 = import fallito.
// ============================================================
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let M
try {
  M = await import(new URL('../src/lib/common-documents.ts', import.meta.url).href)
} catch (err) {
  console.error(`\n✗ Impossibile importare il modulo: ${err.message}`)
  process.exit(2)
}
const { commonDocuments, commonBadge, commonScopeLabel } = M

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
    storage_path: `r/tecnici/${n}.pdf`, file_date: null, unit_id: null,
    created_at: '2026-01-01T10:00:00Z', classification_status: 'completata',
    doc_type: 'agibilita', sistema: null, classification_confidence: 0.9,
    extracted_metadata: null, extraction: null, overrides: [],
    proposed_unit_id: null, unit_proposal_confidence: null, unit_proposal_dismissed_at: null,
    ...over,
  }
}
function exp(over) {
  const scope = over.scope ?? 'condominium'
  const docType = over.docType ?? 'agibilita'
  return {
    expectationKey: `${scope}:${docType}:${over.sistema ?? ''}`,
    scope, docType, sistema: null, label: `Voce ${docType}`, origin: 'base',
    sourceTemplateIds: [], satisfied: false, notApplicable: false, expectedFrom: null,
    note: null, markedBy: null, markedAt: null, matchingDocuments: [],
    ...over,
  }
}
const matching = (...docs) => docs.map(d => ({ id: d.id, label: d.title, reviewedBy: null }))
const available = (expectations, warnings = []) => ({ available: true, expectations, counts: {}, warnings })

// --- Checklist non disponibile ---
check('non disponibile: nessun risultato (mai "niente da caricare")', commonDocuments({ available: false }, []), null)
check('non disponibile: nessun badge', commonBadge(commonDocuments({ available: false }, [])), null)

// --- Righe e ordine ---
const a = doc({ doc_type: 'agibilita' })
const e1 = exp({ docType: 'agibilita', satisfied: true, matchingDocuments: matching(a) })
const e2 = exp({ docType: 'polizza_decennale' })
const e3 = exp({ scope: 'dossier_admin', docType: 'regolamento_condominiale' })
const e4 = exp({ scope: 'residence', docType: 'capitolato' })
const r = commonDocuments(available([e1, e2, e3, e4]), [a])
check('una riga per voce, nell ordine della checklist', r.rows.map(x => x.key), [e1, e2, e3, e4].map(e => e.expectationKey))
check('stati', r.rows.map(x => x.state), ['caricato', 'mancante', 'mancante', 'mancante'])
check('contatore caricati/totale', [r.loaded, r.total], [1, 4])
check('badge', commonBadge(r), '1/4')
check('riga caricata apre il suo documento', r.rows[0].doc?.id, a.id)
check('riga mancante senza documento', r.rows[1].doc, null)
check('la riga porta la voce della checklist com è', r.rows[1].expectation === e2, true)

// --- Ambito ---
check('ambito: condominium non si ripete', commonScopeLabel('condominium'), null)
check('ambito: dossier_admin', commonScopeLabel('dossier_admin'), 'Dossier amministratore')
check('ambito: residence', commonScopeLabel('residence'), 'Residenza')
check('ambito sulle righe', r.rows.map(x => x.scopeLabel), [null, null, 'Dossier amministratore', 'Residenza'])

// --- Più documenti sulla stessa voce: il più recente ---
const g1 = doc({ doc_type: 'garanzia', created_at: '2026-03-01T10:00:00Z' })
const g2 = doc({ doc_type: 'garanzia', created_at: '2026-05-01T10:00:00Z' })
const g3 = doc({ doc_type: 'garanzia', created_at: '2026-02-01T10:00:00Z' })
const eg = exp({ scope: 'dossier_admin', docType: 'garanzia', satisfied: true, matchingDocuments: matching(g1, g2, g3) })
check('più documenti: vince il più recente', commonDocuments(available([eg]), [g1, g2, g3]).rows[0].doc?.id, g2.id)
check('più documenti: una sola riga', commonDocuments(available([eg]), [g1, g2, g3]).rows.length, 1)
const t1 = doc({ doc_type: 'garanzia', created_at: '2026-04-01T10:00:00Z' })
const t2 = doc({ doc_type: 'garanzia', created_at: '2026-04-01T10:00:00Z' })
const et = exp({ docType: 'garanzia', satisfied: true, matchingDocuments: matching(t2, t1) })
check('parità di data: vale l ordine ricevuto', commonDocuments(available([et]), [t1, t2]).rows[0].doc?.id, t2.id)
const inputOrder = matching(g1, g2, g3).map(m => m.id)
commonDocuments(available([eg]), [g1, g2, g3])
check('non muta matchingDocuments', eg.matchingDocuments.map(m => m.id), inputOrder)

// --- Documento che la checklist cita ma la lista non ha ---
const orfana = exp({ docType: 'agibilita', satisfied: true, matchingDocuments: [{ id: 'sparito', label: 'x', reviewedBy: null }] })
const ro = commonDocuments(available([orfana]), [])
check('documento non trovato: la riga resta caricata ma non apre niente', [ro.rows[0].state, ro.rows[0].doc], ['caricato', null])

// --- Non applicabili: fuori da righe e totale ---
const ex = exp({ docType: 'cert_linee_vita', notApplicable: true, note: 'Edificio senza copertura praticabile' })
const exSat = exp({ docType: 'as_built', notApplicable: true, satisfied: true, matchingDocuments: matching(a) })
const rx = commonDocuments(available([e1, e2, ex, exSat]), [a])
check('escluse: fuori dalle righe', rx.rows.map(x => x.key), [e1.expectationKey, e2.expectationKey])
check('escluse: nella lista in coda, in ordine', rx.excluded.map(x => x.expectationKey), [ex.expectationKey, exSat.expectationKey])
check('escluse: il totale non le conta', [rx.loaded, rx.total], [1, 2])
check('esclusa anche se soddisfatta: non conta tra i caricati', rx.loaded, 1)
check('escluse: la voce è quella della checklist (nota e attribuzione intatte)', rx.excluded[0] === ex, true)

// --- Badge ---
check('badge 0/N visibile', commonBadge(commonDocuments(available([e2, e3]), [])), '0/2')
check('badge tutto caricato', commonBadge(commonDocuments(available([e1]), [a])), '1/1')
check('badge nascosto se non ci sono voci applicabili', commonBadge(commonDocuments(available([ex]), [])), null)
check('badge nascosto con checklist vuota', commonBadge(commonDocuments(available([]), [])), null)

// --- Categoria: solo dalla mappa, mai indovinata ---
const rc = commonDocuments(available([
  exp({ docType: 'agibilita' }), exp({ docType: 'garanzia' }), exp({ docType: 'cert_linee_vita' }), exp({ docType: 'altro' }),
]), [])
check('categoria dalla mappa esistente', rc.rows.map(x => x.category), ['amministrativi', 'tecnici', 'conformita', null])

// --- Tipi del template e del DERIVED_MAP: nessuno senza categoria ---
const tipiTab = [
  'agibilita', 'dich_conformita_dm37', 'polizza_decennale', 'as_built', 'piano_manutenzione_opera',
  'regolamento_condominiale', 'tabelle_millesimali', 'elenco_fornitori', 'garanzia', 'capitolato',
  'schede_materiali', 'libretto_impianto', 'manuale', 'cert_linee_vita',
]
const rt = commonDocuments(available(tipiTab.map(t => exp({ docType: t }))), [])
check('tutti i tipi del tab hanno una categoria', rt.rows.filter(x => x.category === null).map(x => x.docType), [])

// --- Warning della checklist ---
check('warning passati com sono', commonDocuments(available([e1], ['w1', 'w2']), [a]).warnings, ['w1', 'w2'])
check('voci unit (non usate in v1) ignorate', commonDocuments(available([exp({ scope: 'unit' })]), []).rows, [])

if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} casi divergenti su ${eseguiti}`)
  process.exit(1)
}
console.log(`✓ common-documents: ${eseguiti} casi, tutti conformi`)
