// ============================================================
// CasaZero — verifica del tab "Da rivedere" (E1b, commit 8).
// Uso:  node --experimental-strip-types scripts/verify-document-review.mjs
//       (oppure: npm run verify:docreview)
// ------------------------------------------------------------
// COSA GARANTISCE: che src/lib/document-review.ts risponda alle regole decise:
// nel tab stanno TUTTI i documenti senza unità e non ignorati (con o senza
// proposta, qualunque sia lo stato di classificazione); "Accetta tutte ad
// alta confidenza" prende SOLO le proposte pendenti in fascia Alta verso
// un'unità nota; il riepilogo è un solo messaggio, persistente se ci sono falliti.
//
// PERCHE' ESISTE: "Accetta tutte" non ha finestra di conferma. Una Media
// presa per Alta, o un documento ignorato riassegnato, scriverebbe
// un'unità sbagliata nel fascicolo senza che nessuno lo veda.
//
// Exit: 0 = ok; 1 = caso divergente; 2 = import fallito.
// ============================================================
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let M
try {
  M = await import(new URL('../src/lib/document-review.ts', import.meta.url).href)
} catch (err) {
  console.error(`\n✗ Impossibile importare il modulo: ${err.message}`)
  process.exit(2)
}
const { BAND_LABELS, isInReview, reviewDocs, reviewProposal, acceptAllCandidates, summarizeAcceptAll } = M

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
const units = [
  { id: 'u1', label: 'Unità 1' }, { id: 'u2', label: 'Unità 2' }, { id: 'u3', label: 'Unità 3' },
]

// --- Etichette ---
check('fasce', BAND_LABELS, { alta: 'Alta', media: 'Media', bassa: 'Bassa' })

// --- Chi sta nel tab ---
check('senza unità, non ignorato: dentro', isInReview(doc({})), true)
check('con unità: fuori', isInReview(doc({ unit_id: 'u1' })), false)
check('ignorato: fuori', isInReview(doc({ unit_proposal_dismissed_at: '2026-11-07T10:00:00Z' })), false)
check('con unità e ignorato: fuori', isInReview(doc({ unit_id: 'u1', unit_proposal_dismissed_at: '2026-11-07T10:00:00Z' })), false)

const senzaProposta = doc({})
const daVerificare = doc({ classification_status: 'da_verificare' })
const alta = doc({ proposed_unit_id: 'u3', unit_proposal_confidence: 'alta' })
const media = doc({ proposed_unit_id: 'u2', unit_proposal_confidence: 'media' })
const bassa = doc({ proposed_unit_id: 'u1', unit_proposal_confidence: 'bassa' })
const assegnato = doc({ unit_id: 'u1', proposed_unit_id: 'u2', unit_proposal_confidence: 'alta' })
const ignorato = doc({ proposed_unit_id: 'u2', unit_proposal_confidence: 'alta', unit_proposal_dismissed_at: '2026-11-07T10:00:00Z' })
const tutti = [senzaProposta, daVerificare, bassa, assegnato, media, ignorato, alta]

check('tab: tutti i senza unità non ignorati, qualunque classificazione',
  new Set(ids(reviewDocs(tutti, units))),
  new Set(ids([senzaProposta, daVerificare, bassa, media, alta])))
check('tab: ordine Alta, Media, Bassa, poi senza proposta',
  ids(reviewDocs([senzaProposta, bassa, media, alta], units)), ids([alta, media, bassa, senzaProposta]))
check('tab: a parità di fascia i più recenti prima',
  ids(reviewDocs([
    doc({ id: 'vecchio', file_date: '2025-01-01' }),
    doc({ id: 'nuovo', file_date: '2026-06-01' }),
  ], units)), ['nuovo', 'vecchio'])
{
  const input = [bassa, alta]
  const copia = ids(input)
  reviewDocs(input, units)
  check('tab: non muta l’elenco ricevuto', ids(input), copia)
}
check('tab: nessun documento', ids(reviewDocs([], units)), [])
check('tab: tutto assegnato = vuoto', ids(reviewDocs([assegnato], units)), [])

