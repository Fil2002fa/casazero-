// ============================================================
// CasaZero — verifica del vocabolario dei sistemi.
// Uso:  node --experimental-strip-types scripts/verify-sistemi.mjs
//       (oppure: npm run verify:sistemi)
// ------------------------------------------------------------
// COSA GARANTISCE: che SISTEMI (src/lib/document-classification.ts) e i
// valori ammessi dal CHECK su supplier_installations.sistema
// (039_suppliers_anagrafica_costruttore.sql) siano lo STESSO insieme, in
// entrambe le direzioni.
//
// PERCHE' ESISTE: SISTEMI è dichiaratamente la fonte unica del vocabolario
// (commento in document-classification.ts, sopra la dichiarazione del tipo
// Sistema) — sia per l'enum che il classificatore AI accetta in output
// (route.ts:41) sia per il CHECK della 039. Le due fonti non hanno alcun
// legame a runtime: una è TypeScript compilato lato applicazione, l'altra è
// un vincolo SQL applicato a mano nel SQL Editor. Un valore aggiunto da un
// lato e dimenticato dall'altro non produce un errore visibile: produce un
// disallineamento silenzioso — o il classificatore propone un sistema che il
// DB rifiuterebbe se mai arrivasse a un INSERT su supplier_installations, o
// il DB accetta un valore che nessuna UI potrà mai proporre. Stessa bug
// class del debito descritto in verify-residence-features.mjs.
//
// DIFFERENZA DI METODO rispetto a verify-residence-features.mjs (e perché):
// quello script confronta la costante con DATI live in una tabella,
// raggiungibile in lettura via PostgREST con la service role key. Il CHECK
// di un vincolo di tabella non è dato applicativo: PostgREST espone le
// tabelle dello schema `public`, non `pg_catalog`/`information_schema`, e
// questo progetto non ha un client Postgres diretto né un RPC di sola
// lettura su pg_constraint (verificato: nessun `pg` in package.json, nessun
// RPC exec_sql nelle migrazioni). Leggere il CHECK a runtime da questo
// script non è quindi possibile con i mezzi disponibili in questo repo.
// Il sostituto è leggere il testo della migrazione che lo dichiara: è la
// fonte scritta più vicina al vincolo reale che sia raggiungibile da un
// semplice script Node, e vive versionata nello stesso commit del tipo TS.
//
// LIMITE DICHIARATO (CLAUDE.md, Metodo di lavoro §8): questo script prova
// l'allineamento tra SISTEMI e il TESTO della 039, non lo stato live del
// vincolo sul database contro cui gira l'app in un dato momento. Se in
// futuro una nuova migrazione ALTER TABLE ... DROP/ADD CONSTRAINT ridefinisce
// il CHECK, questo script continuerà a leggere la 039 e diventerà cieco
// alla ridefinizione: chi scrive quella migrazione deve spostare qui sotto
// MIGRATION_SOURCE sul nuovo file. Non è un problema che uno script possa
// risolvere da solo senza accesso a pg_catalog.
//
// PERCHE' ESCE NON-ZERO: exit 0 = i due insiemi coincidono; exit 1 =
// divergono, con l'elenco delle differenze nelle due direzioni; exit 2 = la
// verifica non ha potuto girare (file non trovato, CHECK non trovato nel
// testo, import fallito) — mai confuso con un esito positivo.
//
// LE CHIAVI SI LEGGONO DAL MODULO REALE, importandolo: mai una copia
// incollata qui dentro. L'import ha bisogno del type stripping di Node
// (>= 22.6 col flag, >= 23.6 di default) perché il sorgente è TypeScript.
// ============================================================
import { readFileSync } from 'node:fs'

const SOURCE = new URL('../src/lib/document-classification.ts', import.meta.url)
const MIGRATION_SOURCE = new URL('../supabase/migrations/039_suppliers_anagrafica_costruttore.sql', import.meta.url)

function fail(message) {
  console.error(`\n✗ ${message}`)
  process.exit(2)
}

