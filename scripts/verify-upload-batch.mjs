// ============================================================
// CasaZero — verifica delle regole del caricamento multiplo (E1b-11).
// Uso:  node --experimental-strip-types scripts/verify-upload-batch.mjs
//       (oppure: npm run verify:uploadbatch)
// ------------------------------------------------------------
// COSA GARANTISCE: che src/lib/document-upload-batch.ts decida come dichiarato
// il tetto sulla selezione, i file non caricabili, lo stato di ogni file lungo
// caricamento → classificazione → estrazione, cosa si riprova e il messaggio
// unico a fine caricamento.
//
// PERCHE' ESISTE: il componente client non si esegue fuori da Next, e queste
// regole decidono cosa l'utente vede e cosa si riprova (un file riprovato nel
// posto sbagliato diventa una seconda versione dello stesso documento).
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente; exit 2 = import fallito — mai confuso con un esito positivo.
// ============================================================

import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

const MOD = new URL('../src/lib/document-upload-batch.ts', import.meta.url)

let mod
try {
  mod = await import(MOD.href)
} catch (err) {
  console.error(
    `\n✗ Impossibile importare il modulo: ${err.message}\n` +
    '  Rilancia con:  node --experimental-strip-types scripts/verify-upload-batch.mjs\n' +
    '  (serve Node >= 22.6; da Node 23.6 il flag non è più necessario)'
  )
  process.exit(2)
}

const {
  MAX_UPLOAD_BATCH_FILES, REJECT_UNSUPPORTED_TYPE, REJECT_TOO_LARGE,
  fileRejectionReason, screenSelection,
  INITIAL_FILE_STATE, applyFileEvent, fileStatusLabel, isFileInFlight, uploadProgress,
  uploadRetryIds, summarizeUploadBatch,
} = mod

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

const MB = 1024 * 1024
const pdf = (name, size = 1 * MB) => ({ name, type: 'application/pdf', size })
const run = (...events) => events.reduce(applyFileEvent, INITIAL_FILE_STATE)

// --- costanti dichiarate -----------------------------------------------------
check('tetto di 20 file per gesto', MAX_UPLOAD_BATCH_FILES, 20)
check('motivo tipo non supportato', REJECT_UNSUPPORTED_TYPE, 'Tipo file non supportato (PDF, immagini, Word)')
check('motivo file troppo grande (50 MB)', REJECT_TOO_LARGE, 'File troppo grande (max 50 MB)')

// --- un file: caricabile o no ------------------------------------------------
check('pdf piccolo: caricabile', fileRejectionReason(pdf('a.pdf')), null)
check('tutti i tipi ammessi',
  ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    .map(type => fileRejectionReason({ type, size: 1 })),
  [null, null, null, null, null, null])
check('txt: tipo non supportato', fileRejectionReason({ type: 'text/plain', size: 10 }), REJECT_UNSUPPORTED_TYPE)
check('tipo vuoto: non supportato', fileRejectionReason({ type: '', size: 10 }), REJECT_UNSUPPORTED_TYPE)
check('esattamente 50 MB: caricabile', fileRejectionReason({ type: 'application/pdf', size: 50 * MB }), null)
check('50 MB + 1 byte: troppo grande', fileRejectionReason({ type: 'application/pdf', size: 50 * MB + 1 }), REJECT_TOO_LARGE)
check('tipo sbagliato e troppo grande: prima il tipo', fileRejectionReason({ type: 'text/plain', size: 60 * MB }), REJECT_UNSUPPORTED_TYPE)

// --- la selezione ------------------------------------------------------------
const nPdf = n => Array.from({ length: n }, (_, i) => pdf(`f${i + 1}.pdf`))

check('nessun file: lista vuota e nessun messaggio',
  screenSelection([]), { accepted: [], rejected: [], overLimit: false, message: null })
check('un file: entra, nessun messaggio',
  screenSelection([pdf('a.pdf')]), { accepted: [pdf('a.pdf')], rejected: [], overLimit: false, message: null })
check('20 file (al tetto): entrano tutti', screenSelection(nPdf(20)).accepted.length, 20)
check('20 file: nessun messaggio, non oltre il tetto',
  [screenSelection(nPdf(20)).overLimit, screenSelection(nPdf(20)).message], [false, null])
check('21 file: oltre il tetto', screenSelection(nPdf(21)).overLimit, true)
check('21 file: non entra nessun file', screenSelection(nPdf(21)).accepted, [])
check('21 file: messaggio con numeri e tetto',
  screenSelection(nPdf(21)).message,
  'Hai scelto 21 file: il massimo è 20 per volta. Scegline meno, poi ripeti con gli altri.')
