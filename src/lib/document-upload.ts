// Unica fonte di verità per i vincoli di upload documenti (tipo/dimensione),
// condivisa tra la server action ('use server' non può esportare costanti,
// solo funzioni async) e il componente client che avvia i task di upload.
export const ALLOWED_DOCUMENT_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export const MAX_DOCUMENT_SIZE = 52428800 // 50 MB

// Limite request dell'API Anthropic per un documento PDF in base64 (non il
// limite applicativo di upload sopra). Usato dalle route che inviano il PDF
// al modello (extract-document; classify-document ne tiene ancora una copia
// locale identica — candidata a migrare qui in un commit di sola pulizia,
// perché quella route resta byte-identica per decisione del 18/09).
export const MAX_PDF_BYTES_FOR_API = 32 * 1024 * 1024

// documents può contenere anche immagini/Word (ALLOWED_DOCUMENT_MIME): le
// route AI accettano solo PDF e verificano i magic bytes prima di spendere
// una chiamata — un file non-PDF inviato come 'application/pdf' produrrebbe
// un 400 dall'API a ogni tentativo, mai un esito risolvibile.
const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46] // %PDF

export function hasPdfMagicBytes(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false
  const bytes = new Uint8Array(buffer, 0, 4)
  return PDF_MAGIC_BYTES.every((b, i) => bytes[i] === b)
}
