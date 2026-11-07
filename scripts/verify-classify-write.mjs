// ============================================================
// CasaZero — verifica della gestione degli errori di /api/classify-document.
// Uso:  node --experimental-strip-types --no-warnings scripts/verify-classify-write.mjs
//       (oppure: npm run verify:classifywrite)
// ------------------------------------------------------------
// COSA GARANTISCE, con un client Supabase finto che forza gli errori:
//  - ogni update su `documents` il cui esito condiziona la risposta controlla
//    `error`: lancia ClassificationWriteError e logga;
//  - un guasto tecnico (getUser, profilo, documento, residenza, conteggio
//    assegnazioni, storage, scrittura) dà 500 "Errore tecnico, riprova" e mai
//    401/403/404 ("sessione scaduta", "non accessibile"); i veri esiti di
//    dominio restano 401/403/404;
//  - guasto di scrittura o di storage: risposta 500 e rollback a
//    'non_classificato', mai 'fallita'; servizio AI giù: 503 e
//    'non_classificato'; errore sul documento: 502 e 'fallita';
//  - un rollback che fallisce a sua volta è loggato e non cambia la risposta;
//  - il messaggio dell'errore di documento è loggato con il documentId;
//  - senza errori, tutto passa invariato.
//
// COSA NON GARANTISCE: il wiring con il vero client Supabase e con Next
// (la route non si esegue fuori da Next). L'ultimo blocco controlla solo che
// il sorgente della route non contenga più update diretti non controllati.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente; exit 2 = import fallito — mai confuso con un esito positivo.
// ============================================================

import { register } from 'node:module'
import { readFileSync } from 'node:fs'
register('./ts-resolve-hooks.mjs', import.meta.url)

let mod, access, batch, auth
try {
  mod = await import(new URL('../src/lib/classification-write.ts', import.meta.url).href)
  access = await import(new URL('../src/lib/document-access.ts', import.meta.url).href)
  batch = await import(new URL('../src/lib/batch-failures.ts', import.meta.url).href)
  auth = await import('@supabase/supabase-js')
} catch (err) {
  console.error(
    `\n✗ Impossibile importare i moduli: ${err.message}\n` +
    '  Rilancia con:  node --experimental-strip-types scripts/verify-classify-write.mjs\n' +
    '  (serve Node >= 22.6; da Node 23.6 il flag non è più necessario)'
  )
  process.exit(2)
}

const {
  ClassificationWriteError, ClassificationStorageError, sessionOutcome, writeDocumentState,
  downloadDocumentBuffer, handleClassificationFailure,
} = mod
const { authorizeDocumentActor } = access
const { classifyBatchFailure } = batch

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

// console.error catturato: i log attesi non sporcano l'output e si possono asserire.
const logs = []
const realError = console.error
console.error = (...args) => { logs.push(args.map(String).join(' ')) }
function takeLogs() { return logs.splice(0, logs.length) }

const FORCED = { message: 'forzato', code: 'XX000' }

// Client finto. `reads[tabella]` = { data, error, count } per select; `updates`
// = funzione (indice) → { error } per gli update. `calls` registra gli update.
function fakeAdmin({ reads = {}, updates = () => ({ error: null }), downloadResult } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      let result = reads[table] ?? { data: null, error: null }
      const c = {
        select: () => c,
        eq: () => c,
        update: (values) => {
          const r = updates(calls.length)
          calls.push({ table, values })
          result = r
          return c
        },
        maybeSingle: () => Promise.resolve(result),
        then: (res, rej) => Promise.resolve(result).then(res, rej),
      }
      return c
    },
    storage: {
      from: () => ({
        download: () => Promise.resolve(downloadResult ?? { data: new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])]), error: null }),
      }),
    },
  }
}

const lastStatus = (admin) => admin.calls.at(-1)?.values?.classification_status

// --- sessione (A) ---------------------------------------------------------------
check('utente presente → ok', sessionOutcome({ user: { id: 'u1' }, error: null }), { kind: 'ok', userId: 'u1' })
check('nessun utente e nessun errore → non autenticato', sessionOutcome({ user: null, error: null }), { kind: 'unauthenticated' })
check('sessione assente (AuthSessionMissingError) → non autenticato',
  sessionOutcome({ user: null, error: new auth.AuthSessionMissingError() }).kind, 'unauthenticated')
check('token non valido (AuthApiError 401) → non autenticato',
  sessionOutcome({ user: null, error: new auth.AuthApiError('invalid jwt', 401, 'bad_jwt') }).kind, 'unauthenticated')
