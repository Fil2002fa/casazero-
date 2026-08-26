// ============================================================
// CasaZero — verifica del vocabolario delle dotazioni.
// Uso:  node --experimental-strip-types scripts/verify-residence-features.mjs
//       (oppure: npm run verify:features)
// ------------------------------------------------------------
// COSA GARANTISCE: che le chiavi di src/lib/residence-features.ts e i
// condition_key presenti in maintenance_templates siano lo STESSO insieme,
// in entrambe le direzioni.
//
// PERCHE' ESISTE: residence_features.feature_key e
// maintenance_templates.condition_key sono legati PER VALORE, senza FK e
// senza CHECK (scelta deliberata della 030: aggiungere una dotazione deve
// essere una riga di catalogo e zero DDL). Non esiste quindi nessuna guardia
// lato database. Il rischio non e' un errore, e' un SILENZIO: una chiave
// sbagliata da un lato ('ascensre') scrive una riga perfettamente valida che
// non combacia con nessun template. La voce non entra nel piano, non viene
// sollevata nessuna eccezione, e il piano nasce incompleto senza che nulla
// lo segnali. E' il debito dichiarato in 034_rpc_creazione_condizionale.sql
// righe 393-409. Questo script E' la guardia mancante.
//
// PERCHE' ESCE NON-ZERO: per essere un gate, non un report. Un exit code !=0
// e' cio' che permette di incatenarlo a una pipeline CI o a un pre-commit e
// far FALLIRE il commit che introduce la divergenza, invece di stampare un
// avviso che nessuno legge. Exit 0 = i due insiemi coincidono; exit 1 =
// divergono, con l'elenco delle differenze nelle due direzioni; exit 2 = la
// verifica non ha potuto girare (credenziali mancanti, ambiente senza type
// stripping), che NON e' un esito positivo e non va mai confuso con uno.
//
// PERCHE' NON CONTROLLA I NUMERI 19 E 21: perche' devono poter cambiare.
// Aggiungere una dotazione (una riga di catalogo + una voce nella costante)
// e' esattamente il caso che il modello della 030 vuole rendere facile, e un
// atteso hard-coded lo trasformerebbe in un fallimento spurio. I conteggi
// sono stampati come informazione; l'unico invariante che fa fallire e' la
// coincidenza dei due insiemi, che si mantiene da sola nel tempo.
//
// LE CHIAVI SI LEGGONO DAL MODULO REALE, importandolo: mai una copia
// incollata qui dentro, che potrebbe divergere ed e' precisamente il typo
// silenzioso che questo script deve intercettare. L'import ha bisogno del
// type stripping di Node (>= 22.6 col flag, >= 23.6 di default) perche' il
// sorgente e' TypeScript.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const ENV_FILE = new URL('../.env.local', import.meta.url)
const SOURCE = new URL('../src/lib/residence-features.ts', import.meta.url)

function fail(message) {
  console.error(`\n✗ ${message}`)
  process.exit(2)
}

// Le variabili gia' nell'ambiente vincono su .env.local, cosi' una CI puo'
// iniettarle senza che il file esista.
function loadEnv() {
  let fromFile = {}
  try {
    fromFile = Object.fromEntries(
      readFileSync(ENV_FILE, 'utf8')
        .split('\n')
        .filter(line => line.includes('=') && !line.trimStart().startsWith('#'))
        .map(line => {
          const i = line.indexOf('=')
          return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
        })
    )
  } catch {
    // .env.local e' gitignorato: la sua assenza e' normale in CI.
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? fromFile.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY ?? fromFile.SUPABASE_SERVICE_ROLE_KEY,
  }
}

const { url, key } = loadEnv()
if (!url || !key) {
  fail(
    'Credenziali mancanti: servono NEXT_PUBLIC_SUPABASE_URL e ' +
    'SUPABASE_SERVICE_ROLE_KEY, nell\'ambiente o in .env.local.'
  )
}

// Import del modulo reale. Senza type stripping Node fallisce sulla sintassi
// TypeScript: intercettato qui per dare il rimedio invece di uno stack trace.
let RESIDENCE_FEATURES
try {
  ;({ RESIDENCE_FEATURES } = await import(SOURCE.href))
} catch (err) {
  fail(
    `Impossibile importare ${SOURCE.pathname}: ${err.message}\n` +
    '  Rilancia con:  node --experimental-strip-types scripts/verify-residence-features.mjs\n' +
    '  (serve Node >= 22.6; da Node 23.6 il flag non e\' piu\' necessario)'
  )
}

const constKeys = RESIDENCE_FEATURES.map(f => f.key)

const db = createClient(url, key)
const { data, error } = await db
  .from('maintenance_templates')
  .select('condition_key')
  .not('condition_key', 'is', null)

if (error) fail(`Query fallita: ${error.message}`)

const dbKeys = [...new Set(data.map(row => row.condition_key))]

const mancanti = dbKeys.filter(k => !constKeys.includes(k)).sort()
const orfane = constKeys.filter(k => !dbKeys.includes(k)).sort()
const duplicate = constKeys.filter((k, i) => constKeys.indexOf(k) !== i).sort()

console.log(`template condizionati a catalogo : ${data.length}`)
console.log(`condition_key distinti su DB     : ${dbKeys.length}`)
console.log(`chiavi nella costante            : ${constKeys.length}`)
console.log(`duplicate nella costante         : ${duplicate.length ? duplicate.join(', ') : '(nessuna)'}`)
console.log(`MANCANTI  (a catalogo, non nella costante): ${mancanti.length ? mancanti.join(', ') : '(nessuna)'}`)
console.log(`ORFANE    (nella costante, non a catalogo): ${orfane.length ? orfane.join(', ') : '(nessuna)'}`)

if (mancanti.length || orfane.length || duplicate.length) {
  console.error('\n✗ DIVERGENZA fra costante e catalogo.')
  if (mancanti.length) {
    console.error(
      '  Chiavi a catalogo che la costante non conosce: i loro template non\n' +
      '  potranno mai essere richiesti dal wizard, quindi non entreranno in\n' +
      '  nessun piano. Aggiungerle a src/lib/residence-features.ts.'
    )
  }
  if (orfane.length) {
    console.error(
      '  Chiavi nella costante che nessun template usa: spuntarle nel wizard\n' +
      '  scrive una riga in residence_features che non attiva nulla. Correggere\n' +
      '  il refuso, oppure rimuoverle se la voce di catalogo non esiste piu\'.'
    )
  }
  if (duplicate.length) {
    console.error('  Chiavi ripetute nella costante: renderebbero due caselle per la stessa dotazione.')
  }
  process.exit(1)
}

console.log('\n✓ Costante e catalogo coincidono esattamente, in entrambe le direzioni.')
process.exit(0)