check('il tetto si conta sui file scelti, anche non caricabili',
  screenSelection([...nPdf(20), { name: 'x.txt', type: 'text/plain', size: 1 }]).overLimit, true)
check('oltre il tetto non si elencano esclusi', screenSelection(nPdf(25)).rejected, [])
check('tetto passato da fuori (3): 4 file → oltre', screenSelection(nPdf(4), 3).overLimit, true)
check('tetto passato da fuori (3): 3 file → entrano', screenSelection(nPdf(3), 3).accepted.length, 3)

const txt = { name: 'note.txt', type: 'text/plain', size: 10 }
const big = { name: 'enorme.pdf', type: 'application/pdf', size: 51 * MB }
check('un file non caricabile tra due buoni: gli altri entrano, in ordine',
  screenSelection([pdf('a.pdf'), txt, pdf('b.pdf')]).accepted.map(f => f.name), ['a.pdf', 'b.pdf'])
check('un file non caricabile: finisce in rejected con motivo',
  screenSelection([pdf('a.pdf'), txt]).rejected, [{ name: 'note.txt', reason: REJECT_UNSUPPORTED_TYPE }])
check('un file escluso: messaggio al singolare con nome e motivo',
  screenSelection([pdf('a.pdf'), txt]).message,
  '1 file escluso: note.txt. Motivo: Tipo file non supportato (PDF, immagini, Word).')
check('due esclusi per lo stesso motivo: un solo motivo',
  screenSelection([txt, { ...txt, name: 'altro.zip' }]).message,
  '2 file esclusi: note.txt, altro.zip. Motivo: Tipo file non supportato (PDF, immagini, Word).')
check('due esclusi per motivi diversi: tutti e due i motivi',
  screenSelection([txt, big]).message,
  '2 file esclusi: note.txt, enorme.pdf. Motivo: Tipo file non supportato (PDF, immagini, Word); File troppo grande (max 50 MB).')
check('tutti non caricabili: lista vuota ma non oltre il tetto',
  [screenSelection([txt, big]).accepted, screenSelection([txt, big]).overLimit], [[], false])
check('molti esclusi: nomi accorciati con "e altri"',
  screenSelection(Array.from({ length: 5 }, (_, i) => ({ ...txt, name: `n${i + 1}.txt` }))).message,
  '5 file esclusi: n1.txt, n2.txt, n3.txt e altri 2. Motivo: Tipo file non supportato (PDF, immagini, Word).')
check('la selezione non muta i file ricevuti',
  (() => { const input = [pdf('a.pdf'), txt]; const copy = JSON.stringify(input); screenSelection(input); return JSON.stringify(input) === copy })(), true)
check('gli oggetti accettati sono quelli ricevuti (stessa identità)',
  (() => { const f = pdf('a.pdf'); return screenSelection([f]).accepted[0] === f })(), true)

// --- stato di un file: i percorsi completi -----------------------------------
check('stato iniziale: in coda', INITIAL_FILE_STATE, { phase: 'in_coda' })
check('percorso completo con estrazione',
  run({ type: 'upload_start' }, { type: 'upload_ok' }, { type: 'classify_start' },
    { type: 'classify_ok', extractable: true }, { type: 'extract_start' }, { type: 'extract_ok' }),
  { phase: 'completo' })
check('percorso completo senza estrazione (tipo non estraibile)',
  run({ type: 'upload_start' }, { type: 'upload_ok' }, { type: 'classify_start' }, { type: 'classify_ok', extractable: false }),
  { phase: 'completo' })
check('estrazione non più possibile: completo, non fallito',
  run({ type: 'upload_start' }, { type: 'upload_ok' }, { type: 'classify_start' },
    { type: 'classify_ok', extractable: true }, { type: 'extract_start' }, { type: 'extract_skip' }),
  { phase: 'completo' })
check('fasi intermedie in ordine',
  [
    run({ type: 'upload_start' }).phase,
    run({ type: 'upload_start' }, { type: 'upload_ok' }).phase,
    run({ type: 'upload_start' }, { type: 'upload_ok' }, { type: 'classify_start' }).phase,
    run({ type: 'upload_start' }, { type: 'upload_ok' }, { type: 'classify_start' }, { type: 'classify_ok', extractable: true }).phase,
    run({ type: 'upload_start' }, { type: 'upload_ok' }, { type: 'classify_start' }, { type: 'classify_ok', extractable: true }, { type: 'extract_start' }).phase,
  ],
  ['in_caricamento', 'caricato', 'in_classificazione', 'classificato', 'in_estrazione'])

