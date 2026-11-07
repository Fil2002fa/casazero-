'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown } from 'lucide-react'
import { setChecklistException, clearChecklistException } from './actions'
import { commonScopeLabel, type CommonDocumentRow, type CommonDocuments } from '@/lib/common-documents'
import type { ChecklistExpectation } from '@/lib/document-checklist'
import { SISTEMA_LABELS } from '@/lib/document-classification'
import { formatDateIT } from '@/lib/formatDate'
import { pluralize } from '@/lib/pluralize'

// Tab "Parti comuni" (E1b, commit 9): i documenti attesi della residenza non
// legati a un'unità. Prima erano la lista "Da caricare" in fondo alla pagina,
// che ora sta qui e non altrove. Un solo componente per admin e super_admin: si
// ramifica solo su canManageChecklist, che apre "Non applicabile" e "Annulla
// esclusione" (RLS 027, solo super_admin; il vincolo vero è server-side).
//
// Quali righe, in che ordine e quale documento apre ciascuna lo decide
// common-documents.ts (verify:common): qui solo lo schermo. Il contatore del
// tab e quello di questa pagina vengono dallo stesso risultato.
//
// Riga caricata: tutta la riga apre il pannello laterale. Il click vive sul <li>;
// il bottone col nome serve alla tastiera e agli screen reader (Invio e Spazio
// generano un click che risale alla riga): nessun elemento interattivo ne
// contiene un altro. Le azioni di riga (Non applicabile) stanno in un
// contenitore fratello che ferma la propagazione, come in ReviewList.
// Se la checklist cita un documento che la lista non ha più (le due letture sono
// separate) la riga resta "caricata" ma non è cliccabile: niente bottone, niente
// apertura. Si risistema al prossimo refresh.

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium'