let SISTEMI
try {
  ;({ SISTEMI } = await import(SOURCE.href))
} catch (err) {
  fail(
    `Impossibile importare ${SOURCE.pathname}: ${err.message}\n` +
    '  Rilancia con:  node --experimental-strip-types scripts/verify-sistemi.mjs\n' +
    '  (serve Node >= 22.6; da Node 23.6 il flag non è più necessario)'
  )
}

let migrationText
try {
  migrationText = readFileSync(MIGRATION_SOURCE, 'utf8')
} catch (err) {
  fail(`Impossibile leggere ${MIGRATION_SOURCE.pathname}: ${err.message}`)
}

// Isola il blocco "CHECK (sistema IN ( ... ))" della colonna sistema di
// supplier_installations. Non basarsi su un altro CHECK IN dello stesso file
// (es. quello su `source`): il match è ancorato al nome di colonna esatto.
const checkMatch = migrationText.match(/\bsistema\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*sistema\s+IN\s*\(([\s\S]*?)\)\s*\)/)
if (!checkMatch) {
  fail(
    `Nessun CHECK (sistema IN (...)) trovato in ${MIGRATION_SOURCE.pathname}.\n` +
    '  Il pattern atteso è cambiato, o il vincolo è stato spostato altrove:\n' +
    '  aggiornare la regex o MIGRATION_SOURCE in questo script.'
  )
}

const dbValues = [...checkMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1])
if (dbValues.length === 0) {
  fail('Il blocco CHECK trovato non contiene nessun valore tra apici: pattern di estrazione da rivedere.')
}

const constValues = SISTEMI
const mancanti = dbValues.filter(v => !constValues.includes(v)).sort()
const orfane = constValues.filter(v => !dbValues.includes(v)).sort()
const duplicateConst = constValues.filter((v, i) => constValues.indexOf(v) !== i).sort()
const duplicateDb = dbValues.filter((v, i) => dbValues.indexOf(v) !== i).sort()

console.log(`valori nel CHECK della 039       : ${dbValues.length}`)
console.log(`valori nella costante SISTEMI     : ${constValues.length}`)
console.log(`duplicati nel CHECK               : ${duplicateDb.length ? duplicateDb.join(', ') : '(nessuno)'}`)
console.log(`duplicati nella costante          : ${duplicateConst.length ? duplicateConst.join(', ') : '(nessuno)'}`)
console.log(`MANCANTI  (nel CHECK, non in SISTEMI)    : ${mancanti.length ? mancanti.join(', ') : '(nessuno)'}`)
console.log(`ORFANI    (in SISTEMI, non nel CHECK)    : ${orfane.length ? orfane.join(', ') : '(nessuno)'}`)

if (mancanti.length || orfane.length || duplicateConst.length || duplicateDb.length) {
  console.error('\n✗ DIVERGENZA fra la costante TS e il CHECK della 039.')
  if (mancanti.length) {
    console.error(
      '  Valori che il DB accetterebbe ma che nessuna UI/AI può mai proporre:\n' +
      '  aggiungerli a SISTEMI in src/lib/document-classification.ts.'
    )
  }
  if (orfane.length) {
    console.error(
      '  Valori che la costante ammette ma che il DB rifiuterebbe con una\n' +
      '  violazione di CHECK se mai raggiungessero un INSERT su\n' +
      '  supplier_installations: aggiungerli al CHECK (richiede una nuova\n' +
      '  migrazione, il CHECK esistente non è alterabile senza DROP/ADD).'
    )
  }
  if (duplicateConst.length || duplicateDb.length) {
    console.error('  Valori ripetuti in una delle due fonti: correggere il duplicato.')
  }
  process.exit(1)
}

console.log('\n✓ Costante e CHECK coincidono esattamente, in entrambe le direzioni.')
console.log('  (Verifica sul testo della 039, non sul vincolo live — vedi commento in testa allo script.)')
process.exit(0)
