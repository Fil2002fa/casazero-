// ============================================================
// CasaZero — verifica dell'estrazione del testo da PDF (src/lib/pdf-text.ts).
// Uso:  node --experimental-strip-types scripts/verify-pdf-text.mjs
//       (oppure: npm run verify:pdftext)
// ------------------------------------------------------------
// COSA GARANTISCE: su PDF veri, generati qui con @react-pdf/renderer, che
//  · il testo (accenti compresi) esca con il marcatore di pagina;
//  · il tetto sulle pagine e quello sui caratteri taglino e lo DICANO
//    (truncatedByPages / truncatedByChars), senza mai superare il tetto;
//  · un PDF senza testo (scansione) venga rifiutato come "scanned" e mai
//    restituito come testo vuoto "ok";
//  · un file troppo grande non venga nemmeno aperto;
//  · un file non-PDF dia "unreadable", una password dia "encrypted";
//  · il buffer del chiamante non venga consumato;
//  · pdfjs-dist sia importato SOLO dinamicamente, mai in modo statico.
//
// PERCHE' ESISTE: una scansione letta come "testo vuoto ok" arriverebbe
// all'AI, che risponderebbe "non trovato" a tutto: l'umano vedrebbe una bozza
// vuota senza capirne il motivo.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente; exit 2 = import/generazione fallita — mai confuso con un esito
// positivo.
// ============================================================
import { register } from 'node:module'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
register('./ts-resolve-hooks.mjs', import.meta.url)

let P, React, RP
try {
  P = await import(new URL('../src/lib/pdf-text.ts', import.meta.url).href)
  React = (await import('react')).default
  RP = await import('@react-pdf/renderer')
} catch (err) {
  console.error(`\n✗ Impossibile importare: ${err.message}`)
  process.exit(2)
}
const { extractPdfText, isScannedText, classifyPdfError, PDF_TEXT_LIMITS, PDF_TEXT_MESSAGES } = P
const h = React.createElement

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

// pdfjs in Node: build legacy (la standard pretende API del browser).
const nodeLoader = () => import('pdfjs-dist/legacy/build/pdf.mjs')
const run = (data, limits) => extractPdfText(data, { loader: nodeLoader, limits })

// ---------- generazione dei PDF di prova ----------
async function makePdf(pages) {
  const doc = h(RP.Document, null, pages.map((lines, i) =>
    h(RP.Page, { key: i, size: 'A4' },
      lines.length === 0
        ? h(RP.View, { style: { width: 100, height: 100, borderWidth: 1, borderColor: '#000' } })
        : lines.map((t, j) => h(RP.Text, { key: j }, t)))))
  const buf = await RP.renderToBuffer(doc)
  return new Uint8Array(buf)
}

let pdfTesto, pdfScansione, pdfLungo
try {
  const riga = (n) => `Voce ${n}: riscaldamento a pavimento e pannelli fotovoltaici in copertura.`
  pdfTesto = await makePdf([
    ['Residenza Aurora', 'Via Roma 1, Padova — è prevista la classe energetica A4', 'Impianto: àèìòù'],
    [riga(1), riga(2), riga(3)],
    [riga(4), riga(5), riga(6)],
  ])
  pdfScansione = await makePdf([[], [], []])
  pdfLungo = await makePdf(Array.from({ length: 5 }, (_, i) =>
    [`PAGINA-${i + 1}`, ...Array.from({ length: 12 }, (_, k) => riga(i * 12 + k))]))
} catch (err) {
  console.error(`\n✗ Generazione PDF di prova fallita: ${err.message}`)
  process.exit(2)
}

