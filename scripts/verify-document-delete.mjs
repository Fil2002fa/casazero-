// ============================================================
// CasaZero — verifica delle regole di eliminazione documento (E1b, 7b).
// Uso:  node --experimental-strip-types scripts/verify-document-delete.mjs
//       (oppure: npm run verify:docdelete)
// ------------------------------------------------------------
// COSA GARANTISCE: che findDeleteBlockers trovi ogni documento fonte di
// un'installazione o con allegati (il DB non lo blocca: SET NULL e CASCADE), che
// i messaggi elenchino tutti i bloccati col motivo, che il payload rispetti il
// contratto della 053 e che una risposta dello storage senza errore ma con una
// lista più corta conti come fallimento.
//
// Copre anche ciò che dal browser non si può provocare: il ramo attachments (0
// righe nel DB), il fallimento dello storage e l'evento non registrato.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente; exit 2 = import fallito — mai confuso con un esito positivo.
// ============================================================

import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

const MOD = new URL('../src/lib/document-delete.ts', import.meta.url)

let mod
try {
  mod = await import(MOD.href)
} catch (err) {
  console.error(
    `\n✗ Impossibile importare il modulo: ${err.message}\n` +
    '  Rilancia con:  node --experimental-strip-types scripts/verify-document-delete.mjs\n' +
    '  (serve Node >= 22.6; da Node 23.6 il flag non è più necessario)'
  )
  process.exit(2)
}

const {
  DOCUMENT_SNAPSHOT_COLUMNS,
  findDeleteBlockers, deleteBlockerReason, deleteBlockedMessage,
  documentDeletedPayload, documentFileNotRemovedPayload, documentDeletedText, documentFileNotRemovedText,
  fileRemovalFailures, summarizeDocumentDelete,
} = mod

let passed = 0
let failed = 0
function check(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.log(`  ✗ ${name}\n      atteso:  ${e}\n      trovato: ${a}`)
  }
}

const A = { id: 'a', title: 'dico_termico' }
const B = { id: 'b', title: 'verbale' }
const C = { id: 'c', title: 'garanzia' }

console.log('\nBlocchi')
check('nessun riferimento: nessun bloccato', findDeleteBlockers([A, B], [], []), [])
check('installazione: bloccato', findDeleteBlockers([A, B], ['a'], []), [{ id: 'a', title: 'dico_termico', installations: 1, attachments: 0 }])
check('allegato: bloccato', findDeleteBlockers([A, B], [], ['b']), [{ id: 'b', title: 'verbale', installations: 0, attachments: 1 }])
check('righe contate per documento', findDeleteBlockers([A], ['a', 'a'], ['a', 'a', 'a']), [{ id: 'a', title: 'dico_termico', installations: 2, attachments: 3 }])
check('ordine di ingresso, i liberi esclusi',
  findDeleteBlockers([C, B, A], ['a'], ['c']).map(b => b.id), ['c', 'a'])
check('riferimento a un documento non richiesto: ignorato', findDeleteBlockers([A], ['z'], ['z']), [])

console.log('\nMotivi e messaggi')
check('motivo: una installazione', deleteBlockerReason({ installations: 1, attachments: 0 }), 'è la fonte di 1 installazione fornitore')
check('motivo: più installazioni', deleteBlockerReason({ installations: 2, attachments: 0 }), 'è la fonte di 2 installazioni fornitore')
check('motivo: un allegato', deleteBlockerReason({ installations: 0, attachments: 1 }), 'ha 1 allegato collegato')
check('motivo: più allegati', deleteBlockerReason({ installations: 0, attachments: 3 }), 'ha 3 allegati collegati')
check('motivo: entrambi', deleteBlockerReason({ installations: 1, attachments: 2 }), 'è la fonte di 1 installazione fornitore e ha 2 allegati collegati')

const blA = { id: 'a', title: 'dico_termico', installations: 1, attachments: 0 }
const blB = { id: 'b', title: 'verbale', installations: 0, attachments: 2 }
check('messaggio singolo', deleteBlockedMessage([blA], 1), 'Documento non eliminato: «Dico termico» è la fonte di 1 installazione fornitore.')
check('multiplo con un solo bloccato: dice che non si elimina niente', deleteBlockedMessage([blA], 3), 'Nessun documento eliminato: «Dico termico» è la fonte di 1 installazione fornitore.')
const many = Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, title: `Doc${i}`, installations: 1, attachments: 0 }))
for (const b of many) {
  check(`il messaggio elenca tutti i bloccati, senza tagliare (${b.title})`, deleteBlockedMessage(many, 5).includes(`«${b.title}»`), true)
}

