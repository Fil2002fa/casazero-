// ============================================================
// CasaZero — verifica della barra in alto del residente.
// Uso:  npm run verify:topbar
// COSA GARANTISCE: la barra compare solo su /, /documenti, /fascicolo, /profilo
// (anche con slash finale) e mai sulle manutenzioni, sulla guida e su
// /profilo/dati-personali; il sottotitolo "residenza · interno" e i testi degli
// stati degradati (errore, nessuna unità, residenza senza nome).
// exit 0 = ok; 1 = caso divergente; 2 = import fallito.
// ============================================================
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let T
try {
  T = await import(new URL('../src/lib/resident-top-bar.ts', import.meta.url).href)
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

for (const p of ['/', '/documenti', '/fascicolo', '/profilo', '/documenti/', '/profilo/']) {
  eq(`visibile su ${p}`, T.showsResidentTopBar(p), true)
}
for (const p of [
  '/manutenzioni', '/manutenzioni/abc', '/manutenzioni/abc/guida',
  '/profilo/dati-personali', '/documenti/xyz', '/admin', '/auth/login', '',
]) {
  eq(`nascosta su ${p || '(vuoto)'}`, T.showsResidentTopBar(p), false)
}

eq('ok', T.topBarSubtitle({ state: 'ok', residenceName: 'Residenza Magnolia', unitLabel: 'Interno B12' }), 'Residenza Magnolia · Interno B12')
eq('ok senza nome residenza', T.topBarSubtitle({ state: 'ok', residenceName: null, unitLabel: 'A1' }), 'La tua residenza · A1')
eq('ok nome residenza vuoto', T.topBarSubtitle({ state: 'ok', residenceName: '  ', unitLabel: 'A1' }), 'La tua residenza · A1')
eq('ok senza etichetta unità', T.topBarSubtitle({ state: 'ok', residenceName: 'Tencarola', unitLabel: ' ' }), 'Tencarola')
eq('nessuna unità', T.topBarSubtitle({ state: 'no-unit' }), 'Nessuna unità associata')
eq('errore tecnico', T.topBarSubtitle({ state: 'error' }), 'Residenza non disponibile')

if (failed > 0) {
  console.error(`\n${failed} caso/i divergente/i`)
  process.exit(1)
}
console.log('\nTutti i casi ok')
