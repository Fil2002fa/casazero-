'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createResidence } from '../actions'
import { RESIDENCE_FEATURES, type FeatureKey } from '@/lib/residence-features'
import { MAX_UNITS } from '@/lib/residence-input'
import { formatDateIT } from '@/lib/formatDate'
import { pluralize } from '@/lib/pluralize'
import {
  draftWarnings,
  effectiveAnswers,
  markUnresolvedAsNo,
  prepareDraftCreation,
  resolveFeatures,
  skippedItems,
  skippedItemsLine,
  type ConditionalTemplate,
  type DraftField,
  type DraftUnit,
  type FeatureAnswers,
  type ResidenceDraft,
} from '@/lib/residence-draft'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { CitationDetails, FieldProvenance } from '@/components/residence-wizard/FieldProvenance'
import { FeaturesSection } from '@/components/residence-wizard/FeaturesSection'
import { ResidenceDataSection } from '@/components/residence-wizard/ResidenceDataSection'
import { UnitListSection } from '@/components/residence-wizard/UnitListSection'
import { validateUnitRows, type UnitRow } from '@/components/residence-wizard/shared'

// Una riga della lista porta con sé la proposta da cui nasce (null = aggiunta
// a mano), così la provenienza resta attaccata alla riga anche se si
// rimuovono o si aggiungono altre righe.
type UnitEntry = { row: UnitRow; source: DraftField<DraftUnit> | null }

const FEATURE_LABEL = Object.fromEntries(
  RESIDENCE_FEATURES.map(f => [f.key, f.label]),
) as Record<FeatureKey, string>

function initialUnits(draft: ResidenceDraft): UnitEntry[] {
  return draft.units.flatMap(u =>
    u.state === 'non_trovato'
      ? []
      // Un piano che il documento non dà resta vuoto: la validazione lo
      // segnala, mai uno 0 inventato.
      : [{ row: { label: u.value.label, floor: u.value.floor === null ? '' : String(u.value.floor) }, source: u }],
  )
}