// --- stato di un file: i fallimenti ------------------------------------------
check('fallimento del caricamento',
  run({ type: 'upload_start' }, { type: 'upload_fail', error: 'Errore upload: rete' }),
  { phase: 'fallito', failedAt: 'caricamento', error: 'Errore upload: rete' })
check('fallimento della classificazione',
  run({ type: 'upload_start' }, { type: 'upload_ok' }, { type: 'classify_start' }, { type: 'classify_fail', error: 'connessione non riuscita' }),
  { phase: 'fallito', failedAt: 'classificazione', error: 'connessione non riuscita' })
check('fallimento dell\'estrazione',
  run({ type: 'upload_start' }, { type: 'upload_ok' }, { type: 'classify_start' }, { type: 'classify_ok', extractable: true },
    { type: 'extract_start' }, { type: 'extract_fail', error: 'errore tecnico del server' }),
  { phase: 'fallito', failedAt: 'estrazione', error: 'errore tecnico del server' })
check('servizio giù: il file in classificazione fallisce in classificazione',
  run({ type: 'upload_start' }, { type: 'upload_ok' }, { type: 'classify_start' }, { type: 'stopped', error: 'Servizio non disponibile' }),
  { phase: 'fallito', failedAt: 'classificazione', error: 'Servizio non disponibile' })
check('servizio giù: il file ancora in attesa di classificazione fallisce in classificazione',
  run({ type: 'upload_start' }, { type: 'upload_ok' }, { type: 'stopped', error: 'Servizio non disponibile' }),
  { phase: 'fallito', failedAt: 'classificazione', error: 'Servizio non disponibile' })
check('servizio giù: il file in attesa di estrazione fallisce in estrazione',
  run({ type: 'upload_start' }, { type: 'upload_ok' }, { type: 'classify_start' }, { type: 'classify_ok', extractable: true },
    { type: 'stopped', error: 'Servizio non disponibile' }),
  { phase: 'fallito', failedAt: 'estrazione', error: 'Servizio non disponibile' })
check('servizio giù: il file in estrazione fallisce in estrazione',
  run({ type: 'upload_start' }, { type: 'upload_ok' }, { type: 'classify_start' }, { type: 'classify_ok', extractable: true },
    { type: 'extract_start' }, { type: 'stopped', error: 'Servizio non disponibile' }),
  { phase: 'fallito', failedAt: 'estrazione', error: 'Servizio non disponibile' })

// --- stato di un file: eventi fuori sequenza e stati finali ------------------
const stato = (...events) => run(...events)
const inCaricamento = stato({ type: 'upload_start' })
const caricato = stato({ type: 'upload_start' }, { type: 'upload_ok' })
const fatto = stato({ type: 'upload_start' }, { type: 'upload_ok' }, { type: 'classify_start' }, { type: 'classify_ok', extractable: false })
const caduto = stato({ type: 'upload_start' }, { type: 'upload_fail', error: 'x' })

check('in coda: la classificazione non parte senza caricamento',
  applyFileEvent(INITIAL_FILE_STATE, { type: 'classify_start' }), INITIAL_FILE_STATE)
check('in coda: "caricato" non si salta',
  applyFileEvent(INITIAL_FILE_STATE, { type: 'upload_ok' }), INITIAL_FILE_STATE)
check('in coda: "stopped" non lo tocca',
  applyFileEvent(INITIAL_FILE_STATE, { type: 'stopped', error: 'x' }), INITIAL_FILE_STATE)
check('in caricamento: non si classifica prima di aver caricato',
  applyFileEvent(inCaricamento, { type: 'classify_start' }), inCaricamento)
check('in caricamento: "stopped" non lo tocca (il servizio AI non c\'entra)',
  applyFileEvent(inCaricamento, { type: 'stopped', error: 'x' }), inCaricamento)
check('caricato: l\'estrazione non salta la classificazione',
  applyFileEvent(caricato, { type: 'extract_start' }), caricato)
check('caricato: un esito di classificazione senza partenza non vale',
  applyFileEvent(caricato, { type: 'classify_ok', extractable: false }), caricato)