console.log('\nPayload (contratto 053)')
const SNAP = {
  id: 'doc-1', title: 'dico', file_name: 'dico.pdf', doc_type: 'dico', sistema: null, category: 'tecnici',
  unit_id: null, file_date: '2026-11-06', classification_status: 'completata',
  storage_path: 'res/proprieta/1_dico.pdf', uploaded_by: 'user-1', created_at: '2026-11-06T10:00:00+00:00',
}
const deletedPayload = documentDeletedPayload(SNAP)
check('chiavi di documento_eliminato', Object.keys(deletedPayload), [
  'document_id', 'title', 'file_name', 'doc_type', 'sistema', 'category', 'unit_id', 'file_date',
  'classification_status', 'storage_path', 'uploaded_by', 'document_created_at',
])
check('storage_path nello snapshot', deletedPayload.storage_path, 'res/proprieta/1_dico.pdf')
check('document_id nello snapshot', deletedPayload.document_id, 'doc-1')
check('data di creazione del documento', deletedPayload.document_created_at, '2026-11-06T10:00:00+00:00')
check('payload piatto, nessun oggetto annidato',
  Object.values(deletedPayload).every(v => v === null || typeof v !== 'object'), true)
const SNAP_KEYS = DOCUMENT_SNAPSHOT_COLUMNS.split(',').map(s => s.trim())
check('le colonne lette coprono lo snapshot', [...SNAP_KEYS].sort(), Object.keys(SNAP).sort())
check('chiavi di documento_file_non_rimosso',
  documentFileNotRemovedPayload(SNAP, 'errore_storage'),
  { document_id: 'doc-1', title: 'dico', storage_path: 'res/proprieta/1_dico.pdf', reason: 'errore_storage' })

console.log('\nFrasi del registro')
check('eliminato con titolo', documentDeletedText({ title: 'dico' }), 'Documento «dico» eliminato')
check('eliminato senza titolo: ripiego', documentDeletedText({}), null)
check('eliminato con titolo non stringa: ripiego', documentDeletedText({ title: 7 }), null)
check('file non rimosso con titolo', documentFileNotRemovedText({ title: 'dico' }), 'File del documento eliminato «dico» non rimosso dall’archivio')
check('file non rimosso senza titolo: ripiego', documentFileNotRemovedText({}), null)

console.log('\nEsito della rimozione dei file')
const toEntries = m => [...m.entries()]
check('tutti rimossi', toEntries(fileRemovalFailures(['p1', 'p2'], ['p1', 'p2'])), [])
check('chiamata fallita: tutti errore_storage', toEntries(fileRemovalFailures(['p1', 'p2'], null)), [['p1', 'errore_storage'], ['p2', 'errore_storage']])
check('lista vuota senza errore: tutti non rimossi', toEntries(fileRemovalFailures(['p1', 'p2'], [])), [['p1', 'file_non_rimosso'], ['p2', 'file_non_rimosso']])
check('lista parziale: solo il mancante', toEntries(fileRemovalFailures(['p1', 'p2'], ['p2'])), [['p1', 'file_non_rimosso']])
check('nessun file richiesto: nessun fallimento', toEntries(fileRemovalFailures([], [])), [])

console.log('\nRiepilogo')
const base = { deleted: 0, notDeleted: [], notLogged: [], filesLeft: [] }
check('uno eliminato', summarizeDocumentDelete({ ...base, deleted: 1 }),
  { kind: 'success', message: '1 documento eliminato.', persistent: false })
check('più eliminati', summarizeDocumentDelete({ ...base, deleted: 3 }),
  { kind: 'success', message: '3 documenti eliminati.', persistent: false })
check('file rimasto: avviso persistente col nome', summarizeDocumentDelete({ ...base, deleted: 2, filesLeft: ['dico_termico'] }),
  { kind: 'warning', message: '2 documenti eliminati. Il file di Dico termico è rimasto nell’archivio, segnalalo all’assistenza.', persistent: true })
check('evento non registrato: avviso persistente', summarizeDocumentDelete({ ...base, deleted: 1, notLogged: ['verbale'] }),
  { kind: 'warning', message: '1 documento eliminato. Eliminazione non registrata per Verbale: il file resta nell’archivio, segnalalo all’assistenza.', persistent: true })
check('zero righe toccate: errore persistente', summarizeDocumentDelete({ ...base, notDeleted: ['verbale'] }),
  { kind: 'error', message: 'Nessun documento eliminato. Non eliminati perché non più accessibili: Verbale.', persistent: true })
check('parziale: avviso persistente', summarizeDocumentDelete({ ...base, deleted: 1, notDeleted: ['verbale'] }).kind, 'warning')

console.log(`\n${passed} casi ok, ${failed} falliti.`)
process.exit(failed === 0 ? 0 : 1)