check('servizio di autenticazione giù (AuthRetryableFetchError) → tecnico',
  sessionOutcome({ user: null, error: new auth.AuthRetryableFetchError('fetch failed', 0) }).kind, 'technical')

// --- autorizzazione (B-E) -------------------------------------------------------
const PROFILE_SA = { data: { role: 'super_admin', builder_id: 'b1' }, error: null }
const PROFILE_AD = { data: { role: 'admin', builder_id: 'b1' }, error: null }
const DOC = { data: { id: 'd1', title: 't', storage_path: 'p', residence_id: 'r1', unit_id: null, doc_type: null, classification_status: 'non_classificato' }, error: null }
const RES_OK = { data: { id: 'r1' }, error: null }
const ASSIGN_OK = { data: null, error: null, count: 1 }

async function authz(reads) {
  const admin = fakeAdmin({ reads })
  const r = await authorizeDocumentActor(admin, 'u1', 'd1', '[classify-document]')
  takeLogs()
  return r.ok ? { ok: true, role: r.role } : { status: r.status, error: r.error }
}

const TECH = { status: 500, error: 'Errore tecnico, riprova' }
check('B guasto su profiles → 500, non 403', await authz({ profiles: { data: null, error: FORCED } }), TECH)
check('C guasto su documents → 500, non 404', await authz({ profiles: PROFILE_SA, documents: { data: null, error: FORCED } }), TECH)
check('D guasto su residences → 500, non 404', await authz({ profiles: PROFILE_SA, documents: DOC, residences: { data: null, error: FORCED } }), TECH)
check('E guasto su admin_assignments → 500, non 404', await authz({ profiles: PROFILE_AD, documents: DOC, admin_assignments: { data: null, error: FORCED, count: null } }), TECH)
check('dominio: profilo assente → 403', await authz({ profiles: { data: null, error: null } }), { status: 403, error: 'Permessi insufficienti' })
check('dominio: ruolo residente → 403', await authz({ profiles: { data: { role: 'residente', builder_id: 'b1' }, error: null } }), { status: 403, error: 'Permessi insufficienti' })
check('dominio: documento inesistente → 404', await authz({ profiles: PROFILE_SA, documents: { data: null, error: null } }), { status: 404, error: 'Documento non trovato' })
check('dominio: residenza di un altro builder → 404', await authz({ profiles: PROFILE_SA, documents: DOC, residences: { data: null, error: null } }), { status: 404, error: 'Documento non trovato' })
check('dominio: admin non assegnato → 404', await authz({ profiles: PROFILE_AD, documents: DOC, admin_assignments: { data: null, error: null, count: 0 } }), { status: 404, error: 'Documento non trovato' })
check('senza errori: super_admin → ok', await authz({ profiles: PROFILE_SA, documents: DOC, residences: RES_OK }), { ok: true, role: 'super_admin' })
check('senza errori: admin → ok', await authz({ profiles: PROFILE_AD, documents: DOC, admin_assignments: ASSIGN_OK }), { ok: true, role: 'admin' })

// --- scrittura (F, G, H) --------------------------------------------------------
{
  const admin = fakeAdmin({ updates: () => ({ error: FORCED }) })
  let thrown = null
  try { await writeDocumentState(admin, 'd1', { classification_status: 'in_corso' }, 'in_corso') } catch (e) { thrown = e }
  check('update con errore → lancia ClassificationWriteError', thrown instanceof ClassificationWriteError, true)
  check('il messaggio dell\'errore è quello del DB', thrown?.message, 'forzato')
  const l = takeLogs()
  check('update con errore → loggato con passo e documentId', l.length === 1 && l[0].includes('in_corso') && l[0].includes('documentId=d1') && l[0].includes('forzato'), true)
}
{
  const admin = fakeAdmin()
  let thrown = null
  try { await writeDocumentState(admin, 'd1', { classification_status: 'completata' }, 'classificazione finale') } catch (e) { thrown = e }
  check('update senza errore → nessuna eccezione', thrown, null)
  check('update senza errore → valori scritti invariati', admin.calls, [{ table: 'documents', values: { classification_status: 'completata' } }])
  check('update senza errore → nessun log', takeLogs(), [])
}

// --- esiti degli errori nel try (G, H, I, J, K, N) ------------------------------
async function failure(err, serviceUnavailable, updates) {
  const admin = fakeAdmin({ updates })
  const r = await handleClassificationFailure(admin, 'd1', err, serviceUnavailable)
  return { r, admin, l: takeLogs() }
}

