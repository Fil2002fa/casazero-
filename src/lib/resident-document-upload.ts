/**
 * Regole del caricamento dei documenti del residente, come funzioni pure:
 * lista chiusa dei tipi, limiti, MIME ed estensioni, magic bytes, titolo,
 * path dell'oggetto. Le usano il foglio di caricamento (client) e le server
 * action (server): una sola fonte, provata da scripts/verify-resident-upload.mjs
 * senza avviare l'app.
 *
 * Ogni valore è allineato alla 059 (059_resident_documents.sql): CHECK su
 * doc_kind, mime_type, size_bytes e storage_path, limiti del bucket
 * `resident-documents`. Se cambia la migrazione, cambia qui.
 *
 * Solo import di tipo e niente dipendenze dal server: modulo usabile ovunque.
 */
import type { ResidentDocKind, ResidentDocMime } from '@/types/database'

export const RESIDENT_DOC_BUCKET = 'resident-documents'

/** I 6 tipi, nell'ordine del foglio di caricamento. Chiavi = CHECK su doc_kind. */
export const RESIDENT_DOC_KINDS: readonly { value: ResidentDocKind; label: string }[] = [
  { value: 'ricevuta', label: 'Ricevuta' },
  { value: 'rapporto_tecnico', label: 'Rapporto del tecnico' },
  { value: 'garanzia', label: 'Garanzia' },
  { value: 'manuale', label: 'Manuale' },
  { value: 'foto', label: 'Foto' },
  { value: 'altro', label: 'Altro' },
]

/** 5 MB: CHECK su size_bytes e file_size_limit del bucket. */
export const RESIDENT_DOC_MAX_BYTES = 5 * 1024 * 1024

/** Tetto per unità, controllato dalla server action prima di firmare l'upload. */
export const RESIDENT_DOC_MAX_PER_UNIT = 50

/** Lunghezza massima del titolo (mockup). Il CHECK del DB ammette fino a 120. */
export const RESIDENT_DOC_TITLE_MAX = 80

/** MIME → estensione del path. L'estensione è quella del CHECK su storage_path. */
const MIME_EXT: Record<ResidentDocMime, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export const RESIDENT_DOC_MIMES = Object.keys(MIME_EXT) as ResidentDocMime[]

/** Valore dell'attributo accept dell'input file. */
export const RESIDENT_DOC_ACCEPT = RESIDENT_DOC_MIMES.join(',')

/** Estensioni del nome file riconosciute quando il browser non dichiara il tipo. */
const NAME_EXT_MIME: Record<string, ResidentDocMime> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export function isResidentDocKind(v: unknown): v is ResidentDocKind {
  return typeof v === 'string' && RESIDENT_DOC_KINDS.some(k => k.value === v)
}

export function isResidentDocMime(v: unknown): v is ResidentDocMime {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(MIME_EXT, v)
}

export function residentDocKindLabel(kind: ResidentDocKind): string {
  return RESIDENT_DOC_KINDS.find(k => k.value === kind)?.label ?? 'Altro'
}

export function residentDocExtension(mime: ResidentDocMime): string {
  return MIME_EXT[mime]
}

/**
 * Tipo da usare per il file scelto: quello dichiarato dal browser se è tra i 4,
 * altrimenti, solo se il browser non ne dichiara uno (stringa vuota o
 * octet-stream), quello dedotto dall'estensione. null = file non ammesso.
 * Il contenuto vero si controlla comunque sui magic bytes dopo l'upload.
 */
export function resolveResidentDocMime(declaredType: string, fileName: string): ResidentDocMime | null {
  if (isResidentDocMime(declaredType)) return declaredType
  if (declaredType !== '' && declaredType !== 'application/octet-stream') return null
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase()
  return ext ? NAME_EXT_MIME[ext] ?? null : null
}

