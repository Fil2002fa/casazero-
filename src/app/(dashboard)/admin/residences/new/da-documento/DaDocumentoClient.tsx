'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, FileText } from 'lucide-react'
import { extractPdfText } from '@/lib/pdf-text'
import type { ConditionalTemplate, ResidenceDraft } from '@/lib/residence-draft'
import { ResidenceReview } from './ResidenceReview'

type Phase = 'upload' | 'reading' | 'analyzing' | 'review'

const GENERIC_ERROR = 'Errore nell\'analisi del documento, riprova'

// Ingresso "Da documento": sceglie il PDF, ne estrae il testo NEL BROWSER
// (il file non lascia mai il computer), manda al server solo il testo e mostra
// la bozza per la revisione. Fino al clic "Crea residenza" nulla arriva a DB.
export function DaDocumentoClient({
  templates,
  existingAddresses,
}: {
  templates: ConditionalTemplate[]
  existingAddresses: string[]
}) {
  const [phase, setPhase] = useState<Phase>('upload')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [draft, setDraft] = useState<ResidenceDraft | null>(null)
  const [fileName, setFileName] = useState('')
  const [partialReadNote, setPartialReadNote] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reviewing = phase === 'review' && draft !== null

  async function analyze(file: File) {
    setError(null)
    setNotice(null)
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setError('Il file deve essere un PDF.')
      return
    }
    setFileName(file.name)

    setPhase('reading')
    const extracted = await extractPdfText(await file.arrayBuffer())
    if (!extracted.ok) {
      setError(extracted.message)
      setPhase('upload')
      return
    }

    // Letto solo in parte: le dotazioni "non trovate" potrebbero stare nel resto.
    setPartialReadNote(
      extracted.truncatedByPages || extracted.truncatedByChars
        ? `Il documento è stato letto solo in parte (${extracted.pagesRead} pagine su ${extracted.totalPages}${extracted.truncatedByChars ? ', testo tagliato al limite' : ''}): ciò che risulta "non trovato" potrebbe stare nella parte non letta.`
        : null,
    )

    setPhase('analyzing')
    try {
      const res = await fetch('/api/residence-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: extracted.text }),
      })
      // Sessione scaduta: il middleware reindirizza al login e la risposta non
      // è JSON. È un guasto, non un esito di dominio: si dice di ricaricare.
      const body = await res.json().catch(() => null) as { draft?: ResidenceDraft; error?: string } | null
      if (!res.ok) {
        setError(body?.error ?? GENERIC_ERROR)
        setPhase('upload')
        return
      }
      if (!body?.draft) {
        setError('Risposta non valida dal server (sessione scaduta?). Ricarica la pagina e riprova.')
        setPhase('upload')
        return
      }
      setDraft(body.draft)
      setPhase('review')
    } catch (err) {
      console.error('[da-documento] chiamata fallita', err)
      setError(GENERIC_ERROR)
      setPhase('upload')
    }
  }

  function discard(message: string | null) {
    setDraft(null)
    setPartialReadNote(null)
    setNotice(message)
    setPhase('upload')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin/residences/new"
          // La bozza vive solo in questa pagina: l'avviso del browser non
          // scatta sui link interni, quindi lo chiede il link stesso.
          onClick={e => {
            if (reviewing && !window.confirm('Scartare la bozza e tornare alla creazione manuale?')) e.preventDefault()
          }}
          className="text-text-secondary p-1 -ml-1 rounded-lg"
          aria-label="Torna alla creazione manuale"
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={1.6} />
        </Link>
        <div>
          <h1 className="text-base font-medium text-text-primary">Nuova residenza da documento</h1>
          <p className="text-xs text-text-secondary">
            {reviewing ? `Revisione della bozza · ${fileName}` : 'Carica un PDF: la bozza si rivede prima di creare'}
          </p>
        </div>
      </div>

      {notice && (
        <div className="bg-brand-light rounded-xl p-3 mb-5">
          <p className="text-sm text-brand-dark">{notice}</p>
        </div>
      )}

      {reviewing ? (
        <ResidenceReview
          draft={draft}
          templates={templates}
          existingAddresses={existingAddresses}
          partialReadNote={partialReadNote}
          onDiscard={discard}
        />
      ) : (
        <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
          <h2 className="text-sm font-medium text-text-primary">Documento</h2>
          <p className="text-xs text-text-secondary">
            Capitolato, relazione tecnica, agibilità o attestato energetico. Il PDF viene letto nel
            tuo browser e al servizio di analisi arriva solo il testo; non viene salvato da nessuna parte.
            Fino al clic su &quot;Crea residenza&quot; non esiste nulla nel sistema.
          </p>
          <label className="flex items-center gap-2 text-sm text-brand-medium font-medium cursor-pointer">
            <FileText className="w-4 h-4" strokeWidth={1.8} />
            <span>{phase === 'upload' ? 'Scegli un PDF' : 'Analisi in corso…'}</span>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              disabled={phase !== 'upload'}
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) void analyze(file)
              }}
              className="sr-only"
            />
          </label>
          {phase === 'reading' && <p className="text-xs text-text-secondary">Lettura del PDF nel browser…</p>}
          {phase === 'analyzing' && (
            <p className="text-xs text-text-secondary">Analisi del documento: può richiedere fino a un minuto.</p>
          )}
          {error && (
            <div className="bg-semantic-red-bg border border-semantic-red/20 rounded-xl p-3">
              <p className="text-sm text-semantic-red">{error}</p>
            </div>
          )}
          <p className="text-xs text-text-secondary">
            Preferisci compilare a mano?{' '}
            <Link href="/admin/residences/new" className="text-brand-medium font-medium">Creazione manuale</Link>
          </p>
        </section>
      )}
    </>
  )
}
