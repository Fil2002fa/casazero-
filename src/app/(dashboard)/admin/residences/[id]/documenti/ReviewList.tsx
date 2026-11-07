'use client'

import { DOC_TYPE_LABELS, SISTEMA_LABELS } from '@/lib/document-classification'
import { type DocRow, type UnitRow } from '@/lib/document-rows'
import { readInDocumentText } from '@/lib/document-panel'
import { reviewProposal, type ReviewProposal } from '@/lib/document-review'
import { humanizeDocumentTitle } from '@/lib/documentTitle'
import { pluralize } from '@/lib/pluralize'

// Tab "Da rivedere" (E1b, 8c): i documenti senza unità e non ignorati, con la
// proposta di unità se c'è. Un solo componente per admin e super_admin. Che cosa
// sta nell'elenco e in che ordine lo decide document-review.ts
// (verify:docreview): qui solo lo schermo. `docs` arriva già filtrato e ordinato.
//
// Tutta la riga apre il pannello laterale. Il click vive sulla <li>; il bottone
// col nome serve alla tastiera e agli screen reader (Invio e Spazio generano un
// click che risale alla riga): nessun elemento interattivo ne contiene un altro.
// Le azioni di riga (Accetta, Cambia, Ignora) stanno in un contenitore che ferma
// la propagazione: arrivano in 8d.
//
// Alta è la sola fascia in brand: Media e Bassa sono neutre. L'ambra è di "Da
// verificare" (classificazione aperta), non si usa qui.

const BAND_PILL: Record<ReviewProposal['confidence'], string> = {
  alta: 'bg-brand-light text-brand-dark',
  media: 'bg-neutral-600/7 text-neutral-600',
  bassa: 'bg-neutral-600/7 text-neutral-600',
}

export function ReviewList({ docs, units, selectedId, onOpen }: {
  docs: readonly DocRow[]
  units: readonly UnitRow[]
  selectedId: string | null
  onOpen: (id: string) => void
}) {
  return (
    <section className="space-y-3" aria-label="Documenti da rivedere">
      <p className="text-xs text-text-secondary" aria-live="polite">
        {docs.length === 0
          ? 'Nessun documento da rivedere.'
          : `${pluralize(docs.length, 'documento senza unità', 'documenti senza unità')}. La proposta è un suggerimento: non assegna niente finché non la accetti.`}
      </p>

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
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
