'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, FileText, Loader2 } from 'lucide-react'
import type { PreviewKind } from '@/lib/document-preview'
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
        {state.status === 'ready' && state.kind === 'pdf' && (
          <iframe src={state.url} title={`Anteprima: ${title}`} className="w-full h-full" />
        )}
        {state.status === 'ready' && state.kind === 'image' && (
          // Signed URL a scadenza breve: next/image non serve e non va ottimizzata.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.url} alt={`Anteprima: ${title}`} className="w-full h-full object-contain" />
        )}
        {state.status === 'ready' && state.kind === 'unsupported' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <FileText className="w-6 h-6 text-text-secondary" strokeWidth={1.6} aria-hidden="true" />
            <p className="text-sm text-text-secondary">
              Anteprima non disponibile per questo formato. Puoi aprire o scaricare il file.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={openFullScreen}
          disabled={!canOpen || opening}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-medium hover:underline disabled:opacity-50 disabled:no-underline"
        >
          <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.8} aria-hidden="true" />
          {opening ? 'Apertura…' : 'Apri a schermo intero'}
        </button>
        {openError && <p role="alert" className="text-xs text-semantic-red">{openError}</p>}
      </div>
    </div>
  )
}