export function CommonDocumentsList({ result, residenceId, unclassifiedCount, markedByNames, canManageChecklist, selectedId, onOpen }: {
  // null = lettura della checklist fallita: mai "niente da caricare".
  result: CommonDocuments | null
  residenceId: string
  unclassifiedCount: number
  markedByNames: Record<string, string | null>
  canManageChecklist: boolean
  selectedId: string | null
  onOpen: (id: string) => void
}) {
  const router = useRouter()
  const [excludedOpen, setExcludedOpen] = useState(false)

  if (result === null) {
    return (
      <section className="bg-surface rounded-xl border border-border p-4 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-medium text-text-primary">Documenti da caricare non disponibili</h2>
          <p className="text-xs text-text-secondary">
            Non riusciamo a caricare l&apos;elenco in questo momento. I tuoi documenti sono al sicuro.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="flex-shrink-0 px-3 py-2 border border-brand-medium rounded-lg text-xs font-medium text-brand-dark"
        >
          Riprova
        </button>
      </section>
    )
  }

  return (
    <section className="space-y-3" aria-label="Parti comuni">
      <div className="space-y-0.5">
        <p className="text-xs text-text-secondary">
          Documenti della residenza, non legati a un’unità. Prima erano la lista Da caricare in fondo alla pagina.
        </p>
        <p className="text-xs font-medium text-text-secondary" aria-live="polite">
          Caricati: {result.loaded}/{result.total}
        </p>
      </div>

      {/* Qualificano la lista (o la sua assenza): un documento non ancora
          classificato può coprire una voce mancante. */}
      {unclassifiedCount > 0 && (
        <p className="text-xs text-text-secondary bg-background rounded-lg px-3 py-2">
          {pluralize(unclassifiedCount, 'documento non ancora classificato', 'documenti non ancora classificati')}
          {' '}— l&apos;elenco potrebbe cambiare.
        </p>
      )}
      {result.warnings.length > 0 && (
        <div className="text-xs text-neutral-600 bg-background rounded-lg px-3 py-2 space-y-0.5">
          {result.warnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}

      {result.rows.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-text-secondary">Nessun documento atteso per questa residenza.</p>
        </div>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2 items-start">
          {result.rows.map(row => (
            <CommonRow
              key={row.key}
              row={row}
              residenceId={residenceId}
              canManageChecklist={canManageChecklist}
              selected={row.doc !== null && row.doc.id === selectedId}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}

      {/* Una esclusione è una decisione del costruttore che deve restare visibile
          e reversibile: sezione compressa in coda, anche quando non resta altro. */}
      {result.excluded.length > 0 && (
        <section className="bg-surface rounded-xl border border-border">
          <button
            type="button"
            onClick={() => setExcludedOpen(v => !v)}
            aria-expanded={excludedOpen}
            className={`w-full flex items-center gap-2 px-4 py-3 text-left rounded-xl ${FOCUS}`}
          >
            <ChevronDown
              className={`w-3.5 h-3.5 flex-shrink-0 text-text-secondary transition-transform ${excludedOpen ? 'rotate-180' : ''}`}
              strokeWidth={1.8}
            />
            <span className="text-sm text-text-secondary">
              Escluse dalla consegna ({result.excluded.length})
            </span>
          </button>
          {excludedOpen && (
            <div className="px-4 pb-3 pl-10">
              {result.excluded.map(exp => (
                <ExcludedRow
                  key={exp.expectationKey}
                  exp={exp}
                  residenceId={residenceId}
                  markedByNames={markedByNames}
                  canManageChecklist={canManageChecklist}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </section>
  )
}

// Una voce attesa. Caricata: verde chiaro, spunta, nome della voce, nome del file
// in piccolo, "Apri" come etichetta visiva della riga. Mancante: pallino
// tratteggiato, nome della voce, "Da caricare". La nota di "Non applicabile" si
// precompila da exp.note a ogni apertura del form, non solo al mount: l'action fa
// upsert e un form vuoto cancellerebbe una nota già presente.
function CommonRow({ row, residenceId, canManageChecklist, selected, onOpen }: {
  row: CommonDocumentRow
  residenceId: string
  canManageChecklist: boolean
  selected: boolean
  onOpen: (id: string) => void
}) {
  const router = useRouter()
  const exp = row.expectation
  const [showForm, setShowForm] = useState(false)
  const [note, setNote] = useState(exp.note ?? '')
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const trimmedNote = note.trim()

  const loaded = row.state === 'caricato'
  const doc = row.doc
  // Apre solo una riga caricata che ha davvero un documento.
  const openable = loaded && doc !== null
  const showManage = canManageChecklist && !loaded

  function openForm() {
    setNote(exp.note ?? '')
    setActionError(null)
    setShowForm(true)
  }

  async function handleConfirmException() {
    setPending(true)
    setActionError(null)
    const res = await setChecklistException(residenceId, exp.expectationKey, trimmedNote)
    setPending(false)
    if ('error' in res) {
      setActionError(res.error)
      return
    }
    setShowForm(false)
    router.refresh()
  }

  const base = loaded
    ? 'border-brand-medium/30 bg-brand-light/50'
    : 'border-dashed border-border bg-surface'
  const interactive = openable ? 'cursor-pointer hover:border-brand-medium hover:shadow-sm transition-shadow' : ''

  const content = (
    <>
      <span className="mt-0.5 flex-shrink-0" aria-hidden="true">
        {loaded
          ? <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-dark text-white"><Check className="h-3 w-3" strokeWidth={2.4} /></span>
          : <span className="block h-4 w-4 rounded-full border border-dashed border-text-secondary" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-text-primary break-words">{row.label}</span>
        {row.scopeLabel && (
          <span className="block text-xs text-text-secondary">{row.scopeLabel}</span>
        )}
        {loaded
          ? doc && <span className="block text-xs text-text-secondary break-all">{doc.file_name}</span>
          : <span className="block text-xs text-text-secondary">Da caricare</span>}
      </span>
      {openable && (
        <span className="flex-shrink-0 text-xs font-medium text-brand-dark" aria-hidden="true">Apri</span>
      )}
    </>
  )

  return (
    <li
      onClick={openable ? () => onOpen(doc.id) : undefined}
      className={`rounded-lg border p-3 ${base} ${interactive} ${selected ? 'ring-2 ring-brand-medium' : ''}`}
    >
      {openable ? (
        <button
          type="button"
          aria-pressed={selected}
          aria-label={`${row.label}, caricato${row.scopeLabel ? `, ${row.scopeLabel}` : ''}, ${doc.file_name}. Apri il documento`}
          className={`flex w-full items-start gap-2.5 text-left rounded ${FOCUS}`}
        >
          {content}
        </button>
      ) : (
        <div className="flex items-start gap-2.5">{content}</div>
      )}

      {/* Le azioni non aprono il pannello: il contenitore ferma il clic. */}
      {showManage && (
        <div className="mt-2 pl-[1.625rem] cursor-default" onClick={e => e.stopPropagation()}>
          {!showForm && (
            <button
              type="button"
              onClick={openForm}
              aria-label={`Segna non applicabile: ${row.label}`}
              className={`inline-flex items-center h-8 max-lg:h-11 px-3 rounded-lg border border-border bg-surface text-xs font-medium text-brand-medium hover:bg-background transition-colors ${FOCUS}`}
            >
              Non applicabile
            </button>
          )}
          {showForm && (
            <div className="space-y-2 text-xs text-text-secondary">
              <div className="space-y-1">
                <label htmlFor={`note-${exp.expectationKey}`} className="block">Motivazione</label>
                <textarea
                  id={`note-${exp.expectationKey}`}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={2}
                  className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                />
              </div>
              <div className="flex gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setActionError(null) }}
                  disabled={pending}
                  className={`flex-1 max-lg:h-11 border border-border rounded-lg py-1.5 text-text-secondary disabled:opacity-50 ${FOCUS}`}
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleConfirmException}
                  disabled={pending || trimmedNote.length === 0}
                  className={`flex-1 max-lg:h-11 bg-brand-dark text-white rounded-lg py-1.5 font-medium disabled:opacity-50 ${FOCUS}`}
                >
                  {pending ? 'Salvataggio…' : 'Conferma'}
                </button>
              </div>
              {actionError && <p className="text-status-overdue">{actionError}</p>}
            </div>
          )}
        </div>
      )}
    </li>
  )
}

// Voce esclusa: nome, ambito, motivazione PRIMA dell'attribuzione (chi legge
// vuole sapere perché prima di chi). Fallback "dato non tracciato" solo quando
// marcatore e data sono entrambi assenti (riga pre-028). expected_from legacy in
// sola lettura, mai riscritto. "Annulla esclusione" riservata al costruttore;
// motivazione e attribuzione leggibili anche all'admin, perché spiegano
// un'assenza dalla lista.
function ExcludedRow({ exp, residenceId, markedByNames, canManageChecklist }: {
  exp: ChecklistExpectation
  residenceId: string
  markedByNames: Record<string, string | null>
  canManageChecklist: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleClearException() {
    setPending(true)
    setActionError(null)
    const res = await clearChecklistException(residenceId, exp.expectationKey)
    setPending(false)
    if ('error' in res) {
      setActionError(res.error)
      return
    }
    router.refresh()
  }

  const attribution = exp.markedBy === null && exp.markedAt === null
    ? 'Esclusa · dato non tracciato'
    : `Esclusa da ${exp.markedBy ? (markedByNames[exp.markedBy] ?? 'utente sconosciuto') : '—'} · ${
        exp.markedAt ? formatDateIT(exp.markedAt) : '—'
      }`
  const scope = commonScopeLabel(exp.scope)

  return (
    <div className="border-b border-border last:border-b-0 py-2.5 space-y-1">
      <div className="flex items-center gap-3 max-lg:flex-wrap max-lg:gap-y-1">
        <span className="flex-1 min-w-0 max-lg:basis-full text-sm text-text-primary break-words lg:truncate">{exp.label}</span>
        {(scope || exp.sistema) && (
          <span className="flex-shrink-0 max-lg:shrink max-lg:min-w-0 max-lg:line-clamp-2 max-lg:break-words text-xs text-text-secondary">
            {scope}
            {scope && exp.sistema && ' · '}
            {exp.sistema && SISTEMA_LABELS[exp.sistema]}
          </span>
        )}
      </div>
      <div className="text-xs text-text-secondary space-y-0.5">
        {exp.note && <p className="text-text-primary">{exp.note}</p>}
        {exp.expectedFrom && <p>Atteso da: <span className="text-text-primary">{exp.expectedFrom}</span></p>}
        <p>{attribution}</p>
        {canManageChecklist && (
          <button
            type="button"
            onClick={handleClearException}
            disabled={pending}
            className={`text-brand-medium font-medium hover:underline disabled:opacity-50 rounded ${FOCUS}`}
          >
            {pending ? 'Attendere…' : 'Annulla esclusione'}
          </button>
        )}
        {actionError && <p className="text-status-overdue">{actionError}</p>}
      </div>
    </div>
  )
}