{
  const { r, admin, l } = await failure(new ClassificationWriteError('forzato'), false)
  check('H scrittura fallita → 500 write_error', r, { status: 500, body: { error: 'Errore tecnico nel salvataggio, riprova', cause: 'write_error' } })
  check('H scrittura fallita → rollback a non_classificato, mai fallita', lastStatus(admin), 'non_classificato')
  check('H il client la conta come errore di salvataggio', classifyBatchFailure({ status: r.status, cause: r.body.cause }), 'errore_salvataggio')
}
{
  const { r, admin, l } = await failure(new ClassificationWriteError('forzato'), false, () => ({ error: FORCED }))
  check('H con anche il rollback fallito → stessa risposta', r.body.cause, 'write_error')
  check('H con anche il rollback fallito → il rollback è loggato', l.length === 1 && l[0].includes('rollback'), true)
}
{
  // N: dallo storage vero e proprio (download in errore), non da un errore costruito a mano.
  const admin = fakeAdmin({ downloadResult: { data: null, error: { message: 'storage giù' } } })
  let thrown = null
  try { await downloadDocumentBuffer(admin, 'p') } catch (e) { thrown = e }
  check('N download in errore → ClassificationStorageError', thrown instanceof ClassificationStorageError, true)
  const r = await handleClassificationFailure(admin, 'd1', thrown, false)
  const l = takeLogs()
  check('N guasto storage → 500 Errore tecnico, non 502', { status: r.status, error: r.body.error }, { status: 500, error: 'Errore tecnico, riprova' })
  check('N guasto storage → rollback a non_classificato, mai fallita', lastStatus(admin), 'non_classificato')
  check('N guasto storage → console.error con documentId', l.some(x => x.includes('documentId=d1') && x.includes('storage giù')), true)
  check('N il client lo conta come errore del server, non del documento', classifyBatchFailure({ status: r.status, cause: r.body.cause }), 'errore_server')
}
{
  const admin = fakeAdmin({ downloadResult: { data: null, error: null } })
  let thrown = null
  try { await downloadDocumentBuffer(admin, 'p') } catch (e) { thrown = e }
  check('N blob assente senza errore → ClassificationStorageError', thrown instanceof ClassificationStorageError, true)
}
{
  const admin = fakeAdmin()
  const buf = await downloadDocumentBuffer(admin, 'p')
  check('download senza errore → buffer del file', buf.byteLength, 4)
}
{
  const { r, admin } = await failure(new Error('Servizio giù'), true)
  check('servizio AI giù → 503 service_unavailable', r, { status: 503, body: { error: 'Servizio giù', cause: 'service_unavailable' } })
  check('servizio AI giù → rollback a non_classificato', lastStatus(admin), 'non_classificato')
}
{
  const { r, l } = await failure(new Error('Servizio giù'), true, () => ({ error: FORCED }))
  check('I rollback fallito (servizio giù) → il 503 resta', r.status, 503)
  check('I rollback fallito (servizio giù) → loggato', l.some(x => x.includes('rollback') && x.includes('documentId=d1')), true)
}
{
  const { r, admin, l } = await failure(new Error('Risposta AI non conforme allo schema atteso'), false)
  check('errore sul documento → 502 document_error', r, { status: 502, body: { error: 'Risposta AI non conforme allo schema atteso', cause: 'document_error' } })
  check('errore sul documento → fallita', lastStatus(admin), 'fallita')
  check('K errore sul documento → console.error con messaggio e documentId', l.length === 1 && l[0].includes('documentId=d1') && l[0].includes('non conforme'), true)
}
{
  const { r, l } = await failure(new Error('Risposta AI non conforme'), false, () => ({ error: FORCED }))
  check('J scrittura fallita non riuscita → il 502 resta', r.status, 502)
  check('J scrittura fallita non riuscita → loggata', l.some(x => x.includes('stato fallita')), true)
}

// --- sorgente della route --------------------------------------------------------
{
  const src = readFileSync(new URL('../src/app/api/classify-document/route.ts', import.meta.url), 'utf8')
  check('la route non ha più update diretti su documents', /\.update\(/.test(src), false)
  check('la route legge error di getUser', /error:\s*userError/.test(src), true)
  check('la route usa authorizeDocumentActor', src.includes('authorizeDocumentActor('), true)
  check('expected_doc_type è validato dopo l\'autorizzazione',
    src.indexOf('authorizeDocumentActor(admin') < src.indexOf('parseExpectedDocType(body'), true)
}

// --- esito -------------------------------------------------------------------
console.error = realError
if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
process.exit(0)