// ---------- testo normale ----------
{
  const before = pdfTesto.slice()
  const r = await run(pdfTesto)
  check('PDF di testo: ok', r.ok, true)
  check('conteggio pagine', [r.totalPages, r.pagesRead, r.emptyPages], [3, 3, 0])
  check('nessun troncamento', [r.truncatedByPages, r.truncatedByChars], [false, false])
  check('marcatore di pagina 1', r.text.includes('[pagina 1]\nResidenza Aurora'), true)
  check('marcatore di pagina 3', r.text.includes('[pagina 3]'), true)
  check('contenuto presente', r.text.includes('Via Roma 1, Padova'), true)
  check('accenti preservati', r.text.includes('àèìòù') && r.text.includes('è prevista'), true)
  check('ordine delle pagine', r.text.indexOf('[pagina 1]') < r.text.indexOf('[pagina 2]') && r.text.indexOf('[pagina 2]') < r.text.indexOf('[pagina 3]'), true)
  check('il buffer del chiamante non è consumato', Buffer.compare(Buffer.from(before), Buffer.from(pdfTesto)), 0)
  const r2 = await run(pdfTesto.buffer.slice(pdfTesto.byteOffset, pdfTesto.byteOffset + pdfTesto.byteLength))
  check('accetta anche ArrayBuffer', r2.ok && r2.totalPages === 3, true)
}

// ---------- scansione ----------
{
  const r = await run(pdfScansione)
  check('PDF senza testo: rifiutato', [r.ok, r.reason], [false, 'scanned'])
  check('messaggio della scansione', r.message, PDF_TEXT_MESSAGES.scanned)
  check('isScannedText: zero pagine', isScannedText(0, 0), true)
  check('isScannedText: zero caratteri', isScannedText(0, 3), true)
  check('isScannedText: appena sotto soglia', isScannedText(39 * 3, 3), true)
  check('isScannedText: alla soglia non è scansione', isScannedText(40 * 3, 3), false)
  check('isScannedText: soglia personalizzata', isScannedText(100, 1, 200), true)
}

// ---------- pagina vuota dentro un PDF con testo ----------
{
  const riga = 'Capitolato: impianto di riscaldamento a pavimento con pompa di calore.'
  const mixed = await makePdf([[riga, riga], [], [riga, riga]])
  const r = await run(mixed)
  check('pagina vuota in mezzo: ok', r.ok, true)
  check('pagina vuota: contata, non scritta', [r.emptyPages, r.pagesRead, r.text.includes('[pagina 2]'), r.text.includes('[pagina 3]')], [1, 3, false, true])
}

// ---------- tetto sulle pagine ----------
{
  const r = await run(pdfLungo, { maxPages: 2 })
  check('maxPages: ok', r.ok, true)
  check('maxPages: pagine lette e totali', [r.pagesRead, r.totalPages], [2, 5])
  check('maxPages: dichiarato', [r.truncatedByPages, r.truncatedByChars], [true, false])
  check('maxPages: le pagine oltre il tetto non ci sono', r.text.includes('PAGINA-2') && !r.text.includes('PAGINA-3'), true)
  const full = await run(pdfLungo)
  check('senza tetto: tutte le pagine, non troncato', [full.pagesRead, full.truncatedByPages, full.text.includes('PAGINA-5')], [5, false, true])
  const exact = await run(pdfLungo, { maxPages: 5 })
  check('maxPages uguale alle pagine: non è troncamento', exact.truncatedByPages, false)
}

// ---------- tetto sui caratteri ----------
{
  const r = await run(pdfLungo, { maxChars: 500 })
  check('maxChars: ok', r.ok, true)
  check('maxChars: dichiarato', r.truncatedByChars, true)
  check('maxChars: mai oltre il tetto', r.text.length <= 500, true)
  check('maxChars: non legge oltre', r.pagesRead < 5, true)
  const big = await run(pdfLungo, { maxChars: 10_000_000 })
  check('maxChars largo: non troncato', big.truncatedByChars, false)
  // una scansione non si salva col tetto: il rilevamento viene prima del testo
  const s = await run(pdfScansione, { maxChars: 10 })
  check('maxChars non maschera la scansione', s.reason, 'scanned')
}

// ---------- dimensione ----------
{
  let caricato = false
  const spy = async () => { caricato = true; return nodeLoader() }
  const r = await extractPdfText(pdfTesto, { loader: spy, limits: { maxBytes: 100 } })
  check('troppo grande: rifiutato', [r.ok, r.reason], [false, 'too_large'])
  check('troppo grande: pdfjs nemmeno caricato', caricato, false)
  const ok = await extractPdfText(pdfTesto, { loader: spy, limits: { maxBytes: pdfTesto.byteLength } })
  check('esattamente al limite: si legge', ok.ok, true)
  check('tetto di default sui byte', PDF_TEXT_LIMITS.maxBytes, 25 * 1024 * 1024)
}

