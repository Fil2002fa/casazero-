'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import { dismissDocumentUnitProposal, setDocumentUnit } from './actions'
import { DOC_TYPE_LABELS, SISTEMA_LABELS } from '@/lib/document-classification'
import { type DocRow, type UnitRow } from '@/lib/document-rows'
import { readInDocumentText } from '@/lib/document-panel'
import { acceptAllCandidates, reviewProposal, summarizeAcceptAll, type ReviewProposal } from '@/lib/document-review'
import { runUnitAssignments, sortedUnits } from '@/lib/document-table'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import { humanizeDocumentTitle } from '@/lib/documentTitle'
import { pluralize } from '@/lib/pluralize'

// Tab "Da rivedere" (E1b, 8c e 8d): i documenti senza unità e non ignorati, con la
// proposta di unità se c'è. Un solo componente per admin e super_admin. Che cosa
// sta nell'elenco e in che ordine lo decide document-review.ts
// (verify:docreview): qui solo lo schermo. `docs` arriva già filtrato e ordinato.
//
// Tutta la riga apre il pannello laterale. Il click vive sulla <li>; il bottone
// col nome serve alla tastiera e agli screen reader (Invio e Spazio generano un
// click che risale alla riga): nessun elemento interattivo ne contiene un altro.
// Le azioni di riga stanno in un contenitore che ferma la propagazione.
//
// Azioni (8d). Accetta: assegna l'unità proposta. Cambia: select inline con
// Conferma, parte dalla proposta se c'è. Ignora: lascia il documento senza unità
// e non lo ripropone (nessun Annulla). Senza proposta: solo Cambia e Ignora.
// "Accetta tutte ad alta confidenza": nessuna finestra di conferma, solo le
// proposte in fascia Alta (acceptAllCandidates); stesso ciclo della tabella
// (runUnitAssignments, setDocumentUnit senza rigenerare la pagina a ogni passo),
// un solo refresh e un solo toast, persistente se ci sono falliti. Un solo lavoro
// alla volta: mentre ne gira uno tutti i bottoni sono disabilitati.
//
// Alta è la sola fascia in brand: Media e Bassa sono neutre. L'ambra è di "Da
// verificare" (classificazione aperta), non si usa qui.

const BAND_PILL: Record<ReviewProposal['confidence'], string> = {
  alta: 'bg-brand-light text-brand-dark',
  media: 'bg-neutral-600/7 text-neutral-600',
  bassa: 'bg-neutral-600/7 text-neutral-600',
}

const BTN_BASE = 'rounded-xl px-3 py-1.5 text-sm font-medium disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium focus-visible:ring-offset-1'
const BTN_PRIMARY = `${BTN_BASE} bg-brand-dark text-white`
const BTN_SECONDARY = `${BTN_BASE} border border-brand-medium bg-surface text-brand-dark`
const BTN_QUIET = `${BTN_BASE} text-text-secondary hover:underline`

