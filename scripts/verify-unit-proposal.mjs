// ============================================================
// CasaZero — verifica della proposta di unità (E1b).
// Uso:  node --experimental-strip-types scripts/verify-unit-proposal.mjs
//       (oppure: npm run verify:unitmatch)
// ------------------------------------------------------------
// COSA GARANTISCE: che proposeUnit (src/lib/document-unit-proposal.ts) proponga
// l'unità giusta con la fascia giusta per i testi reali di Residenza Prova
// (etichette A1, A2, B1, B2) e di Residenza Cavaccio (Unità 1.., senza 3 e 4,
// più etichette rinominate), e SOPRATTUTTO che non proponga niente quando il
// testo è ambiguo o non indica un'unità esistente.
//
// PERCHE' ESISTE: una proposta sbagliata, accettata in blocco da "Accetta tutte
// le proposte ad alta confidenza", assegnerebbe un documento legale all'unità
// sbagliata senza che nessuno se ne accorga.
//
// Exit: 0 = ok; 1 = almeno un caso divergente; 2 = import fallito.
// ============================================================
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let mod
try {
  mod = await import(new URL('../src/lib/document-unit-proposal.ts', import.meta.url).href)
} catch (err) {
  console.error(`\n✗ Impossibile importare il modulo: ${err.message}`)
  process.exit(2)
}
const { proposeUnit, proposalSourceText, canReceiveUnitProposal, unitProposalFor, hasPendingUnitProposal } = mod

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

const mk = labels => labels.map(label => ({ id: `u-${label}`, label }))
const PROVA = mk(['A1', 'A2', 'B1', 'B2'])
const CAVACCIO = mk([
  'Appartamento Loro Rinominato', 'Appartamento Rossi Rinominato', 'Test 4 Rinominato',
  'Unità 1', 'Unità 2', 'Unità 5', 'Unità 6', 'Unità 7', 'Unità 8', 'Unità 9',
  'Unità 10', 'Unità 11', 'Unità 12', 'Unità 13', 'Unità 14',
])
const via = (units, text) => proposeUnit(text, units)
const P = (label, confidence) => ({ unitId: `u-${label}`, confidence })

// --- Residenza Prova: testi reali dal DB -----------------------------------------
check('Prova: "Interno A1 - Piano Terra - Sub. 3" -> A1 alta', via(PROVA, 'Interno A1 - Piano Terra - Sub. 3'), P('A1', 'alta'))
check('Prova: "Interno B2 - Piano Primo" -> B2 alta', via(PROVA, 'Interno B2 - Piano Primo'), P('B2', 'alta'))
check('Prova: "Interno A2 - Piano Primo, Sub. 4" -> A2 alta', via(PROVA, 'Interno A2 - Piano Primo, Sub. 4'), P('A2', 'alta'))
check('Prova: "scala A, piano terra, interno A1" -> A1 alta', via(PROVA, 'scala A, piano terra, interno A1'), P('A1', 'alta'))
check('Prova: "scala B, piano primo, interno B2" -> B2 alta', via(PROVA, 'scala B, piano primo, interno B2'), P('B2', 'alta'))
check('Prova: "Scala A, piano primo, interno A2" (maiuscole) -> A2 alta', via(PROVA, 'Scala A, piano primo, interno A2'), P('A2', 'alta'))
check('Prova: libretto "via Mazzini, 12 - singola unità immobiliare, cod. catasto 12345" -> niente',
  via(PROVA, 'via Mazzini, 12 - singola unità immobiliare, cod. catasto 12345'), null)
check('Prova: solo scala, niente interno -> niente', via(PROVA, 'scala A, piano terra'), null)
check('Prova: "int. B1" abbreviato -> B1 alta', via(PROVA, 'int. B1'), P('B1', 'alta'))

// --- Residenza Cavaccio ----------------------------------------------------------
check('Cavaccio: "interno 3" (non esiste Unità 3) -> niente', via(CAVACCIO, 'interno 3'), null)
check('Cavaccio: "Via Cavaccio 12, Pordenone — interno 3" -> niente (il 12 della via non è l\'unità 12)',
  via(CAVACCIO, 'Via Cavaccio 12, Pordenone — interno 3'), null)
check('Cavaccio: "Via Cavaccio 12, Pordenone" -> niente', via(CAVACCIO, 'Via Cavaccio 12, Pordenone'), null)
check('Cavaccio: "Unità 1" -> Unità 1 alta', via(CAVACCIO, 'Unità 1'), P('Unità 1', 'alta'))
check('Cavaccio: "unità 10" non si confonde con Unità 1', via(CAVACCIO, 'unità 10'), P('Unità 10', 'alta'))
check('Cavaccio: "interno 5" -> Unità 5 alta', via(CAVACCIO, 'interno 5'), P('Unità 5', 'alta'))
check('Cavaccio: "Sub. 6" senza marcatore -> niente', via(CAVACCIO, 'Sub. 6'), null)
check('Cavaccio: etichetta intera "Appartamento Rossi Rinominato" -> media',
  via(CAVACCIO, 'Appartamento Rossi Rinominato, piano 2'), P('Appartamento Rossi Rinominato', 'media'))

