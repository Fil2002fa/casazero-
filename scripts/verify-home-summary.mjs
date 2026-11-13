// ============================================================
// CasaZero — verifica del riepilogo della card verde della home residente.
// Uso: npm run verify:homesummary
// COSA GARANTISCE: scadute dal confronto di date, finestra "entro 30 giorni" con
// estremi inclusi (oggi e oggi+30; +31 fuori), in corso e promemoria mai contate,
// voce più urgente solo tra quelle a carico del residente, scadute prima delle
// in scadenza. exit 0 ok; 1 divergente; 2 import fallito.
// ============================================================
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let S
try {
  S = await import(new URL('../src/lib/home-summary.ts', import.meta.url).href)
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
const TODAY = '2026-06-15'
const it = (id, due, o = {}) => ({
  id, status: o.status ?? 'in_attesa', next_due_date: due,
  completion_mode: o.mode ?? 'residente', activation_status: 'inclusa',
  maintenance_templates: { completion_mode: o.mode ?? 'residente', is_active: o.active ?? true },
})
const sum = items => { const r = S.summarizeHome(items, TODAY); return { o: r.overdue, s: r.soon, top: r.top ? [r.top.item.id, r.top.overdue] : null } }

eq('vuoto', sum([]), { o: 0, s: 0, top: null })
eq('scaduta ieri', sum([it('a', '2026-06-14')]), { o: 1, s: 0, top: ['a', true] })
eq('oggi è in scadenza, non scaduta', sum([it('a', '2026-06-15')]), { o: 0, s: 1, top: ['a', false] })
eq('oggi+30 incluso', sum([it('a', '2026-07-15')]), { o: 0, s: 1, top: ['a', false] })
eq('oggi+31 fuori', sum([it('a', '2026-07-16')]), { o: 0, s: 0, top: null })
eq('senza data (attesa consegna) non conta', sum([it('a', null)]), { o: 0, s: 0, top: null })
eq('promemoria mai contata', sum([it('a', '2026-01-01', { mode: 'promemoria' })]), { o: 0, s: 0, top: null })
eq('in corso non conta', sum([it('a', '2026-06-01', { status: 'in_corso' }), it('b', '2026-06-20', { status: 'in_corso' })]), { o: 0, s: 0, top: null })
eq('template inattivo non conta', sum([it('a', '2026-06-01', { active: false })]), { o: 0, s: 0, top: null })
eq('completata non conta', sum([it('a', '2026-06-01', { status: 'completata' })]), { o: 0, s: 0, top: null })
eq('top solo residente: l\'amministratore conta ma non è top', sum([it('a', '2026-06-01', { mode: 'amministratore' }), it('b', '2026-06-20')]), { o: 1, s: 1, top: ['b', false] })
eq('solo amministratore: conteggi senza top', sum([it('a', '2026-06-01', { mode: 'amministratore' })]), { o: 1, s: 0, top: null })
eq('scaduta batte in scadenza anche se più lontana', sum([it('s', '2026-06-16'), it('o', '2026-03-01')]), { o: 1, s: 1, top: ['o', true] })
eq('a parità di stato vince la data più vicina', sum([it('x', '2026-06-30'), it('y', '2026-06-20')]), { o: 0, s: 2, top: ['y', false] })

const up = (items, ex = null) => S.upcomingItems(items, TODAY, ex).map(r => [r.item.id, r.state])
eq('upcoming: stati e ordine', up([it('a', '2026-06-01'), it('b', '2026-06-20'), it('c', '2026-12-01'), it('d', null), it('e', '2026-06-18')]),
  [['a', 'scaduta'], ['b', 'entro_30'], ['c', 'piu_avanti']])
eq('upcoming: esclude la voce in evidenza', up([it('a', '2026-06-01'), it('b', '2026-06-20')], 'a'), [['b', 'entro_30']])
eq('upcoming: senza data = in attesa di consegna', up([it('d', null)]), [['d', 'in_attesa_consegna']])
eq('upcoming: in corso, promemoria e completate', up([it('a', '2026-06-01', { status: 'in_corso' }), it('b', '2026-06-01', { mode: 'promemoria' }), it('c', '2026-06-01', { status: 'completata' })]), [['a', 'in_corso']])
eq('upcoming: estremo +30 dentro, +31 fuori', up([it('a', '2026-07-15'), it('b', '2026-07-16')]), [['a', 'entro_30'], ['b', 'piu_avanti']])

if (failed) { console.error(`\n${failed} casi divergenti`); process.exit(1) }
console.log('\nTutti i casi ok')
