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