check('completo è finale: nessun evento lo cambia',
  [
    applyFileEvent(fatto, { type: 'upload_fail', error: 'x' }),
    applyFileEvent(fatto, { type: 'classify_fail', error: 'x' }),
    applyFileEvent(fatto, { type: 'stopped', error: 'x' }),
    applyFileEvent(fatto, { type: 'upload_start' }),
  ],
  [fatto, fatto, fatto, fatto])
check('fallito è finale: nessun evento lo cambia',
  [
    applyFileEvent(caduto, { type: 'upload_start' }),
    applyFileEvent(caduto, { type: 'upload_ok' }),
    applyFileEvent(caduto, { type: 'classify_start' }),
    applyFileEvent(caduto, { type: 'stopped', error: 'y' }),
  ],
  [caduto, caduto, caduto, caduto])
check('evento fuori sequenza: restituisce lo stesso oggetto',
  applyFileEvent(caricato, { type: 'extract_start' }) === caricato, true)
check('lo stato ricevuto non viene mutato',
  (() => { const s = { phase: 'in_caricamento' }; applyFileEvent(s, { type: 'upload_ok' }); return s.phase })(), 'in_caricamento')

// --- etichette e in volo -----------------------------------------------------
check('etichette di ogni fase',
  [
    fileStatusLabel({ phase: 'in_coda' }),
    fileStatusLabel({ phase: 'in_caricamento' }),
    fileStatusLabel({ phase: 'caricato' }),
    fileStatusLabel({ phase: 'in_classificazione' }),
    fileStatusLabel({ phase: 'classificato' }),
    fileStatusLabel({ phase: 'in_estrazione' }),
    fileStatusLabel({ phase: 'completo' }),
  ],
  ['In coda', 'Caricamento…', 'Caricato, in attesa di classificazione', 'Classificazione…',
    'Classificato, in attesa dei dati', 'Estrazione dei dati…', 'Fatto'])
check('etichette dei fallimenti, una per fase',
  [
    fileStatusLabel({ phase: 'fallito', failedAt: 'caricamento' }),
    fileStatusLabel({ phase: 'fallito', failedAt: 'classificazione' }),
    fileStatusLabel({ phase: 'fallito', failedAt: 'estrazione' }),
  ],
  ['Non caricato', 'Non classificato', 'Dati non estratti'])
check('in volo: tutte le fasi non finali',
  ['in_coda', 'in_caricamento', 'caricato', 'in_classificazione', 'classificato', 'in_estrazione']
    .map(phase => isFileInFlight({ phase })),
  [true, true, true, true, true, true])
check('in volo: completo e fallito no',
  [isFileInFlight({ phase: 'completo' }), isFileInFlight({ phase: 'fallito', failedAt: 'caricamento' })], [false, false])

// --- avanzamento del caricamento ---------------------------------------------
check('avanzamento: nessuno è partito',
  uploadProgress([{ phase: 'in_coda' }, { phase: 'in_coda' }]), { done: 0, total: 2 })
check('avanzamento: in caricamento non conta',
  uploadProgress([{ phase: 'in_caricamento' }, { phase: 'in_coda' }]), { done: 0, total: 2 })
check('avanzamento: conta caricati, fasi successive e falliti del caricamento',
  uploadProgress([
    { phase: 'caricato' }, { phase: 'completo' }, { phase: 'in_classificazione' },
    { phase: 'fallito', failedAt: 'caricamento' }, { phase: 'in_caricamento' }, { phase: 'in_coda' },
  ]), { done: 4, total: 6 })
check('avanzamento: lista vuota', uploadProgress([]), { done: 0, total: 0 })

// --- cosa si riprova ---------------------------------------------------------
check('Riprova: solo i falliti del caricamento, nell\'ordine',
  uploadRetryIds([
    { id: 'a', state: { phase: 'fallito', failedAt: 'caricamento', error: 'x' } },
    { id: 'b', state: { phase: 'completo' } },
    { id: 'c', state: { phase: 'fallito', failedAt: 'classificazione', error: 'x' } },
    { id: 'd', state: { phase: 'fallito', failedAt: 'estrazione', error: 'x' } },
    { id: 'e', state: { phase: 'fallito', failedAt: 'caricamento', error: 'y' } },
    { id: 'f', state: { phase: 'caricato' } },
  ]), ['a', 'e'])
check('Riprova: nessun fallito del caricamento → lista vuota',
  uploadRetryIds([{ id: 'a', state: { phase: 'completo' } }, { id: 'b', state: { phase: 'fallito', failedAt: 'classificazione' } }]), [])
check('Riprova: lista vuota', uploadRetryIds([]), [])

