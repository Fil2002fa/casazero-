// ============================================================
// CasaZero — verifica dell'apertura in linea su /api/download.
// Uso:  npm run verify:download
// COSA GARANTISCE: senza parametro il comportamento resta lo scaricamento
// (download: true, come prima); solo inline=1 esatto apre in linea; qualunque
// altro valore (vuoto, "true", "0", "11", maiuscole) resta scaricamento.
// Controlla anche che la route usi l'helper e che il default non sia stato
// riscritto a mano.
// exit 0 = ok; 1 = caso divergente; 2 = import fallito.
// ============================================================
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let D
try {
  D = await import(new URL('../src/lib/download-disposition.ts', import.meta.url).href)
} catch (err) {
  console.error('Import fallito:', err)
  process.exit(2)
}

let failed = 0
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}

eq('senza parametro: scaricamento', D.signedUrlOptions(null), { download: true })
eq('inline=1: apertura in linea (nessuna opzione)', D.signedUrlOptions('1'), undefined)
for (const v of ['', '0', 'true', '11', ' 1', 'INLINE', 'yes']) {
  eq(`inline=${JSON.stringify(v)}: resta scaricamento`, D.signedUrlOptions(v), { download: true })
}

const route = readFileSync(new URL('../src/app/api/download/route.ts', import.meta.url), 'utf8')
eq('la route usa signedUrlOptions', /signedUrlOptions\(req\.nextUrl\.searchParams\.get\('inline'\)\)/.test(route), true)
eq('la route non ha più download: true scritto a mano', /createSignedUrl\([^)]*download:\s*true/.test(route), false)
eq('la route usa il client di sessione, non il service client', /createClient\(\)/.test(route) && !/createServiceClient/.test(route), true)
eq('bucket ammessi invariati', /\['attachments', 'documents'\]\.includes\(bucket\)/.test(route), true)

if (failed) { console.error(`\n${failed} casi divergenti`); process.exit(1) }
console.log('\nTutti i casi ok')
