// ============================================================
// CasaZero — verifica delle regole di caricamento dei documenti del residente.
// Uso:  npm run verify:resupload
// COSA GARANTISCE: i 6 tipi e le loro etichette coincidono col CHECK della
// 059; 5 MB e 4 MIME come bucket e CHECK; tipo dal browser o, solo se manca,
// dall'estensione; messaggi su tipo e dimensione; magic bytes di PDF, JPEG,
// PNG e WebP (e rifiuto di contenuti scambiati o troncati); titolo dal nome
// file e sanificato (controlli, zero-width, bidi, 80 caratteri senza spezzare
// surrogati); path {unit_id}/{uuid}.{ext} con la stessa forma della regex del
// DB; nome del file scaricato.
// exit 0 = ok; 1 = caso divergente; 2 = import fallito.
// ============================================================
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let U
try {
  U = await import(new URL('../src/lib/resident-document-upload.ts', import.meta.url).href)
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

// ---- Allineamento con la 059 ----
const sql = readFileSync(new URL('../supabase/migrations/059_resident_documents.sql', import.meta.url), 'utf8')
const kindCheck = /doc_kind IN \(([^)]*)\)/.exec(sql)?.[1].split(',').map(s => s.trim().replace(/'/g, ''))
eq('tipi = CHECK doc_kind della 059', U.RESIDENT_DOC_KINDS.map(k => k.value), kindCheck)
const mimeCheck = /mime_type IN \(([^)]*)\)/.exec(sql)?.[1].split(',').map(s => s.trim().replace(/'/g, ''))
eq('MIME = CHECK mime_type della 059', [...U.RESIDENT_DOC_MIMES].sort(), [...mimeCheck].sort())
eq('5 MB = CHECK size_bytes', U.RESIDENT_DOC_MAX_BYTES, Number(/size_bytes <= (\d+)/.exec(sql)?.[1]))
eq('5 MB = limite del bucket', sql.includes(`false, ${U.RESIDENT_DOC_MAX_BYTES},`), true)
eq('titolo entro il CHECK (<= 120)', U.RESIDENT_DOC_TITLE_MAX <= 120, true)
eq('bucket', U.RESIDENT_DOC_BUCKET, 'resident-documents')
eq('tetto per unità', U.RESIDENT_DOC_MAX_PER_UNIT, 50)

// ---- Etichette ----
eq('etichette', U.RESIDENT_DOC_KINDS.map(k => k.label), ['Ricevuta', 'Rapporto del tecnico', 'Garanzia', 'Manuale', 'Foto', 'Altro'])
eq('etichetta rapporto_tecnico', U.residentDocKindLabel('rapporto_tecnico'), 'Rapporto del tecnico')
eq('isResidentDocKind: valido', U.isResidentDocKind('garanzia'), true)
eq('isResidentDocKind: chiave del mockup "rapporto" rifiutata', U.isResidentDocKind('rapporto'), false)
eq('isResidentDocKind: non stringa', U.isResidentDocKind(3), false)
eq('isResidentDocMime: heic', U.isResidentDocMime('image/heic'), false)
eq('isResidentDocMime: __proto__', U.isResidentDocMime('__proto__'), false)

// ---- Tipo del file ----
eq('mime dichiarato valido', U.resolveResidentDocMime('image/png', 'x.jpg'), 'image/png')
eq('mime vuoto: da estensione .JPEG', U.resolveResidentDocMime('', 'Foto.JPEG'), 'image/jpeg')
eq('octet-stream: da estensione .pdf', U.resolveResidentDocMime('application/octet-stream', 'a.pdf'), 'application/pdf')
eq('mime dichiarato non ammesso, estensione ammessa: rifiutato', U.resolveResidentDocMime('image/heic', 'a.jpg'), null)
eq('mime vuoto, estensione ignota', U.resolveResidentDocMime('', 'a.docx'), null)
eq('mime vuoto, senza estensione', U.resolveResidentDocMime('', 'README'), null)

// ---- Controllo dichiarato ----
eq('ok', U.residentDocDeclaredError('application/pdf', 1000), null)
eq('esattamente 5 MB: ok', U.residentDocDeclaredError('image/webp', 5242880), null)
eq('5 MB + 1: errore con peso', U.residentDocDeclaredError('image/webp', 5242881), 'Il file pesa 5,0 MB. Il massimo è 5 MB: prova con una foto più leggera o un PDF compresso.')
eq('tipo non ammesso', U.residentDocDeclaredError('application/msword', 10), U.RESIDENT_DOC_TYPE_ERROR)
eq('tipo null', U.residentDocDeclaredError(null, 10), U.RESIDENT_DOC_TYPE_ERROR)
eq('vuoto', U.residentDocDeclaredError('image/png', 0) !== null, true)
eq('non intero', U.residentDocDeclaredError('image/png', 1.5) !== null, true)
eq('NaN', U.residentDocDeclaredError('image/png', NaN) !== null, true)
eq('formato KB', U.formatFileSize(219136), '214 KB')
eq('formato minimo 1 KB', U.formatFileSize(10), '1 KB')
eq('formato MB', U.formatFileSize(1153434), '1,1 MB')

// ---- Magic bytes ----
const b = (...xs) => new Uint8Array(xs)
const ascii = s => [...s].map(c => c.charCodeAt(0))
const pdf = b(...ascii('%PDF-1.7\n'), 0, 0, 0)
const jpg = b(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, ...ascii('JFIF'), 0, 1)
const png = b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d)
const webp = b(...ascii('RIFF'), 0x24, 0, 0, 0, ...ascii('WEBP'))
eq('PDF', U.matchesMagicBytes('application/pdf', pdf), true)
eq('JPEG', U.matchesMagicBytes('image/jpeg', jpg), true)
eq('PNG', U.matchesMagicBytes('image/png', png), true)
eq('WebP', U.matchesMagicBytes('image/webp', webp), true)
eq('PNG dichiarato come PDF', U.matchesMagicBytes('application/pdf', png), false)
eq('PDF dichiarato come JPEG', U.matchesMagicBytes('image/jpeg', pdf), false)
eq('RIFF non WebP (WAVE)', U.matchesMagicBytes('image/webp', b(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE'))), false)
eq('WebP troncato', U.matchesMagicBytes('image/webp', b(...ascii('RIFF'), 0, 0)), false)
eq('vuoto', U.matchesMagicBytes('application/pdf', b()), false)
eq('"%PDF" senza trattino', U.matchesMagicBytes('application/pdf', b(...ascii('%PDF1'))), false)
eq('HTML come PDF', U.matchesMagicBytes('application/pdf', b(...ascii('<html><body>'))), false)
eq('byte necessari', U.MAGIC_BYTES_NEEDED, 12)

// ---- Titolo ----
eq('dal nome file', U.titleFromFileName('ricevuta-filtri_vmc.pdf'), 'Ricevuta filtri vmc')
eq('foto della fotocamera', U.titleFromFileName('IMG_2291.jpg'), 'IMG 2291')
eq('con cartella', U.titleFromFileName('C:\\fakepath\\garanzia.pdf'), 'Garanzia')
eq('due punti: toglie solo l\'ultima estensione', U.titleFromFileName('v1.2 rapporto.pdf'), 'V1.2 rapporto')
eq('iniziale accentata', U.titleFromFileName('è_ok.png'), 'È ok')
eq('solo estensione', U.titleFromFileName('.pdf'), '')
eq('bidi override tolto', U.sanitizeResidentDocTitle('fattura\u202Efdp.exe'), 'fattura fdp.exe')
eq('zero-width tolto', U.sanitizeResidentDocTitle('ga\u200Branzia'), 'ga ranzia')
eq('a capo e tab', U.sanitizeResidentDocTitle('  riga1\n\triga2  '), 'riga1 riga2')
eq('solo spazi', U.sanitizeResidentDocTitle(' \u00a0 \n '), '')
eq('NFC', U.sanitizeResidentDocTitle('cafe\u0301'), 'caf\u00e9')
const long = 'a'.repeat(79) + '😀' + 'b'
eq('80 caratteri, emoji intera', U.sanitizeResidentDocTitle(long), 'a'.repeat(79) + '😀')
eq('niente spazio in coda dopo il taglio', U.sanitizeResidentDocTitle('a'.repeat(79) + ' bbbb'), 'a'.repeat(79))

// ---- Path ----
const unit = 'cb14e7c1-0000-4000-8000-000000000001'
const obj = '0f5a2c3d-1111-4222-8333-444455556666'
eq('path pdf', U.residentDocPath(unit, obj, 'application/pdf'), `${unit}/${obj}.pdf`)
eq('path jpeg -> jpg', U.residentDocPath(unit, obj, 'image/jpeg'), `${unit}/${obj}.jpg`)
eq('unità maiuscola: null', U.residentDocPath(unit.toUpperCase(), obj, 'image/png'), null)
eq('unità con path traversal: null', U.residentDocPath('../x', obj, 'image/png'), null)
eq('id non uuid: null', U.residentDocPath(unit, 'nome-file', 'image/png'), null)
eq('path dell\'unità', U.isResidentDocPathFor(`${unit}/${obj}.png`, unit, 'image/png'), true)
eq('path di un\'altra unità', U.isResidentDocPathFor(`${obj}/${obj}.png`, unit, 'image/png'), false)
eq('estensione diversa dal tipo', U.isResidentDocPathFor(`${unit}/${obj}.pdf`, unit, 'image/png'), false)
eq('sottocartella', U.isResidentDocPathFor(`${unit}/x/${obj}.png`, unit, 'image/png'), false)
eq('suffisso extra', U.isResidentDocPathFor(`${unit}/${obj}.png.exe`, unit, 'image/png'), false)
eq('unità non uuid', U.isResidentDocPathFor(`.*/${obj}.png`, '.*', 'image/png'), false)
// Stessa forma della regex di resident_documents_path_check.
const dbRe = /storage_path ~ \('\^' \|\| unit_id::text \|\| '([^']*)'\)/.exec(sql)?.[1]
eq('regex del DB trovata', typeof dbRe, 'string')
const dbMatch = p => new RegExp('^' + unit + dbRe.replace(/\\\\/g, '\\')).test(p)
for (const m of U.RESIDENT_DOC_MIMES) {
  const p = U.residentDocPath(unit, obj, m)
  eq(`path ${m} accettato dalla regex del DB`, dbMatch(p), true)
}

// ---- Nome scaricato ----
eq('nome scaricato', U.residentDocDownloadName('Garanzia: lavastoviglie / 2026', 'application/pdf'), 'Garanzia lavastoviglie 2026.pdf')
eq('nome scaricato vuoto', U.residentDocDownloadName('???', 'image/jpeg'), 'documento.jpg')

console.log(failed === 0 ? '\nverify:resupload — tutto ok' : `\nverify:resupload — ${failed} casi divergenti`)
process.exit(failed === 0 ? 0 : 1)