// --- il messaggio unico a fine caricamento -----------------------------------
const ok = name => ({ name, state: { phase: 'caricato' } })
const ko = (name, error) => ({ name, state: { phase: 'fallito', failedAt: 'caricamento', error } })

check('nessun file: niente da riepilogare', summarizeUploadBatch([]), null)
check('caricamento ancora aperto (in coda): niente riepilogo',
  summarizeUploadBatch([ok('a.pdf'), { name: 'b.pdf', state: { phase: 'in_coda' } }]), null)
check('caricamento ancora aperto (in corso): niente riepilogo',
  summarizeUploadBatch([ok('a.pdf'), { name: 'b.pdf', state: { phase: 'in_caricamento' } }]), null)
check('un file caricato: singolare, non persistente',
  summarizeUploadBatch([ok('a.pdf')]), { kind: 'success', message: '1 documento caricato.', persistent: false })
check('tre file caricati: plurale, non persistente',
  summarizeUploadBatch([ok('a.pdf'), ok('b.pdf'), ok('c.pdf')]), { kind: 'success', message: '3 documenti caricati.', persistent: false })
check('file già avanti nella catena contano come caricati',
  summarizeUploadBatch([{ name: 'a.pdf', state: { phase: 'completo' } }, { name: 'b.pdf', state: { phase: 'in_classificazione' } }, ok('c.pdf')])?.message,
  '3 documenti caricati.')
check('un fallito del caricamento (con motivo): avviso persistente',
  summarizeUploadBatch([ok('a.pdf'), ok('b.pdf'), ko('c.pdf', 'Errore upload: rete')]),
  { kind: 'warning', message: '2 caricati, 1 fallito: c.pdf. Motivo: Errore upload: rete.', persistent: true })
check('più falliti con lo stesso motivo: un solo motivo',
  summarizeUploadBatch([ok('a.pdf'), ko('b.pdf', 'Errore upload: rete'), ko('c.pdf', 'Errore upload: rete')])?.message,
  '1 caricato, 2 falliti: b.pdf, c.pdf. Motivo: Errore upload: rete.')
check('falliti con motivi diversi: nessun motivo unico',
  summarizeUploadBatch([ok('a.pdf'), ko('b.pdf', 'Errore upload: rete'), ko('c.pdf', 'File non trovato in storage: upload non completato')])?.message,
  '1 caricato, 2 falliti: b.pdf, c.pdf.')
check('tutti falliti: errore persistente',
  summarizeUploadBatch([ko('a.pdf', 'Permessi insufficienti'), ko('b.pdf', 'Permessi insufficienti')]),
  { kind: 'error', message: 'Nessun documento caricato, 2 falliti: a.pdf, b.pdf. Motivo: Permessi insufficienti.', persistent: true })
check('un solo file e fallito: singolare',
  summarizeUploadBatch([ko('a.pdf', 'Permessi insufficienti')])?.message,
  'Nessun documento caricato, 1 fallito: a.pdf. Motivo: Permessi insufficienti.')
check('molti falliti: nomi accorciati con "e altri"',
  summarizeUploadBatch([ok('z.pdf'), ...['a', 'b', 'c', 'd', 'e'].map(n => ko(`${n}.pdf`, 'Errore upload: rete'))])?.message,
  '1 caricato, 5 falliti: a.pdf, b.pdf, c.pdf e altri 2. Motivo: Errore upload: rete.')
check('motivo che finisce già col punto: un punto solo',
  summarizeUploadBatch([ko('a.pdf', 'Sessione scaduta.')])?.message,
  'Nessun documento caricato, 1 fallito: a.pdf. Motivo: Sessione scaduta.')
check('fallimenti di classificazione ed estrazione non entrano nel riepilogo del caricamento',
  summarizeUploadBatch([
    ok('a.pdf'),
    { name: 'b.pdf', state: { phase: 'fallito', failedAt: 'classificazione', error: 'x' } },
    { name: 'c.pdf', state: { phase: 'fallito', failedAt: 'estrazione', error: 'y' } },
  ]),
  { kind: 'success', message: '3 documenti caricati.', persistent: false })
check('fallito senza testo di errore: motivo di riserva',
  summarizeUploadBatch([{ name: 'a.pdf', state: { phase: 'fallito', failedAt: 'caricamento' } }])?.message,
  'Nessun documento caricato, 1 fallito: a.pdf. Motivo: Errore sconosciuto.')

// --- esito -------------------------------------------------------------------
if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
process.exit(0)