// ---------- errori ----------
{
  const origErr = console.error
  console.error = () => {} // il log atteso del fallimento non sporca l'output
  try {
    const junk = new TextEncoder().encode('questo non è un PDF, è solo testo '.repeat(20))
    const r = await run(junk)
    check('non-PDF: unreadable', [r.ok, r.reason], [false, 'unreadable'])
    check('messaggio unreadable', r.message, PDF_TEXT_MESSAGES.unreadable)
    const vuoto = await run(new Uint8Array(0))
    check('file vuoto: unreadable', vuoto.reason, 'unreadable')

    const pwd = await extractPdfText(pdfTesto, {
      loader: async () => ({ getDocument: () => ({ promise: Promise.reject(Object.assign(new Error('x'), { name: 'PasswordException' })), destroy: async () => {} }) }),
    })
    check('password: encrypted', [pwd.ok, pwd.reason], [false, 'encrypted'])

    // il loader che fallisce (rete, chunk mancante) è un fallimento tecnico
    const lf = await extractPdfText(pdfTesto, { loader: async () => { throw new Error('chunk') } })
    check('loader che fallisce: unreadable, non scanned', lf.reason, 'unreadable')

    // destroy chiamato anche quando la lettura fallisce a metà
    let destroyed = 0
    const midFail = await extractPdfText(pdfTesto, {
      loader: async () => ({
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 2,
            getPage: async () => { throw new Error('pagina rotta') },
          }),
          destroy: async () => { destroyed++ },
        }),
      }),
    })
    check('errore a metà: unreadable', midFail.reason, 'unreadable')
    check('errore a metà: task distrutto', destroyed, 1)

    // anche sul percorso di successo e su quello di scansione il task viene chiuso
    let destroyedOk = 0
    const counting = async () => {
      const real = await nodeLoader()
      return {
        getDocument: (src) => {
          const t = real.getDocument(src)
          const d = t.destroy.bind(t)
          t.destroy = async () => { destroyedOk++; return d() }
          return t
        },
      }
    }
    const okRun = await extractPdfText(pdfTesto, { loader: counting })
    check('successo: ok e task distrutto', [okRun.ok, destroyedOk], [true, 1])
    const scanRun = await extractPdfText(pdfScansione, { loader: counting })
    check('scansione: rifiutata e task distrutto', [scanRun.reason, destroyedOk], ['scanned', 2])
  } finally {
    console.error = origErr
  }
  check('classifyPdfError: PasswordException', classifyPdfError({ name: 'PasswordException' }), 'encrypted')
  check('classifyPdfError: altro', classifyPdfError(new Error('x')), 'unreadable')
  check('classifyPdfError: non-oggetto', classifyPdfError(null), 'unreadable')
}

// ---------- pdfjs-dist solo dinamico ----------
{
  const root = fileURLToPath(new URL('../src/', import.meta.url))
  const files = []
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(ts|tsx|js|jsx|mjs)$/.test(n)) files.push(p)
    }
  }
  walk(root)
  const statici = []
  let dinamici = 0
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    if (/^\s*import\s[^;]*?from\s*['"]pdfjs-dist/m.test(src) || /^\s*import\s*['"]pdfjs-dist/m.test(src) || /require\(\s*['"]pdfjs-dist/.test(src)) {
      statici.push(f.replace(root, 'src/'))
    }
    if (/import\(\s*['"]pdfjs-dist/.test(src)) dinamici++
  }
  check('nessun import statico di pdfjs-dist in src', statici, [])
  check('un solo import dinamico di pdfjs-dist in src', dinamici, 1)
}

console.log(`\n${eseguiti - fallimenti}/${eseguiti} casi ok`)
if (fallimenti > 0) {
  console.error(`✗ ${fallimenti} casi divergenti`)
  process.exit(1)
}
console.log('✓ estrazione testo PDF: tutti i casi coincidono')