/** "214 KB", "1,1 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

export const RESIDENT_DOC_TYPE_ERROR =
  'Questo tipo di file non si può caricare. Usa un PDF oppure una foto JPG, PNG o WEBP.'

/**
 * Controllo del file dichiarato (tipo e dimensione), identico nel foglio e
 * nella server action. null = va bene; altrimenti il messaggio per l'utente.
 */
export function residentDocDeclaredError(mime: string | null, sizeBytes: number): string | null {
  if (!isResidentDocMime(mime)) return RESIDENT_DOC_TYPE_ERROR
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) return 'Il file è vuoto o non si legge. Scegline un altro.'
  if (sizeBytes > RESIDENT_DOC_MAX_BYTES) {
    return `Il file pesa ${formatFileSize(sizeBytes)}. Il massimo è 5 MB: prova con una foto più leggera o un PDF compresso.`
  }
  return null
}

/** Byte da leggere in testa al file per riconoscerlo. */
export const MAGIC_BYTES_NEEDED = 12

/**
 * Il contenuto corrisponde al tipo dichiarato?
 *  PDF  25 50 44 46 2D            "%PDF-"
 *  JPEG FF D8 FF
 *  PNG  89 50 4E 47 0D 0A 1A 0A
 *  WebP "RIFF" ???? "WEBP"
 */
export function matchesMagicBytes(mime: ResidentDocMime, head: Uint8Array): boolean {
  const starts = (sig: number[], at = 0) => head.length >= at + sig.length && sig.every((b, i) => head[at + i] === b)
  switch (mime) {
    case 'application/pdf':
      return starts([0x25, 0x50, 0x44, 0x46, 0x2d])
    case 'image/jpeg':
      return starts([0xff, 0xd8, 0xff])
    case 'image/png':
      return starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/webp':
      return starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)
  }
}

/**
 * Titolo sanificato: forma NFC, niente caratteri di controllo né di formato
 * (zero-width, override bidirezionali), spazi compressi, al massimo
 * RESIDENT_DOC_TITLE_MAX caratteri (punti di codice, mai mezzo surrogato).
 * Stringa vuota = titolo mancante.
 */
export function sanitizeResidentDocTitle(input: string): string {
  const cleaned = input
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return Array.from(cleaned).slice(0, RESIDENT_DOC_TITLE_MAX).join('').trim()
}

/**
 * Titolo proposto dal nome del file: senza cartelle né estensione, trattini
 * bassi e trattini come spazi, sanificato, iniziale maiuscola.
 * "ricevuta-filtri_vmc.pdf" → "Ricevuta filtri vmc".
 */
export function titleFromFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? ''
  const noExt = base.replace(/\.[^.]*$/, '')
  const title = sanitizeResidentDocTitle(noExt.replace(/[_-]+/g, ' '))
  return title.replace(/^\p{Ll}/u, c => c.toLocaleUpperCase('it'))
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const UUID_RE = new RegExp(`^${UUID}$`)

export function isLowerUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

/** `{unit_id}/{uuid}.{ext}`, o null se uno dei due id non è un uuid minuscolo. */
export function residentDocPath(unitId: string, objectId: string, mime: ResidentDocMime): string | null {
  if (!isLowerUuid(unitId) || !isLowerUuid(objectId)) return null
  return `${unitId}/${objectId}.${MIME_EXT[mime]}`
}

/**
 * Il path sta nella cartella di questa unità e ha l'estensione di questo tipo?
 * Stessa forma della regex di resident_documents_path_check.
 */
export function isResidentDocPathFor(path: string, unitId: string, mime: ResidentDocMime): boolean {
  if (!isLowerUuid(unitId)) return false
  return new RegExp(`^${unitId}/${UUID}\\.${MIME_EXT[mime]}$`).test(path)
}

/** Nome del file scaricato: titolo senza caratteri vietati nei nomi file + estensione. */
export function residentDocDownloadName(title: string, mime: ResidentDocMime): string {
  const base = sanitizeResidentDocTitle(title).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
  return `${base || 'documento'}.${MIME_EXT[mime]}`
}