// Pagina di revisione a pagina intera. Stessi componenti del wizard manuale,
// alimentati dalla proposta; in più provenienza per campo, dotazioni a tre
// stati, avvisi e il conteggio delle voci che non nasceranno. La creazione
// passa dalla STESSA createResidence del wizard: nessun secondo percorso.
export function ResidenceReview({
  draft,
  templates,
  existingAddresses,
  partialReadNote,
  onDiscard,
}: {
  draft: ResidenceDraft
  templates: ConditionalTemplate[]
  existingAddresses: string[]
  partialReadNote: string | null
  onDiscard: (message: string | null) => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<UnitEntry[]>(() => initialUnits(draft))
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [listError, setListError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<FeatureAnswers>({})
  const [address, setAddress] = useState(draft.address.value ?? '')
  const [existingBuilding, setExistingBuilding] = useState(false)
  const [showDateWizard, setShowDateWizard] = useState(false)
  const [unitsAlreadyDelivered, setUnitsAlreadyDelivered] = useState(false)
  const [confirmNoOpen, setConfirmNoOpen] = useState(false)

  const formRef = useRef<HTMLFormElement>(null)
  // true solo tra l'avvio di createResidence e l'esito. Serve a due cose:
  // spegnere l'avviso beforeunload mentre il redirect di successo naviga via,
  // e riconoscere un ripristino dal bfcache dopo una creazione riuscita.
  const submitAttemptedRef = useRef(false)

  // Bozza solo nel browser: chiudere o ricaricare la scheda la perde, e
  // rifarla costa una chiamata AI. L'avviso non scatta sulle navigazioni
  // interne (limite del browser): il link "indietro" ha il suo confirm.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (submitAttemptedRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    // Nessuna idempotency key lato RPC: se il browser ripristina la pagina dal
    // bfcache dopo una creazione riuscita, un secondo "Crea residenza" ne
    // creerebbe un'altra. Si torna al caricamento, senza bozza.
    function handlePageShow(e: PageTransitionEvent) {
      if (!e.persisted || !submitAttemptedRef.current) return
      submitAttemptedRef.current = false
      onDiscard('La residenza precedente risultava già creata: la bozza è stata chiusa. Carica un documento per crearne un\'altra.')
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pageshow', handlePageShow)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [onDiscard])

  const units = entries.map(e => e.row)
  const filledUnitCount = units.filter(u => u.label.trim()).length

  // ── Dotazioni ──
  const effective = effectiveAnswers(draft, answers)
  const { unresolved } = resolveFeatures(draft, answers)
  const skipped = skippedItems(templates, effective, filledUnitCount)

  // Anteprima del gesto "Segna le rimanenti come No": quali dotazioni e quante
  // voci in più non nasceranno. Un "no" è permanente: le dotazioni non sono
  // modificabili dopo la creazione.
  const afterMarkAsNo = skippedItems(
    templates, effectiveAnswers(draft, markUnresolvedAsNo(draft, answers)), filledUnitCount,
  )
  const extraSkipped = afterMarkAsNo.count - skipped.count

  // ── Avvisi (mai blocchi) ──
  const warnings = draftWarnings(draft, answers, { units, existingAddresses, address })

  // ── Note di provenienza ──
  const suggestion = draft.deliveryDateSuggestion
  const notes = {
    name: <FieldProvenance field={draft.name} />,
    address: <FieldProvenance field={draft.address} />,
    delivery_date: (
      <div className="mt-1">
        <p className="text-xs text-text-secondary">
          {suggestion.state === 'non_trovato'
            ? 'Non si ricava dal documento: inseriscila tu.'
            : `Agibilità nel documento: ${formatDateIT(suggestion.value)}. Non è la consegna e non viene usata.`}
        </p>
        {suggestion.state !== 'non_trovato' && suggestion.citation && (
          <CitationDetails citation={suggestion.citation} />
        )}
      </div>
    ),
  }

  function updateUnit(index: number, patch: Partial<UnitRow>) {
    setEntries(prev => prev.map((e, i) => (i === index ? { ...e, row: { ...e.row, ...patch } } : e)))
  }
  function addUnit() {
    setEntries(prev => [
      ...prev,
      { row: { label: '', floor: prev.length ? prev[prev.length - 1].row.floor : '1' }, source: null },
    ])
  }
  function removeUnit(index: number) {
    setEntries(prev => prev.filter((_, i) => i !== index))
    setRowErrors({})
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setError(null)
    setListError(null)

    // Una pagina sola: tutti i campi sono visibili, la validazione nativa
    // può mettere a fuoco quello che manca.
    if (!form.reportValidity()) return

    // Il blocco sulle dotazioni senza risposta sta QUI, prima dell'invio:
    // createResidence legge una checkbox assente come "no", quindi un "non
    // trovato" arriverebbe al DB come "no". Stessa funzione e stesso messaggio
    // del modulo puro.
    const gate = prepareDraftCreation(draft, { featureAnswers: answers })
    if ('unresolvedFeatures' in gate && gate.unresolvedFeatures.length > 0) {
      setError(gate.error)
      return
    }

    if (units.length === 0) {
      setListError('Aggiungi almeno una unità (usa "+ Aggiungi unità")')
      return
    }
    if (units.length > MAX_UNITS) {
      setListError(`Massimo ${MAX_UNITS} unità per residenza`)
      return
    }
    const errors = validateUnitRows(units)
    if (Object.keys(errors).length > 0) {
      setRowErrors(errors)
      setListError('Correggi le righe segnalate')
      return
    }
    setRowErrors({})

    const formData = new FormData(form)
    formData.set('units', JSON.stringify(
      units.map(u => ({ label: u.label.trim(), floor: Number(u.floor) })),
    ))
    submitAttemptedRef.current = true
    startTransition(async () => {
      const res = await createResidence(formData)
      if (res?.error) {
        submitAttemptedRef.current = false
        setError(res.error)
      }
    })
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      {partialReadNote && (
        <div className="bg-semantic-amber-bg rounded-xl p-3 mb-5">
          <p className="text-sm text-semantic-amber">{partialReadNote}</p>
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        // Il campo indirizzo è non controllato (come nel wizard): l'avviso
        // "già usato" lo legge dall'evento, senza duplicare il campo.
        onInput={e => {
          const t = e.target as HTMLInputElement
          if (t.name === 'address') setAddress(t.value)
        }}
        noValidate
        className="space-y-5"
      >
        <ResidenceDataSection
          defaults={{
            name: draft.name.value ?? undefined,
            address: draft.address.value ?? undefined,
          }}
          notes={notes}
          existingBuilding={existingBuilding}
          onExistingBuildingChange={checked => {
            setExistingBuilding(checked)
            setShowDateWizard(checked)
            if (!checked) setUnitsAlreadyDelivered(false)
          }}
          unitsAlreadyDelivered={unitsAlreadyDelivered}
          onUnitsAlreadyDeliveredChange={setUnitsAlreadyDelivered}
          showDateWizard={showDateWizard}
          onShowDateWizardChange={setShowDateWizard}
        />

        <FeaturesSection
          review={{
            fields: draft.features,
            answers: effective,
            onAnswer: (key, value) => setAnswers(prev => ({ ...prev, [key]: value })),
            // Attaccata all'intestazione della card (sticky con essa). È l'unico
            // gesto che trasforma "senza risposta" in "no", e solo dopo conferma.
            toolbar: (
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`text-sm font-medium ${unresolved.length === 0 ? 'text-text-secondary' : 'text-semantic-amber'}`}
                  aria-live="polite"
                >
                  {unresolved.length === 0
                    ? 'Tutte le dotazioni hanno una risposta'
                    : `${pluralize(unresolved.length, 'dotazione', 'dotazioni')} da rispondere`}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={unresolved.length === 0}
                  onClick={() => setConfirmNoOpen(true)}
                >
                  Segna le rimanenti come No
                </Button>
              </div>
            ),
          }}
        />

        {draft.declaredUnitCount.state !== 'non_trovato' && (
          <section className="bg-surface rounded-xl border border-border p-4">
            <p className="text-sm text-text-primary">
              Unità dichiarate nel documento: {draft.declaredUnitCount.value}
            </p>
            <FieldProvenance field={draft.declaredUnitCount} />
          </section>
        )}

        <UnitListSection
          units={units}
          rowErrors={rowErrors}
          onUpdate={updateUnit}
          onAdd={addUnit}
          onRemove={removeUnit}
          rowNote={i => entries[i]?.source
            ? <FieldProvenance field={entries[i].source} />
            : <p className="text-xs text-text-secondary mt-1">Aggiunta a mano.</p>}
        />

        {warnings.length > 0 && (
          <div className="bg-semantic-amber-bg rounded-xl p-3 space-y-1">
            <p className="text-sm font-medium text-semantic-amber">Da controllare (non bloccano la creazione)</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {warnings.map(w => (
                <li key={w.code + w.message} className="text-sm text-semantic-amber">{w.message}</li>
              ))}
            </ul>
          </div>
        )}

        {listError && (
          <div className="bg-semantic-red-bg border border-semantic-red/20 rounded-xl p-3">
            <p className="text-sm text-semantic-red">{listError}</p>
          </div>
        )}
        {error && (
          <div className="bg-semantic-red-bg border border-semantic-red/20 rounded-xl p-3">
            <p className="text-sm text-semantic-red">{error}</p>
          </div>
        )}

        {/* Cosa succede al piano di manutenzione: i "no" tolgono voci in modo
            permanente (le dotazioni non sono modificabili dopo la creazione). */}
        {skipped.noFeatures.length > 0 && (
          <div className="bg-surface rounded-xl border border-border p-3 space-y-1">
            <p className="text-sm font-medium text-text-primary">{skippedItemsLine(skipped.count)}</p>
            <p className="text-xs text-text-secondary">
              Dotazioni a No: {skipped.noFeatures.map(k => FEATURE_LABEL[k]).join(', ')}.
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              if (window.confirm('Scartare la bozza? Il documento andrà analizzato di nuovo.')) onDiscard(null)
            }}
          >
            Scarta bozza
          </Button>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 py-3 bg-brand-dark text-white rounded-xl font-medium text-sm disabled:opacity-50"
          >
            {pending ? 'Creazione in corso…' : 'Crea residenza'}
          </button>
        </div>
      </form>

      {/* Fuori dal <form>: gli eventi di un portal risalgono ai suoi antenati React. */}
      <Modal
        open={confirmNoOpen}
        onClose={() => setConfirmNoOpen(false)}
        title="Segnare le rimanenti come No?"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirmNoOpen(false)}>Annulla</Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setAnswers(prev => markUnresolvedAsNo(draft, prev))
                setConfirmNoOpen(false)
              }}
            >
              Segna come No
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-text-secondary">
          <p>
            {pluralize(unresolved.length, 'dotazione verrà segnata', 'dotazioni verranno segnate')} come No:
          </p>
          <ul className="list-disc pl-5 space-y-0.5 text-text-primary">
            {unresolved.map(k => <li key={k}>{FEATURE_LABEL[k]}</li>)}
          </ul>
          <p>
            {extraSkipped > 0
              ? `${skippedItemsLine(extraSkipped)} in più. `
              : 'Nessuna voce di manutenzione in meno. '}
            Un No toglie le voci dal piano in modo permanente: le dotazioni non si modificano dopo la
            creazione e valgono anche per le unità aggiunte in seguito.
          </p>
        </div>
      </Modal>
    </div>
  )
}
