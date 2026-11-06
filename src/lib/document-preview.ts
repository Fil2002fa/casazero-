/**
 * Come si mostra l'anteprima di un documento (E1b): dal percorso nello storage
 * si ricava se è un PDF (viewer nativo del browser), un'immagine (<img>) o un
 * formato senza anteprima (Word). Modulo puro, verificato da
 * scripts/verify-document-preview.mjs.
 *
 * Si decide dall'estensione del percorso, non dal nome mostrato: il percorso è
 * quello che lo storage serve davvero, e il bucket accetta solo i formati di
 * ALLOWED_DOCUMENT_MIME (document-upload.ts).
 */
export type PreviewKind = 'pdf' | 'image' | 'unsupported'

/** Durata della signed URL di anteprima: breve, ne esce una nuova a ogni apertura. */
export const PREVIEW_URL_TTL_SECONDS = 120

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])

export function previewKind(storagePath: string): PreviewKind {
  const name = storagePath.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  if (dot < 0) return 'unsupported'
  const ext = name.slice(dot + 1).toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  return 'unsupported'
}