// --- Proposta in riga ---
check('proposta Alta', reviewProposal(alta, units),
  { unitId: 'u3', unitLabel: 'Unità 3', confidence: 'alta', bandLabel: 'Alta' })
check('proposta Media', reviewProposal(media, units)?.bandLabel, 'Media')
check('proposta Bassa', reviewProposal(bassa, units)?.bandLabel, 'Bassa')
check('senza proposta: null', reviewProposal(senzaProposta, units), null)
check('proposta ignorata: null', reviewProposal(ignorato, units), null)
check('già assegnato: null', reviewProposal(assegnato, units), null)
check('unità proposta sconosciuta: null',
  reviewProposal(doc({ proposed_unit_id: 'altrove', unit_proposal_confidence: 'alta' }), units), null)
check('fascia mancante: null',
  reviewProposal(doc({ proposed_unit_id: 'u1', unit_proposal_confidence: null }), units), null)

// --- Accetta tutte ---
{
  const alta2 = doc({ proposed_unit_id: 'u1', unit_proposal_confidence: 'alta' })
  const c = acceptAllCandidates(tutti.concat([alta2]), units)
  check('candidati: solo Alta pendenti (a parità di data, per titolo)', c.map(x => [x.doc.id, x.unitId]), [[alta2.id, 'u1'], [alta.id, 'u3']])
}
check('candidati: Media e Bassa mai', acceptAllCandidates([media, bassa, senzaProposta], units), [])
check('candidati: ignorato mai', acceptAllCandidates([ignorato], units), [])
check('candidati: già assegnato mai', acceptAllCandidates([assegnato], units), [])
check('candidati: unità sconosciuta mai',
  acceptAllCandidates([doc({ proposed_unit_id: 'altrove', unit_proposal_confidence: 'alta' })], units), [])
check('candidati: nessun documento', acceptAllCandidates([], units), [])

// --- Riepilogo ---
check('riepilogo: 3 assegnati',
  summarizeAcceptAll({ assigned: 3, failures: [] }),
  { kind: 'success', message: '3 documenti assegnati alle unità proposte.', persistent: false })
check('riepilogo: 1 assegnato',
  summarizeAcceptAll({ assigned: 1, failures: [] }).message, '1 documento assegnato alle unità proposte.')
check('riepilogo: niente da assegnare',
  summarizeAcceptAll({ assigned: 0, failures: [] }),
  { kind: 'success', message: 'Niente da assegnare: nessuna proposta ad alta confidenza.', persistent: false })
check('riepilogo: assegnati e falliti, motivo unico, persistente',
  summarizeAcceptAll({ assigned: 2, failures: [{ name: 'DiCo', error: 'Errore tecnico, riprova.' }] }),
  { kind: 'warning', message: '2 assegnati, 1 fallito: DiCo. Motivo: Errore tecnico, riprova.', persistent: true })
check('riepilogo: motivi diversi, nessun motivo in coda',
  summarizeAcceptAll({ assigned: 1, failures: [{ name: 'A', error: 'x' }, { name: 'B', error: 'y' }] }).message,
  '1 assegnato, 2 falliti: A, B.')
check('riepilogo: tutti falliti',
  summarizeAcceptAll({ assigned: 0, failures: [{ name: 'A', error: 'x' }] }),
  { kind: 'error', message: 'Nessun documento assegnato, 1 fallito: A. Motivo: x.', persistent: true })
check('riepilogo: più di 3 nomi',
  summarizeAcceptAll({ assigned: 0, failures: ['A', 'B', 'C', 'D', 'E'].map(name => ({ name, error: 'x' })) }).message,
  'Nessun documento assegnato, 5 falliti: A, B, C e altri 2. Motivo: x.')

if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} casi divergenti su ${eseguiti}`)
  process.exit(1)
}
console.log(`✓ document-review: ${eseguiti} casi, tutti conformi`)
