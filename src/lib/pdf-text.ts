// Estrazione del testo di un PDF, NEL BROWSER, per la residenza da documento.
//
// Il PDF non lascia il browser: al server arriva solo il testo (piano
// docs/handoffs/residenza-da-documento-piano.md, §3). Niente file su storage,
// niente file orfani, niente limite di 4,5 MB sul corpo della richiesta.
//
// `pdfjs-dist` è caricato con import() DINAMICO dentro il loader di default:
// chi importa questo modulo non paga il peso della libreria finché non
// estrae davvero un PDF. Non aggiungere mai un `import ... from 'pdfjs-dist'`
// statico qui o altrove (lo guarda verify:pdftext).
//
// Il caricatore è iniettabile (opts.loader) perché in Node (verify) serve la
// build "legacy" di pdfjs, mentre nel browser serve quella standard con il
// worker servito da bundler.

// ---- Tetti e soglie -------------------------------------------------------

export const PDF_TEXT_LIMITS = {
  // Oltre questa dimensione il file non viene nemmeno aperto.
  maxBytes: 25 * 1024 * 1024,
  // Un capitolato di 40 pagine ne usa circa la metà.
  maxPages: 100,
  // ~150.000 caratteri ≈ 40.000 token: tetto sul costo della chiamata AI.
  maxChars: 150_000,
  // Sotto questa media di caratteri non-spazio per pagina il PDF è una
  // scansione (immagini senza testo): vedi isScannedText.
  minCharsPerPage: 40,
} as const

export type PdfTextLimits = {
  maxBytes: number
  maxPages: number
  maxChars: number
  minCharsPerPage: number
}

// ---- Esito ----------------------------------------------------------------

export type PdfTextFailureReason = 'too_large' | 'encrypted' | 'scanned' | 'unreadable'

export type PdfTextResult =
  | {
      ok: true
      text: string
      totalPages: number
      pagesRead: number
      // Pagine lette senza alcun testo (immagini, pagine vuote).
      emptyPages: number
      truncatedByPages: boolean
      truncatedByChars: boolean
    }
  | { ok: false; reason: PdfTextFailureReason; message: string }

// Messaggi per l'utente. Il fallimento tecnico ("unreadable") non si finge
// mai un esito di dominio: dice di riprovare, mentre la scansione dice cosa fare.
export const PDF_TEXT_MESSAGES: Record<PdfTextFailureReason, string> = {
  too_large: 'Il file è troppo grande per essere letto qui. Usa la creazione manuale.',
  encrypted: 'Il PDF è protetto da password. Rimuovi la protezione o usa la creazione manuale.',
  scanned: 'Nessun testo leggibile: il PDF sembra una scansione. Usa la creazione manuale.',
  unreadable: 'Non riesco a leggere il PDF. Riprova, o usa un altro file.',
}

// ---- Logica pura ----------------------------------------------------------

export function countNonWhitespace(s: string): number {
  return s.replace(/\s+/g, '').length
}

// Scansione = nessun testo o testo trascurabile: media di caratteri non-spazio
// per pagina LETTA sotto la soglia. Zero pagine lette conta come scansione.
export function isScannedText(
  nonWhitespaceChars: number,
  pagesRead: number,
  minCharsPerPage: number = PDF_TEXT_LIMITS.minCharsPerPage,
): boolean {
  if (pagesRead <= 0) return true
  return nonWhitespaceChars / pagesRead < minCharsPerPage
}

// Classifica un errore di pdfjs. Nome del campo, non instanceof: le classi di
// eccezione vivono nel modulo caricato dinamicamente.
export function classifyPdfError(err: unknown): PdfTextFailureReason {
  const name = typeof err === 'object' && err !== null ? (err as { name?: unknown }).name : undefined
  if (name === 'PasswordException') return 'encrypted'
  return 'unreadable'
}

function fail(reason: PdfTextFailureReason): PdfTextResult {
  return { ok: false, reason, message: PDF_TEXT_MESSAGES[reason] }
}

