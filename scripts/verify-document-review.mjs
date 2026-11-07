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
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let M
try {
  M = await import(new URL('../src/lib/document-review.ts', import.meta.url).href)
} catch (err) {
  console.error(`\n✗ Impossibile importare il modulo: ${err.message}`)
  process.exit(2)
}
const {
  BAND_LABELS, isInReview, reviewDocs, reviewProposal, acceptAllCandidates, summarizeAcceptAll,
  checkDismissProposal, DISMISS_HAS_UNIT_ERROR,
  reviewGroups, reviewGroupKey, groupAssignments,
  summarizeGroupAssign, summarizeGroupDismiss,
} = M

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

// --- Gruppi: lo stesso file caricato più volte (E1b-8e) ---
{
  const g = (file_name, doc_type, created_at, over = {}) => doc({ file_name, doc_type, created_at, ...over })
  const gids = list => list.map(x => [x.latest.id, x.docs.map(d => d.id)])

  const v1 = g('libretto.pdf', 'manuale', '2026-05-01T10:00:00Z', { id: 'v1' })
  const v2 = g('libretto.pdf', 'manuale', '2026-05-03T10:00:00Z', { id: 'v2' })
  const v3 = g('libretto.pdf', 'manuale', '2026-05-02T10:00:00Z', { id: 'v3' })
  const gr = reviewGroups([v1, v2, v3], units)
  check('gruppo: stesso nome e stesso tipo = una riga, il più recente per primo', gids(gr), [['v2', ['v2', 'v3', 'v1']]])
  check('gruppo: extra = versioni oltre il più recente', gr[0].extra, 2)
  check('gruppo: un documento solo = extra 0', reviewGroups([doc({})], units)[0].extra, 0)

  check('gruppo: stesso nome, tipo diverso = due gruppi',
    reviewGroups([g('b.pdf', 'schede_materiali', '2026-05-01T10:00:00Z'), g('b.pdf', 'tabelle_millesimali', '2026-05-01T10:00:00Z')], units).length, 2)
  check('gruppo: stesso tipo, nome diverso (due DiCo) = due gruppi',
    reviewGroups([g('dico_a.pdf', 'dich_conformita_dm37', '2026-05-01T10:00:00Z'), g('dico_b.pdf', 'dich_conformita_dm37', '2026-05-01T10:00:00Z')], units).length, 2)
  check('gruppo: senza tipo si raggruppa solo con altri senza tipo',
    reviewGroups([g('x.pdf', null, '2026-05-01T10:00:00Z'), g('x.pdf', null, '2026-05-02T10:00:00Z'), g('x.pdf', 'altro', '2026-05-03T10:00:00Z')], units).map(x => x.docs.length).sort(), [1, 2])
  check('gruppo: la chiave non si confonde tra nome e tipo',
    reviewGroupKey({ file_name: 'a', doc_type: 'b_c' }) === reviewGroupKey({ file_name: 'a_b', doc_type: 'c' }), false)

  const t1 = g('pari.pdf', 'manuale', '2026-05-01T10:00:00Z', { id: 'b-id' })
  const t2 = g('pari.pdf', 'manuale', '2026-05-01T10:00:00Z', { id: 'a-id' })
  check('gruppo: a parità di istante decide l’id, qualunque sia l’ordine ricevuto',
    [reviewGroups([t1, t2], units)[0].latest.id, reviewGroups([t2, t1], units)[0].latest.id], ['a-id', 'a-id'])

  const nuovoSenza = g('p.pdf', 'ape', '2026-05-09T10:00:00Z', { id: 'n' })
  const vecchioConAlta = g('p.pdf', 'ape', '2026-05-01T10:00:00Z', { id: 'o', proposed_unit_id: 'u1', unit_proposal_confidence: 'alta' })
  check('gruppo: la proposta è quella del più recente (vecchia con proposta, nuova senza = Nessuna proposta)',
    reviewProposal(reviewGroups([vecchioConAlta, nuovoSenza], units)[0].latest, units), null)
  check('gruppo: e non va in Accetta tutte', acceptAllCandidates(reviewGroups([vecchioConAlta, nuovoSenza], units), units), [])
  const nuovoAlta = g('q.pdf', 'ape', '2026-05-09T10:00:00Z', { id: 'qn', proposed_unit_id: 'u2', unit_proposal_confidence: 'alta' })
  const vecchioSenza = g('q.pdf', 'ape', '2026-05-01T10:00:00Z', { id: 'qo' })
  check('gruppo: nuovo con proposta Alta = candidato con tutte le versioni',
    acceptAllCandidates(reviewGroups([vecchioSenza, nuovoAlta], units), units).map(c => [c.group.docs.map(d => d.id), c.unitId]), [[['qn', 'qo'], 'u2']])

  check('gruppo: assegnati e ignorati restano fuori dal gruppo',
    gids(reviewGroups([v2, g('libretto.pdf', 'manuale', '2026-05-04T10:00:00Z', { id: 'ass', unit_id: 'u1' }),
      g('libretto.pdf', 'manuale', '2026-05-05T10:00:00Z', { id: 'ign', unit_proposal_dismissed_at: '2026-11-07T10:00:00Z' })], units)),
    [['v2', ['v2']]])

  const a1 = g('a.pdf', 'ape', '2026-05-01T10:00:00Z', { id: 'a1', proposed_unit_id: 'u1', unit_proposal_confidence: 'alta' })
  const m1 = g('m.pdf', 'ape', '2026-05-01T10:00:00Z', { id: 'm1', proposed_unit_id: 'u1', unit_proposal_confidence: 'media' })
  const s1 = g('s.pdf', 'ape', '2026-05-09T10:00:00Z', { id: 's1' })
  const s2 = g('s.pdf', 'ape', '2026-05-08T10:00:00Z', { id: 's2' })
  check('gruppi: ordine Alta, Media, poi senza proposta, sul più recente',
    reviewGroups([s2, s1, m1, a1], units).map(x => x.latest.id), ['a1', 'm1', 's1'])
  {
    const input = [s2, a1, s1]
    const copia = ids(input)
    reviewGroups(input, units)
    check('gruppi: non muta l’elenco ricevuto', ids(input), copia)
  }
  check('gruppi: nessun documento', reviewGroups([], units), [])
  check('gruppi: tutto assegnato = vuoto', reviewGroups([assegnato], units), [])

  // Appiattimento: un'assegnazione per documento, tutte alla stessa unità
  check('assegnazioni: una per documento, stessa unità',
    groupAssignments(gr[0], 'u2').map(x => [x.doc.id, x.unitId]), [['v2', 'u2'], ['v3', 'u2'], ['v1', 'u2']])
  check('assegnazioni: Ignora usa unitId null', groupAssignments(gr[0], null).map(x => x.unitId), [null, null, null])

  // Accetta tutte: le regole di sempre, ora sui gruppi
  const cand = list => acceptAllCandidates(reviewGroups(list, units), units)
  {
    const alta2 = doc({ proposed_unit_id: 'u1', unit_proposal_confidence: 'alta' })
    check('candidati: solo Alta pendenti (a parità di data, per titolo)',
      cand(tutti.concat([alta2])).map(x => [x.group.latest.id, x.unitId]), [[alta2.id, 'u1'], [alta.id, 'u3']])
  }
  check('candidati: Media e Bassa mai', cand([media, bassa, senzaProposta]), [])
  check('candidati: ignorato mai', cand([ignorato]), [])
  check('candidati: già assegnato mai', cand([assegnato]), [])
  check('candidati: unità sconosciuta mai',
    cand([doc({ proposed_unit_id: 'altrove', unit_proposal_confidence: 'alta' })]), [])
  check('candidati: nessun documento', cand([]), [])

  // Accetta tutte: candidati contati a gruppi
  const a2 = g('a.pdf', 'ape', '2026-05-02T10:00:00Z', { id: 'a2', proposed_unit_id: 'u1', unit_proposal_confidence: 'alta' })
  check('Accetta tutte: il pulsante conta i gruppi, non i file',
    acceptAllCandidates(reviewGroups([a1, a2, m1, s1], units), units).length, 1)

  // Toast del gruppo
  check('toast gruppo: 2 versioni, totale dei file',
    summarizeGroupAssign({ total: 2, unitLabel: 'Unità 2', failures: [] }),
    { kind: 'success', message: 'Documento assegnato a Unità 2 (2 versioni).', persistent: false })
  check('toast gruppo: un documento, nessuna parentesi',
    summarizeGroupAssign({ total: 1, unitLabel: 'Unità 2', failures: [] }).message, 'Documento assegnato a Unità 2.')
  check('toast gruppo: un file solo che fallisce, formato di sempre',
    summarizeGroupAssign({ total: 1, unitLabel: 'Unità 2', failures: [{ name: 'DiCo', error: 'Errore.' }] }),
    { kind: 'error', message: 'DiCo: Errore.', persistent: true })
  check('toast gruppo: fallimento parziale, nome una volta sola',
    summarizeGroupAssign({ total: 3, unitLabel: 'Unità 2', failures: [{ name: 'Libretto', error: 'x' }, { name: 'Libretto', error: 'x' }] }),
    { kind: 'warning', message: 'Assegnazione a Unità 2: riuscita su 1 file su 3, 2 file non riusciti: Libretto. Motivo: x.', persistent: true })
  check('toast gruppo: tutti falliti',
    summarizeGroupAssign({ total: 2, unitLabel: 'Unità 2', failures: [{ name: 'L', error: 'x' }, { name: 'L', error: 'x' }] }),
    { kind: 'error', message: 'Assegnazione a Unità 2: nessun file su 2, 2 file non riusciti: L. Motivo: x.', persistent: true })
  check('toast ignora: 2 versioni',
    summarizeGroupDismiss({ total: 2, failures: [] }).message, 'Documento lasciato senza unità (2 versioni): non verrà più proposto.')
  check('toast ignora: un documento',
    summarizeGroupDismiss({ total: 1, failures: [] }).message, 'Documento lasciato senza unità: non verrà più proposto.')
  check('toast ignora: fallimento parziale',
    summarizeGroupDismiss({ total: 2, failures: [{ name: 'L', error: 'x' }] }).message, 'Ignora: riuscita su 1 file su 2, 1 file non riuscito: L. Motivo: x.')

  // Riepilogo di Accetta tutte, a gruppi
  const gA = reviewGroups([a1, a2], units)[0]            // 2 file
  const gB = reviewGroups([g('z.pdf', 'ape', '2026-05-01T10:00:00Z', { id: 'z1' })], units)[0] // 1 file
  check('Accetta tutte: numero dei gruppi, file in tutto tra parentesi',
    summarizeAcceptAll({ groups: [gA, gB], failedIds: new Set(), failures: [] }),
    { kind: 'success', message: '2 documenti assegnati alle unità proposte (3 file in tutto).', persistent: false })
  check('Accetta tutte: senza versioni nessuna parentesi',
    summarizeAcceptAll({ groups: [gB], failedIds: new Set(), failures: [] }).message, '1 documento assegnato alle unità proposte.')
  check('Accetta tutte: niente da assegnare',
    summarizeAcceptAll({ groups: [], failedIds: new Set(), failures: [] }),
    { kind: 'success', message: 'Niente da assegnare: nessuna proposta ad alta confidenza.', persistent: false })
  check('Accetta tutte: un file non assegnato, persistente',
    summarizeAcceptAll({ groups: [gA, gB], failedIds: new Set(['z1']), failures: [{ name: 'nome.pdf', error: 'x' }] }),
    { kind: 'warning', message: '1 documento assegnato, 1 file non assegnato: nome.pdf. Motivo: x.', persistent: true })
  check('Accetta tutte: gruppo con un solo file fallito non conta come assegnato',
    summarizeAcceptAll({ groups: [gA, gB], failedIds: new Set(['a2']), failures: [{ name: 'a', error: 'x' }] }).message,
    '1 documento assegnato, 1 file non assegnato: a. Motivo: x.')
  check('Accetta tutte: due versioni fallite, un nome e due file',
    summarizeAcceptAll({ groups: [gA, gB], failedIds: new Set(['a1', 'a2']), failures: [{ name: 'a', error: 'x' }, { name: 'a', error: 'x' }] }).message,
    '1 documento assegnato, 2 file non assegnati: a. Motivo: x.')
  check('Accetta tutte: tutti falliti',
    summarizeAcceptAll({ groups: [gB], failedIds: new Set(['z1']), failures: [{ name: 'z', error: 'x' }] }),
    { kind: 'error', message: 'Nessun documento assegnato, 1 file non assegnato: z. Motivo: x.', persistent: true })
  check('Accetta tutte: più di 3 nomi',
    summarizeAcceptAll({ groups: [gB], failedIds: new Set(['z1']), failures: ['A', 'B', 'C', 'D', 'E'].map(name => ({ name, error: 'x' })) }).message,
    'Nessun documento assegnato, 5 file non assegnati: A, B, C e altri 2. Motivo: x.')
}