// --- ambiguità: mai una proposta ------------------------------------------------
check('due riferimenti a unità diverse -> niente', via(PROVA, 'interno A1 e interno B2'), null)
check('due unità con la stessa chiave -> niente',
  via([{ id: 'x', label: 'Unità 3' }, { id: 'y', label: 'Appartamento 3' }], 'interno 3'), null)
check('un riferimento che combacia e uno che no -> media',
  via(CAVACCIO, 'interno 5, interno 3'), P('Unità 5', 'media'))
check('chiave alfanumerica da sola, senza "interno" -> bassa', via(PROVA, 'Villetta A1 lato nord'), P('A1', 'bassa'))
check('numero nudo non basta mai', via(mk(['Unità 1', 'Unità 2']), 'pagina 2 di 3'), null)
check('nessuna unità nella residenza -> niente', via([], 'interno A1'), null)
check('testo vuoto o null -> niente', [via(PROVA, ''), via(PROVA, null), via(PROVA, undefined), via(PROVA, '   ')], [null, null, null, null])
check('accenti e punteggiatura non contano', via(mk(['Unità 4']), 'UNITÀ  N. 4'), P('Unità 4', 'alta'))

// --- documento ------------------------------------------------------------------
const doc = (over = {}) => ({
  id: 'd', title: 't', category: 'tecnici', file_name: 'f.pdf', storage_path: 'r/f.pdf', file_date: null,
  unit_id: null, created_at: '2026-11-01T00:00:00+00:00', classification_status: 'completata',
  doc_type: 'ape', sistema: null, classification_confidence: 0.9, extracted_metadata: null,
  extraction: null, overrides: [],
  proposed_unit_id: null, unit_proposal_confidence: null, unit_proposal_dismissed_at: null, ...over,
})
const extraction = unita => ({
  for_doc_type: 'ape', status: 'completata', document_date: null, ambito: 'unita',
  unita_riferimento: unita, valid_until: null, fields: {},
})
const override = value => ({ for_doc_type: 'ape', field_key: 'unita_riferimento', value, set_by: 'u', set_at: '2026-11-04T10:00:00+00:00' })
const IGNORATO = '2026-11-06T09:00:00+00:00'

check('sorgente: estrazione corrente', proposalSourceText(doc({ extraction: extraction('interno A2') })), 'interno A2')
check('sorgente: senza estrazione, il verbale', proposalSourceText(doc({ extracted_metadata: { unita_riferimento: 'interno B1' } })), 'interno B1')
check('sorgente: estrazione di un altro tipo non conta, ripiega sul verbale',
  proposalSourceText(doc({ extraction: { ...extraction('interno A2'), for_doc_type: 'garanzia' }, extracted_metadata: { unita_riferimento: 'interno B1' } })), 'interno B1')
check('sorgente: nessun testo', proposalSourceText(doc()), null)
check('sorgente: correzione vuota = il documento non la riporta',
  proposalSourceText(doc({
    extraction: extraction('interno A2'),
    extracted_metadata: { unita_riferimento: 'interno A2' },
    overrides: [override(null)],
  })), null)
check('sorgente: correzione manuale vince sull\'AI',
  proposalSourceText(doc({ extraction: extraction('interno A2'), overrides: [override('interno B1')] })), 'interno B1')

check('idoneo: senza unità e non ignorato', canReceiveUnitProposal(doc()), true)
check('non idoneo: già assegnato', canReceiveUnitProposal(doc({ unit_id: 'u-A1' })), false)
check('non idoneo: ignorato', canReceiveUnitProposal(doc({ unit_proposal_dismissed_at: IGNORATO })), false)
check('unitProposalFor: documento assegnato -> niente anche con testo chiaro',
  unitProposalFor(doc({ unit_id: 'u-A2', extraction: extraction('interno B1') }), PROVA), null)
check('unitProposalFor: documento ignorato -> niente',
  unitProposalFor(doc({ unit_proposal_dismissed_at: IGNORATO, extraction: extraction('interno B1') }), PROVA), null)
check('unitProposalFor: documento libero con testo chiaro', unitProposalFor(doc({ extraction: extraction('interno B1') }), PROVA), P('B1', 'alta'))

check('pendente: proposta su documento libero', hasPendingUnitProposal(doc({ proposed_unit_id: 'u-A1', unit_proposal_confidence: 'alta' })), true)
check('non pendente: nessuna proposta', hasPendingUnitProposal(doc()), false)
check('non pendente: assegnato', hasPendingUnitProposal(doc({ unit_id: 'u-A1', proposed_unit_id: 'u-A1' })), false)
check('non pendente: ignorato', hasPendingUnitProposal(doc({ proposed_unit_id: 'u-A1', unit_proposal_dismissed_at: IGNORATO })), false)

if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
process.exit(0)
