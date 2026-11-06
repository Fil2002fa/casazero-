// ============================================================
// CasaZero — verifica del tipo di anteprima (E1b).
// Uso:  node --experimental-strip-types scripts/verify-document-preview.mjs
//       (oppure: npm run verify:preview)
// ------------------------------------------------------------
// COSA GARANTISCE: che previewKind (src/lib/document-preview.ts) distingua PDF,
// immagini e formati senza anteprima dall'estensione del percorso nello
// storage, anche con maiuscole, punti nel nome e cartelle.
//
// PERCHE' ESISTE: un PDF trattato come immagine mostra un riquadro rotto, un
// Word trattato come PDF fa scaricare il file dentro l'iframe. Si vede solo a
// occhio, file per file.
//
// Exit: 0 = ok; 1 = caso divergente; 2 = import fallito.
// ============================================================
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let mod
try {
  mod = await import(new URL('../src/lib/document-preview.ts', import.meta.url).href)
} catch (err) {
  console.error(`\n✗ Impossibile importare il modulo: ${err.message}`)
  process.exit(2)
}
const { previewKind, PREVIEW_URL_TTL_SECONDS } = mod

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

const R = '0f2b9c1e-0000-4000-8000-000000000001'
check('pdf', previewKind(`${R}/tecnici/1730000000000_attestato.pdf`), 'pdf')
check('pdf maiuscolo', previewKind(`${R}/tecnici/1730000000000_ATTESTATO.PDF`), 'pdf')
check('jpg', previewKind(`${R}/altro/1_foto.jpg`), 'image')
check('jpeg', previewKind(`${R}/altro/1_foto.jpeg`), 'image')
check('png', previewKind(`${R}/altro/1_foto.png`), 'image')
check('webp', previewKind(`${R}/altro/1_foto.webp`), 'image')
check('docx senza anteprima', previewKind(`${R}/altro/1_capitolato.docx`), 'unsupported')
check('doc senza anteprima', previewKind(`${R}/altro/1_capitolato.doc`), 'unsupported')
check('senza estensione', previewKind(`${R}/altro/1_capitolato`), 'unsupported')
check('punto in una cartella ma non nel file', previewKind(`${R}/v1.2/capitolato`), 'unsupported')
check('pdf dopo punti nel nome', previewKind(`${R}/altro/1_a.b.c.pdf`), 'pdf')
check('percorso vuoto', previewKind(''), 'unsupported')
check('la signed URL dura al massimo 5 minuti', PREVIEW_URL_TTL_SECONDS > 0 && PREVIEW_URL_TTL_SECONDS <= 300, true)

if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} su ${eseguiti} casi divergenti`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'esito atteso`)
process.exit(0)