// --- Ignora: regola pura ---
check('ignora: senza unità e non ignorato',
  checkDismissProposal({ unit_id: null, unit_proposal_dismissed_at: null }), { ok: true, change: 'ignorata' })
check('ignora: già ignorato = invariata (successo, nessuna riscrittura)',
  checkDismissProposal({ unit_id: null, unit_proposal_dismissed_at: '2026-11-07T10:00:00Z' }), { ok: true, change: 'invariata' })
check('ignora: con unità = errore di dominio',
  checkDismissProposal({ unit_id: 'u1', unit_proposal_dismissed_at: null }), { ok: false, error: DISMISS_HAS_UNIT_ERROR })
check('ignora: con unità e già ignorato = errore di dominio',
  checkDismissProposal({ unit_id: 'u1', unit_proposal_dismissed_at: '2026-11-07T10:00:00Z' }), { ok: false, error: DISMISS_HAS_UNIT_ERROR })

// --- Ignora: la server action non fa altro che scrivere dismissed_at ---
// Guardia sul sorgente: l'action non deve scrivere unit_id, la proposta, il
// registro attività né il fascicolo, e deve ripetere le condizioni nel WHERE.
const actionsSrc = readFileSync(
  new URL('../src/app/(dashboard)/admin/residences/[id]/documenti/actions.ts', import.meta.url), 'utf8',
)
const start = actionsSrc.indexOf('export async function dismissDocumentUnitProposal')
const end = actionsSrc.indexOf('\n// ====', start)
const body = start === -1 ? '' : actionsSrc.slice(start, end === -1 ? undefined : end)
check('action: esiste', start !== -1, true)
check('action: gate di ruolo admin e super_admin',
  body.includes("requireCaller('dismissDocumentUnitProposal', ['admin', 'super_admin'])"), true)
