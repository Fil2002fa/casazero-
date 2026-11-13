// ============================================================
// CasaZero — verifica della sezione "I tuoi documenti" della pagina Documenti
// del residente e della vista combinata con "Dal costruttore".
// Uso:  npm run verify:resown
// COSA GARANTISCE: righe più recenti per prime, etichetta del tipo, "da te" /
// "da chi vive con te" (mai un nome); conteggi della card verde uguali alla
// lunghezza degli array; filtro "I tuoi" nasconde il costruttore; filtro di
// categoria nasconde i tuoi; ricerca su titolo e tipo; stato del primo
// accesso solo senza ricerca; "Nessun documento trovato" solo quando nessuna
// sezione mostra qualcosa; vista admin (own null) senza sezione; URL del file.
// exit 0 = ok; 1 = caso divergente; 2 = import fallito.
// ============================================================
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let O
try {
  O = await import(new URL('../src/lib/resident-own-documents-view.ts', import.meta.url).href)
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

const ME = 'aaaaaaaa-0000-4000-8000-000000000001'
const MATE = 'aaaaaaaa-0000-4000-8000-000000000002'
const row = (id, kind, title, mime, size, created, by) => ({ id, doc_kind: kind, title, mime_type: mime, size_bytes: size, created_at: created, uploaded_by: by })
const rows = [
  row('m1', 'ricevuta', 'Sostituzione filtri VMC', 'application/pdf', 219136, '2026-03-12T10:00:00Z', ME),
  row('m3', 'foto', 'Contatore acqua alla consegna', 'image/jpeg', 2516582, '2026-06-18T09:00:00Z', ME),
  row('m2', 'garanzia', 'Garanzia lavastoviglie', 'application/pdf', 1153434, '2026-02-03T08:00:00Z', MATE),
]
const own = O.toOwnDocumentItems(rows, ME)

eq('ordine: più recente per primo', own.map(i => i.id), ['m3', 'm1', 'm2'])
eq('etichetta tipo', own.map(i => i.kindLabel), ['Foto', 'Ricevuta', 'Garanzia'])
eq('immagine', own.map(i => i.isImage), [true, false, false])
eq('dimensione', own.map(i => i.sizeLabel), ['2,4 MB', '214 KB', '1,1 MB'])
eq('data', own[1].dateLabel, '12 mar 2026')
eq('da te / da chi vive con te', own.map(i => i.byLabel), ['da te', 'da te', 'da chi vive con te'])
eq('meta propria: solo data', O.ownDocumentMeta(own[1]), '12 mar 2026')
eq('meta del convivente', O.ownDocumentMeta(own[2]), '3 feb 2026 · da chi vive con te')
eq('righe del foglio', O.ownDocumentSheetRows(own[2]), [
  { label: 'Tipo', value: 'Garanzia' },
  { label: 'Dimensione', value: '1,1 MB' },
  { label: 'Aggiunto', value: '3 feb 2026 · da chi vive con te' },
])
eq('righe intatte (nessuna mutazione)', rows.map(r => r.id), ['m1', 'm3', 'm2'])
eq('URL scarica', O.ownDocumentUrl('m1'), '/api/documenti-residente/m1')
eq('URL apri', O.ownDocumentUrl('m1', true), '/api/documenti-residente/m1?inline=1')
eq('tuo / tuoi', [O.ownCountLabel(1), O.ownCountLabel(0), O.ownCountLabel(3)], ['tuo', 'tuoi', 'tuoi'])

// Voci del costruttore: forma minima usata da filterResidentDocuments.
const b = (key, category, text) => ({ key, category, searchText: text.toLocaleLowerCase('it'), title: text })
const builder = [b('b1', 'proprieta', 'Libretto uso'), b('b2', 'tecnici', 'Planimetria'), b('b3', 'conformita', 'DiCo elettrico')]

const v = (f, s = '', o = own, bi = builder) => O.documentsPageView(bi, o, { filter: f, search: s })

let x = v('all')
eq('tutti: totali = lunghezza array', [x.builderTotal, x.ownTotal], [3, 3])
eq('tutti: due sezioni', [x.builderState, x.own.state], ['list', 'list'])
eq('tutti: conteggio sezione tuoi', x.own.countLabel, '3 documenti')
eq('tutti: conteggio costruttore', x.builder.visible, 3)
eq('tutti: non filtra', x.filtering, false)

x = v('mine')
eq('I tuoi: costruttore nascosto', [x.builder, x.builderState], [null, 'hidden'])
eq('I tuoi: lista', x.own.items.map(i => i.id), ['m3', 'm1', 'm2'])
eq('I tuoi: totali della card invariati', [x.builderTotal, x.ownTotal], [3, 3])

x = v('tecnici')
eq('categoria: tuoi nascosti', x.own.state, 'hidden')
eq('categoria: solo tecnici', x.builder.visible, 1)

x = v('all', 'garanzia')
eq('ricerca per titolo/tipo', x.own.items.map(i => i.id), ['m2'])
eq('ricerca: costruttore senza risultati nascosto', x.builderState, 'hidden')
eq('ricerca: non è "nothing"', x.nothing, false)
eq('ricerca: conteggio sezione = righe', x.own.countLabel, '1 documento')

x = v('all', 'FOTO')
eq('ricerca senza maiuscole', x.own.items.map(i => i.id), ['m3'])

x = v('all', 'zzz')
eq('nessun risultato ovunque', [x.builderState, x.own.state, x.nothing, x.filtering], ['hidden', 'hidden', true, true])

x = v('mine', 'planimetria')
eq('I tuoi + ricerca del costruttore: nothing', x.nothing, true)

// Primo accesso: nessun documento proprio.
x = v('all', '', [])
eq('primo accesso: invito', [x.own.state, x.ownTotal], ['empty', 0])
x = v('mine', '', [])
eq('primo accesso con "I tuoi": invito, non "nothing"', [x.own.state, x.nothing], ['empty', false])
x = v('all', 'libretto', [])
eq('primo accesso con ricerca: niente invito', x.own.state, 'hidden')

// Nessun documento del costruttore.
x = v('all', '', own, [])
eq('costruttore vuoto senza filtri: stato none', x.builderState, 'none')
x = v('all', 'filtri', own, [])
eq('costruttore vuoto con ricerca: nascosto', x.builderState, 'hidden')

// Vista admin/super_admin: nessuna sezione tuoi.
x = v('all', '', null)
eq('admin: sezione tuoi nascosta', [x.own.state, x.ownTotal], ['hidden', 0])
eq('admin: costruttore come prima', x.builderState, 'list')

console.log(failed === 0 ? '\nverify:resown — tutto ok' : `\nverify:resown — ${failed} casi divergenti`)
process.exit(failed === 0 ? 0 : 1)