export function ReviewList({ docs, units, selectedId, onOpen }: {
  docs: readonly DocRow[]
  units: readonly UnitRow[]
  selectedId: string | null
  onOpen: (id: string) => void
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [working, setWorking] = useState<string | null>(null) // id del documento con un'azione in corso
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pick, setPick] = useState('')
  const busy = working !== null || progress !== null

  const unitLabels = new Map(units.map(u => [u.id, u.label]))
  const candidates = acceptAllCandidates(docs, units)

  function startChange(doc: DocRow, proposal: ReviewProposal | null) {
    setEditingId(doc.id)
    setPick(proposal?.unitId ?? '')
  }

  async function assignOne(doc: DocRow, unitId: string) {
    if (busy) return
    setWorking(doc.id)
    const res = await setDocumentUnit({ documentId: doc.id, unitId })
    setWorking(null)
    if ('error' in res) {
      showToast('error', `${humanizeDocumentTitle(doc.title)}: ${res.error}`, { persistent: true })
      return
    }
    showToast('success', `Documento assegnato a ${formatUnitLabel(unitLabels.get(unitId) ?? 'Unità')}.`)
    setEditingId(null)
    router.refresh()
  }

  async function ignoreOne(doc: DocRow) {
    if (busy) return
    setWorking(doc.id)
    const res = await dismissDocumentUnitProposal({ documentId: doc.id })
    setWorking(null)
    if ('error' in res) {
      showToast('error', `${humanizeDocumentTitle(doc.title)}: ${res.error}`, { persistent: true })
      return
    }
    showToast('success', 'Documento lasciato senza unità: non verrà più proposto.')
    if (editingId === doc.id) setEditingId(null)
    router.refresh()
  }

  async function acceptAll() {
    if (busy || candidates.length === 0) return
    const { failures } = await runUnitAssignments(
      candidates.map(c => ({ doc: c.doc, unitId: c.unitId })),
      input => setDocumentUnit({ ...input, revalidate: false }),
      (done, total) => setProgress({ done, total }),
    )
    setProgress(null)
    const summary = summarizeAcceptAll({ assigned: candidates.length - failures.length, failures })
    showToast(summary.kind, summary.message, summary.persistent ? { persistent: true } : undefined)
    router.refresh()
  }

  return (
    <section className="space-y-3" aria-label="Documenti da rivedere">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-xs text-text-secondary" aria-live="polite">
          {docs.length === 0
            ? 'Nessun documento da rivedere.'
            : `${pluralize(docs.length, 'documento senza unità', 'documenti senza unità')}. La proposta è un suggerimento: non assegna niente finché non la accetti.`}
        </p>
        {candidates.length > 0 && (
          <button
            type="button"
            onClick={acceptAll}
            disabled={busy}
            className={`${BTN_PRIMARY} ml-auto`}
          >
            {progress !== null
              ? `Assegno… (${progress.done}/${progress.total})`
              : `Accetta tutte ad alta confidenza (${candidates.length})`}
          </button>
        )}
      </div>

      {docs.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-text-secondary">
            Tutti i documenti di questa residenza hanno un’unità, oppure sono stati lasciati senza.
          </p>
        </div>
      ) : (
        <ul className="bg-surface rounded-xl border border-border divide-y divide-border">
          {docs.map(doc => {
            const open = doc.id === selectedId
            const proposal = reviewProposal(doc, units)
            const readText = readInDocumentText(doc)
            const editing = editingId === doc.id
            const mine = working === doc.id
            return (
              <li
                key={doc.id}
                onClick={() => onOpen(doc.id)}
                className={`cursor-pointer px-4 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl ${
                  open ? 'bg-brand-light/50' : 'hover:bg-background'
                }`}
              >
                <div className="grid gap-x-6 gap-y-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)] md:items-start">
                  <div className="min-w-0">
                    <button
                      type="button"
                      aria-pressed={open}
                      className="block max-w-full text-left text-sm font-medium text-text-primary break-words focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium rounded"
                    >
                      {humanizeDocumentTitle(doc.title)}
                    </button>
                    <span className="block text-xs text-text-secondary">
                      {doc.doc_type
                        ? <>
                            {DOC_TYPE_LABELS[doc.doc_type]}
                            {doc.sistema && <> · {SISTEMA_LABELS[doc.sistema]}</>}
                          </>
                        : '—'}
                    </span>
                  </div>

                  <p className="text-xs text-text-secondary min-w-0">
                    <span className="font-medium">Letto dall’AI: </span>
                    {readText === null
                      ? 'nessuna unità riportata'
                      : <span className="line-clamp-2 break-words" title={readText}>{readText}</span>}
                  </p>

                  <div className="min-w-0 text-sm">
                    {proposal === null ? (
                      <span className="text-text-secondary">Nessuna proposta</span>
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium text-text-primary">{proposal.unitLabel}</span>
                        <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${BAND_PILL[proposal.confidence]}`}>
                          {proposal.bandLabel}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Le azioni non aprono il pannello: il contenitore ferma il clic. */}
                <div
                  className="mt-2 flex flex-wrap items-center gap-2 cursor-default"
                  onClick={e => e.stopPropagation()}
                >
                  {editing ? (
                    <>
                      <select
                        value={pick}
                        onChange={e => setPick(e.target.value)}
                        disabled={busy}
                        aria-label={`Unità per ${humanizeDocumentTitle(doc.title)}`}
                        className="rounded-xl border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                      >
                        <option value="" disabled>Scegli unità…</option>
                        {sortedUnits(units).map(u => (
                          <option key={u.id} value={u.id}>{formatUnitLabel(u.label)}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => assignOne(doc, pick)}
                        disabled={busy || pick === ''}
                        className={BTN_PRIMARY}
                      >
                        {mine ? 'Assegno…' : 'Conferma'}
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} disabled={busy} className={BTN_QUIET}>
                        Annulla
                      </button>
                    </>
                  ) : (
                    <>
                      {proposal !== null && (
                        <button
                          type="button"
                          onClick={() => assignOne(doc, proposal.unitId)}
                          disabled={busy}
                          aria-label={`Accetta ${proposal.unitLabel} per ${humanizeDocumentTitle(doc.title)}`}
                          className={BTN_PRIMARY}
                        >
                          {mine ? 'Assegno…' : 'Accetta'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => startChange(doc, proposal)}
                        disabled={busy}
                        aria-label={`Cambia unità di ${humanizeDocumentTitle(doc.title)}`}
                        className={BTN_SECONDARY}
                      >
                        Cambia
                      </button>
                      <button
                        type="button"
                        onClick={() => ignoreOne(doc)}
                        disabled={busy}
                        aria-label={`Ignora ${humanizeDocumentTitle(doc.title)}`}
                        className={BTN_QUIET}
                      >
                        {mine ? 'Ignoro…' : 'Ignora'}
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