check('action: perimetro via authorizeDocumentActor', body.includes('authorizeDocumentActor('), true)
check('action: scrive solo unit_proposal_dismissed_at',
  body.includes('.update({ unit_proposal_dismissed_at: new Date().toISOString() })'), true)
check('action: WHERE senza unità e non ignorato',
  body.includes(".is('unit_id', null)") && body.includes(".is('unit_proposal_dismissed_at', null)"), true)
check('action: update dal client di sessione',
  /const supabase = await createClient\(\)\s+const \{ data: updated, error: updateError \} = await supabase\s+\.from\('documents'\)\s+\.update/.test(body), true)
check('action: nessun evento nel registro', body.includes('logActivityEvent('), false)
check('action: non tocca completions', body.includes('.from(\'completions\')'), false)
check('action: non scrive unit_id né la proposta',
  /\.update\(\{[^}]*(unit_id|proposed_unit_id|unit_proposal_confidence)/.test(body), false)

// --- Lista Da rivedere: "Accetta tutte" riusa il ciclo condiviso, senza conferma ---
const listSrc = readFileSync(
  new URL('../src/app/(dashboard)/admin/residences/[id]/documenti/ReviewList.tsx', import.meta.url), 'utf8',
)
const accStart = listSrc.indexOf('async function acceptAll()')
const accEnd = listSrc.indexOf('\n  }\n', accStart)
const acc = accStart === -1 ? '' : listSrc.slice(accStart, accEnd)
check('lista: acceptAll esiste', accStart !== -1, true)
check('lista: acceptAll usa runUnitAssignments', acc.includes('runUnitAssignments('), true)
check('lista: acceptAll non rigenera a ogni passo (revalidate: false)', acc.includes('revalidate: false'), true)
check('lista: acceptAll un solo router.refresh', acc.split('router.refresh()').length - 1, 1)
check('lista: acceptAll un solo toast, persistente se falliti',
  acc.split('showToast(').length - 1 === 1 && acc.includes('summary.persistent ? { persistent: true } : undefined'), true)
check('lista: acceptAll parte solo da acceptAllCandidates, una assegnazione per documento del gruppo',
  acc.includes('candidates.flatMap(') && acc.includes('groupAssignments(c.group, c.unitId)'), true)
check('lista: acceptAll riepiloga a gruppi (summarizeAcceptAll con failedIds)',
  acc.includes('summarizeAcceptAll({') && acc.includes('failedIds'), true)

// Azioni di riga (Accetta, Cambia, Ignora): agiscono sull'intero gruppo, stesso ciclo
const fnBody = (name) => {
  const a = listSrc.indexOf(`async function ${name}(`)
  const b = listSrc.indexOf('\n  }\n', a)
  return a === -1 ? '' : listSrc.slice(a, b)
}
const asg = fnBody('assignGroup')
check('lista: assignGroup esiste', asg !== '', true)
check('lista: assignGroup passa da runUnitAssignments su tutte le versioni (groupAssignments)',
  asg.includes('runUnitAssignments(') && asg.includes('groupAssignments(group, unitId)'), true)
check('lista: assignGroup non rigenera a ogni passo (revalidate: false)', asg.includes('revalidate: false'), true)
check('lista: assignGroup un solo router.refresh e un solo toast',
  asg.split('router.refresh()').length - 1 === 1 && asg.split('showToast(').length - 1 === 1, true)
check('lista: assignGroup usa il toast di gruppo', asg.includes('summarizeGroupAssign('), true)
const dis = fnBody('dismissGroup')
check('lista: dismissGroup esiste', dis !== '', true)
check('lista: dismissGroup ignora tutte le versioni (groupAssignments con null) col solo dismissDocumentUnitProposal',
  dis.includes('runUnitAssignments(') && dis.includes('groupAssignments(group, null)') && dis.includes('dismissDocumentUnitProposal({ documentId: input.documentId })'), true)
check('lista: dismissGroup un solo router.refresh e un solo toast',
  dis.split('router.refresh()').length - 1 === 1 && dis.split('showToast(').length - 1 === 1, true)
check('lista: dismissGroup usa il toast di gruppo', dis.includes('summarizeGroupDismiss('), true)
check('lista: nessuna azione per singolo documento (assignOne, ignoreOne, setDocumentUnit diretto)',
  /assignOne|ignoreOne|await setDocumentUnit\(/.test(listSrc), false)
check('lista: nessuna finestra di conferma (niente Modal)', /\bModal\b/.test(listSrc), false)
check('lista: nessun client Supabase né completions', /supabase|completions/.test(listSrc), false)

if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} casi divergenti su ${eseguiti}`)
  process.exit(1)
}
console.log(`✓ document-review: ${eseguiti} casi, tutti conformi`)
