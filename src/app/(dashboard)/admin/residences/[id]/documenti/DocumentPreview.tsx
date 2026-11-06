'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, FileText, Loader2 } from 'lucide-react'
import { pdfPreviewSrc, type PreviewKind } from '@/lib/document-preview'
import { getDocumentPreviewUrl } from './actions'

// Anteprima REALE del documento (E1b): PDF nel viewer nativo del browser,
// immagine in un <img>, altri formati (Word) senza anteprima. La signed URL la
// genera il server a ogni apertura e scade in pochi minuti; "Apri a schermo
// intero" ne chiede una NUOVA al clic, non riusa quella dell'iframe (che nel
// frattempo può essere scaduta). Un solo componente per admin e super_admin: il
// perimetro è nella action.

type PreviewState =
  | { status: 'loading' }
  | { status: 'ready'; url: string; kind: PreviewKind }
  | { status: 'error'; message: string }

export function DocumentPreview({ documentId, title, className = 'h-[60vh]' }: {
  documentId: string
  title: string
  className?: string
}) {
  const [state, setState] = useState<PreviewState>({ status: 'loading' })
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    getDocumentPreviewUrl({ documentId })
      .then(res => {
        if (cancelled) return
        if ('error' in res) setState({ status: 'error', message: res.error })
        else setState({ status: 'ready', url: res.url, kind: res.kind })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', message: 'Anteprima non disponibile per un problema di connessione, riprova.' })
      })
    return () => { cancelled = true }
  }, [documentId, attempt])

  // La scheda si apre SUBITO nel gesto del clic (altrimenti il browser blocca il
  // popup), poi riceve l'indirizzo della signed URL appena generata.
  async function openFullScreen() {
    setOpening(true)
    setOpenError(null)
    const tab = window.open('', '_blank')
    try {
      const res = await getDocumentPreviewUrl({ documentId })
      if ('error' in res) {
        tab?.close()
        setOpenError(res.error)
        return
      }
      if (tab) {
        tab.opener = null
        tab.location.href = res.url
      } else {
        setOpenError('Il browser ha bloccato la nuova scheda: consenti i popup per questo sito.')
      }
    } catch {
      tab?.close()
      setOpenError('Non riesco ad aprire il documento per un problema di connessione, riprova.')
    } finally {
      setOpening(false)
    }
  }

  const canOpen = state.status === 'ready'

  return (
    <div className="space-y-2">
      <div className={`relative w-full rounded-lg border border-border bg-background overflow-hidden ${className}`}>
        {state.status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center text-text-secondary" role="status">
            <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.8} aria-hidden="true" />
            <span className="sr-only">Caricamento anteprima</span>
          </div>
        )}
        {state.status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center" role="alert">
            <p className="text-sm text-text-secondary">{state.message}</p>
            <button
              type="button"
              onClick={() => setAttempt(n => n + 1)}
              className="px-3 py-2 border border-brand-medium rounded-lg text-xs font-medium text-brand-dark"
            >
              Riprova
            </button>
          </div>
        )}
        {/* L'anteprima è solo da guardare: l'iframe non riceve né mouse né focus
            (nessuno scroll dentro), e l'intera area è coperta dal bottone qui
            sotto. Il bottone è un FRATELLO dell'iframe, mai suo genitore: un
            elemento interattivo dentro un button non è HTML valido. */}
        {state.status === 'ready' && state.kind === 'pdf' && (
          <iframe
            src={pdfPreviewSrc(state.url)}
            title={`Anteprima: ${title}`}
            tabIndex={-1}
            scrolling="no"
            aria-hidden="true"
            className="w-full h-full pointer-events-none"
          />
        )}
        {state.status === 'ready' && state.kind === 'image' && (
          // Signed URL a scadenza breve: next/image non serve e non va ottimizzata.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.url} alt="" aria-hidden="true" className="w-full h-full object-contain pointer-events-none" />
        )}
        {state.status === 'ready' && state.kind === 'unsupported' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <FileText className="w-6 h-6 text-text-secondary" strokeWidth={1.6} aria-hidden="true" />
            <p className="text-sm text-text-secondary">
              Anteprima non disponibile per questo formato. Clicca per aprire il file.
            </p>
          </div>
        )}

        {canOpen && (
          <button
            type="button"
            onClick={openFullScreen}
            disabled={opening}
            aria-label={`Apri a schermo intero: ${title}`}
            className="group absolute inset-0 w-full h-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-medium disabled:cursor-wait"
          >
            <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/45 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <ExternalLink className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
              {opening ? 'Apertura…' : 'Apri a schermo intero'}
            </span>
          </button>
        )}
      </div>

      {openError && <p role="alert" className="text-xs text-semantic-red">{openError}</p>}
    </div>
  )
}