// ---- Interfaccia minima di pdfjs ------------------------------------------

type PdfTextItem = { str?: unknown; hasEOL?: unknown }
type PdfPageLike = {
  getTextContent(): Promise<{ items: PdfTextItem[] }>
  cleanup?(): void
}
type PdfDocLike = {
  numPages: number
  getPage(n: number): Promise<PdfPageLike>
}
// In pdfjs-dist 6 destroy() sta sul loading task, non sul documento
// (PDFDocumentProxy.destroy non esiste più): chiuderlo libera anche il worker.
type PdfLoadingTaskLike = { promise: Promise<PdfDocLike>; destroy(): Promise<void> }
export type PdfjsLike = {
  getDocument(src: { data: Uint8Array }): PdfLoadingTaskLike
}

export type ExtractPdfTextOptions = {
  limits?: Partial<PdfTextLimits>
  loader?: () => Promise<PdfjsLike>
}

// Loader del browser: import dinamico + worker servito dal bundler.
async function defaultLoader(): Promise<PdfjsLike> {
  const pdfjs = await import('pdfjs-dist')
  if (typeof window !== 'undefined') {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()
  }
  return pdfjs as unknown as PdfjsLike
}

function pageText(items: PdfTextItem[]): string {
  let out = ''
  for (const it of items) {
    if (typeof it.str !== 'string') continue
    out += it.str
    out += it.hasEOL === true ? '\n' : ' '
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim()
}

// ---- Estrazione -----------------------------------------------------------

export async function extractPdfText(
  data: ArrayBuffer | Uint8Array,
  opts: ExtractPdfTextOptions = {},
): Promise<PdfTextResult> {
  const limits: PdfTextLimits = { ...PDF_TEXT_LIMITS, ...opts.limits }
  const loader = opts.loader ?? defaultLoader

  if (data.byteLength > limits.maxBytes) return fail('too_large')

  // pdfjs trasferisce il buffer al worker e lo svuota: lavora su una copia,
  // il chiamante conserva il suo.
  const bytes = new Uint8Array(data.byteLength)
  bytes.set(data instanceof Uint8Array ? data : new Uint8Array(data))

  let task: PdfLoadingTaskLike | null = null
  try {
    const pdfjs = await loader()
    task = pdfjs.getDocument({ data: bytes })
    const doc = await task.promise

    const totalPages = doc.numPages
    const pagesToRead = Math.min(totalPages, limits.maxPages)
    const parts: string[] = []
    let used = 0
    let nonWs = 0
    let pagesRead = 0
    let emptyPages = 0
    let truncatedByChars = false

    for (let n = 1; n <= pagesToRead; n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      page.cleanup?.()
      const body = pageText(content.items)
      pagesRead++
      const bodyNonWs = countNonWhitespace(body)
      nonWs += bodyNonWs
      if (bodyNonWs === 0) {
        emptyPages++
        continue
      }
      const chunk = `[pagina ${n}]\n${body}\n\n`
      const room = limits.maxChars - used
      if (chunk.length > room) {
        parts.push(chunk.slice(0, Math.max(0, room)))
        used = limits.maxChars
        truncatedByChars = true
        break
      }
      parts.push(chunk)
      used += chunk.length
    }

    if (isScannedText(nonWs, pagesRead, limits.minCharsPerPage)) return fail('scanned')

    return {
      ok: true,
      text: parts.join('').trimEnd(),
      totalPages,
      pagesRead,
      emptyPages,
      truncatedByPages: totalPages > pagesToRead,
      truncatedByChars,
    }
  } catch (err) {
    const reason = classifyPdfError(err)
    // Fallimento tecnico: resta traccia per chi apre la console, ma l'utente
    // riceve il messaggio del suo caso, non un esito di dominio inventato.
    console.error('[pdf-text] lettura fallita:', err)
    return fail(reason)
  } finally {
    if (task) {
      try {
        await task.destroy()
      } catch (e) {
        console.error('[pdf-text] destroy fallito:', e)
      }
    }
  }
}
