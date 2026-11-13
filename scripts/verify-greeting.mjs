// ============================================================
// CasaZero — verifica del saluto della home residente.
// Uso:  npm run verify:saluto
// COSA GARANTISCE: fasce orarie in Europe/Rome con i confini (4/5, 12/13,
// 17/18, anche con ora legale e fuso del server diverso), nome vuoto, nome uguale
// alla parte locale dell'email (anche con maiuscole e spazi), nome composto.
// exit 0 = ok; 1 = caso divergente; 2 = import fallito.
// ============================================================
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let G
try {
  G = await import(new URL('../src/lib/greeting.ts', import.meta.url).href)
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

// Inverno (CET, UTC+1): ora locale = UTC + 1. Estate (CEST, UTC+2): UTC + 2.
const winter = (h, m = 0) => new Date(Date.UTC(2026, 0, 15, h - 1, m))
const summer = (h, m = 0) => new Date(Date.UTC(2026, 6, 15, h - 2, m))

for (const [mk, name] of [[winter, 'inverno'], [summer, 'estate']]) {
  eq(`${name} 04:59 Buonasera`, G.greetingWord(mk(4, 59)), 'Buonasera')
  eq(`${name} 05:00 Buongiorno`, G.greetingWord(mk(5)), 'Buongiorno')
  eq(`${name} 12:59 Buongiorno`, G.greetingWord(mk(12, 59)), 'Buongiorno')
  eq(`${name} 13:00 Ciao`, G.greetingWord(mk(13)), 'Ciao')
  eq(`${name} 17:59 Ciao`, G.greetingWord(mk(17, 59)), 'Ciao')
  eq(`${name} 18:00 Buonasera`, G.greetingWord(mk(18)), 'Buonasera')
  eq(`${name} 00:30 Buonasera`, G.greetingWord(mk(0, 30)), 'Buonasera')
  eq(`${name} 23:59 Buonasera`, G.greetingWord(mk(23, 59)), 'Buonasera')
}

const n = G.residentFirstName
eq('prefisso email = nessun nome', n('pippoloro02', 'pippoloro02@gmail.com'), null)
eq('prefisso email con maiuscole e spazi', n('  PippoLoro02 ', 'pippoloro02@gmail.com'), null)
eq('parte locale intera con +tag', n('pippoloro02+residente', 'pippoloro02+residente@gmail.com'), null)
eq('parte locale senza +tag', n('pippoloro02', 'pippoloro02+residente@gmail.com'), null)
eq('nome null', n(null, 'a@b.it'), null)
eq('nome vuoto', n('', 'a@b.it'), null)
eq('nome solo spazi', n('   ', 'a@b.it'), null)
eq('nome semplice', n('Marco', 'm.rossi@x.it'), 'Marco')
eq('nome composto: primo nome', n('Maria Grazia Rossi', 'm@x.it'), 'Maria')
eq('spazi doppi', n('  Marco   Rossi ', 'x@x.it'), 'Marco')
eq('email assente', n('Marco', null), 'Marco')
eq('buildGreeting senza nome', G.buildGreeting('', 'a@b.it', winter(9)), { word: 'Buongiorno', name: null })
eq('buildGreeting con nome', G.buildGreeting('Marco Rossi', 'a@b.it', winter(19)), { word: 'Buonasera', name: 'Marco' })

if (failed) { console.error(`\n${failed} casi divergenti`); process.exit(1) }
console.log('\nTutti i casi ok')
