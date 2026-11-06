// ============================================================
// CasaZero — verifica del colore dello stato "Da verificare" nel quadro (6b-4).
// Uso:  node scripts/verify-cell-contrast.mjs   (oppure: npm run verify:contrast)
// ------------------------------------------------------------
// COSA GARANTISCE: che le celle ambra del quadro usino i token ambra
// (semantic-amber su semantic-amber-bg), che quei token abbiano un contrasto
// di almeno 4,5:1 (WCAG AA per testo normale), e che il quadro non usi mai i
// colori di errore (rosso) per lo stato "Da verificare".
//
// PERCHE' ESISTE: lo stesso stato, reso con status-inprogress al 8% di
// opacità, sul monitor appariva rosato/rosso: un'ambra che sembra un errore.
// Il contrasto si calcola, non si giudica a occhio.
//
// Exit: 0 = ok; 1 = caso divergente; 2 = file non leggibile.
// ============================================================
import { readFileSync } from 'node:fs'

let css, matrix, panel, client, badge, table, toast
try {
  css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8')
  matrix = readFileSync(new URL('../src/app/(dashboard)/admin/residences/[id]/documenti/UnitDocumentMatrix.tsx', import.meta.url), 'utf8')
  panel = readFileSync(new URL('../src/app/(dashboard)/admin/residences/[id]/documenti/DocumentPanel.tsx', import.meta.url), 'utf8')
  client = readFileSync(new URL('../src/app/(dashboard)/admin/residences/[id]/documenti/DocumentiClient.tsx', import.meta.url), 'utf8')
  badge = readFileSync(new URL('../src/app/(dashboard)/admin/residences/[id]/documenti/ClassificationBadge.tsx', import.meta.url), 'utf8')
  table = readFileSync(new URL('../src/app/(dashboard)/admin/residences/[id]/documenti/DocumentsTable.tsx', import.meta.url), 'utf8')
  toast = readFileSync(new URL('../src/components/ui/Toast.tsx', import.meta.url), 'utf8')
} catch (err) {
  console.error(`✗ File non leggibili: ${err.message}`)
  process.exit(2)
}

let fallimenti = 0
let eseguiti = 0
function check(label, ok, dettaglio = '') {
  eseguiti++
  if (ok) return
  fallimenti++
  console.error(`✗ ${label}${dettaglio ? `\n    ${dettaglio}` : ''}`)
}

function token(name) {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))
  return m ? m[1] : null
}
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const testo = token('semantic-amber')
const sfondo = token('semantic-amber-bg')
check('i token ambra esistono in globals.css', testo !== null && sfondo !== null, `semantic-amber=${testo} semantic-amber-bg=${sfondo}`)
if (testo && sfondo) {
  const ratio = contrast(testo, sfondo)
  check(`contrasto testo ambra su sfondo ambra >= 4,5 (${ratio.toFixed(2)}:1)`, ratio >= 4.5)
}

const riga = matrix.match(/da_verificare:\s*'([^']*)'/g) ?? []
const stile = riga.find(r => r.includes('border-')) ?? ''
check('lo stile della cella "Da verificare" usa bordo, sfondo e hover ambra',
  /border-semantic-amber/.test(stile) && /bg-semantic-amber-bg/.test(stile) && /hover:border-semantic-amber/.test(stile), stile)
check('il quadro non usa i colori di errore', !/status-overdue|semantic-red|text-red|bg-red|border-red/.test(matrix))
check('icona e testo dello stato usano il testo ambra scuro', /text-semantic-amber/.test(matrix))

// --- lo stesso ambra su badge, banner, filtro e toast (6c-2) ----------------------
const secondario = token('text-secondary')
if (secondario && sfondo) {
  const ratio = contrast(secondario, sfondo)
  check(`contrasto del testo secondario sul banner ambra >= 4,5 (${ratio.toFixed(2)}:1)`, ratio >= 4.5)
}
check('il badge "Da verificare" della lista usa i token ambra',
  /label: REVIEW_LABEL, className: 'bg-semantic-amber-bg text-semantic-amber'/.test(badge))
check('lo stato "Da verificare" della tabella usa i token ambra', /da_rivedere: 'bg-semantic-amber-bg text-semantic-amber'/.test(table))
check('il filtro "Da verificare" attivo usa i token ambra', /bg-semantic-amber-bg text-semantic-amber border-semantic-amber/.test(client))
check('il banner del pannello usa i token ambra', /bg-semantic-amber-bg/.test(panel) && /text-semantic-amber">{REVIEW_LABEL}/.test(panel))
check('il banner del pannello non usa status-inprogress', !/status-inprogress/.test(panel))
check('icona del toast warning usa il testo ambra', /AlertCircle[^>]*text-semantic-amber/.test(toast))

if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
process.exit(0)
