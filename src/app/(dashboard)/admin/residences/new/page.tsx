'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronLeft, FileText, PencilLine } from 'lucide-react'
import { createResidence } from './actions'
import { type FeatureKey } from '@/lib/residence-features'
import { MAX_UNITS } from '@/lib/residence-input'
import { ResidenceDataSection } from '@/components/residence-wizard/ResidenceDataSection'
import { FeaturesSection } from '@/components/residence-wizard/FeaturesSection'
import {
  ReplaceUnitsConfirm,
  UnitGeneratorSection,
  useUnitGenerator,
} from '@/components/residence-wizard/UnitGeneratorSection'
import { UnitListSection } from '@/components/residence-wizard/UnitListSection'
import {
  emptyFeatures,
  validateUnitRows,
  type UnitRow,
} from '@/components/residence-wizard/shared'

const STEP_TITLES = {
  1: 'Passo 1 di 3 — Dati residenza',
  2: 'Passo 2 di 3 — Dotazioni',
  3: 'Passo 3 di 3 — Unità',
} as const

export default function NewResidencePage() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [existingBuilding, setExistingBuilding] = useState(false)
  const [showDateWizard, setShowDateWizard] = useState(false)
  // Edificio già abitato: tutte le unità nascono consegnate nella stessa data.
  // Senza, nascono non consegnate (044) e la consegna si registra dalla pagina Unità.
  const [unitsAlreadyDelivered, setUnitsAlreadyDelivered] = useState(false)

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [features, setFeatures] = useState<Record<FeatureKey, boolean>>(emptyFeatures)
  const [units, setUnits] = useState<UnitRow[]>([])
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [listError, setListError] = useState<string | null>(null)
  const [resetNotice, setResetNotice] = useState(false)

  const generator = useUnitGenerator({
    units,
    onGenerate: rows => {
      setUnits(rows)
      setRowErrors({})
      setListError(null)
    },
  })
  // Le funzioni dell'hook cambiano a ogni render: l'effetto del pageshow
  // (montato una volta sola) le legge da qui, non dalla closure del mount.
  const generatorRef = useRef(generator)
  generatorRef.current = generator

  const formRef = useRef<HTMLFormElement>(null)
  // true solo tra l'avvio di una createResidence e l'esito: distingue
  // "sto per creare, potrei essere reindirizzato altrove" da un semplice
  // passaggio tra step. Il redirect di successo lancia lato server, quindi
  // non c'è mai un callback client su cui azzerare il form prima di
  // navigare via — l'unico momento per farlo è al ritorno.
  const submitAttemptedRef = useRef(false)

  // Nessuna idempotency key lato RPC (fuori scope B2): se il browser
  // ripristina questa pagina dal bfcache dopo un redirect di successo
  // (form ancora compilato, step 2, pulsante non più "in corso"), un
  // ri-click su "Crea residenza" creerebbe una seconda residenza.
  // pageshow + persisted è l'unico segnale esplicito per "pagina
  // ripristinata dalla cache, non caricata da zero" — si azzera solo se
  // c'era stato un vero tentativo di submit, per non cancellare la
  // compilazione di chi torna indietro senza aver mai inviato il form.
  useEffect(() => {
    function handlePageShow(e: PageTransitionEvent) {
      if (!e.persisted || !submitAttemptedRef.current) return
      submitAttemptedRef.current = false
      formRef.current?.reset()
      setStep(1)
      // Le checkbox dotazioni sono controllate da React: form.reset() azzera
      // il DOM ma non lo stato, che tornerebbe subito a ri-spuntarle.
      setFeatures(emptyFeatures())
      setUnits([])
      setRowErrors({})
      setListError(null)
      setError(null)
      setExistingBuilding(false)
      setShowDateWizard(false)
      setUnitsAlreadyDelivered(false)
      generatorRef.current.reset()
      setResetNotice(true)
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  // Il form è noValidate: la validazione nativa non blocca mai il submit da sola
  // (i required dello step 1 sono nascosti negli step successivi e il browser
  // fallirebbe in silenzio: "invalid form control is not focusable"). La
  // invochiamo noi esplicitamente, e SOLO quando lo step 1 è visibile: dallo
  // step 2 quei campi sono già nascosti, e chiamarla lì ricadrebbe nello stesso
  // fallimento silenzioso. Lo step 2 non ha comunque nulla da validare —
  // nessuna dotazione è obbligatoria e il passaggio non blocca mai.
  function handleNext() {
    const form = formRef.current
    if (!form) return
    setError(null)
    if (step === 1 && !form.reportValidity()) return
    setStep(s => (s === 1 ? 2 : 3))
  }

  function updateUnit(index: number, patch: Partial<UnitRow>) {
    setUnits(prev => prev.map((u, i) => (i === index ? { ...u, ...patch } : u)))
  }

  function addUnit() {
    setUnits(prev => [...prev, { label: '', floor: prev.length ? prev[prev.length - 1].floor : '1' }])
  }

  function removeUnit(index: number) {
    setUnits(prev => prev.filter((_, i) => i !== index))
    setRowErrors({})
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget

    // Enter su un campo di uno step intermedio: equivale ad "Avanti", non al
    // submit finale. Solo lo step 3 invia davvero.
    if (step !== 3) {
      handleNext()
      return
    }

    setError(null)
    setListError(null)
    generator.setError(null)
    setResetNotice(false)

    // Rete di sicurezza: se un required dello step 1 (ora nascosto) non è più
    // valido, si torna allo step 1 e lo si segnala lì, mai fallire in silenzio.
    if (!form.checkValidity()) {
      setStep(1)
      requestAnimationFrame(() => formRef.current?.reportValidity())
      return
    }

    if (units.length === 0) {
      setListError('Aggiungi almeno una unità (usa il generatore o "+ Aggiungi unità")')
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
      units.map(u => ({ label: u.label.trim(), floor: Number(u.floor) }))
    ))
    submitAttemptedRef.current = true
    startTransition(async () => {
      const res = await createResidence(formData)
      if (res?.error) setError(res.error)
    })
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/residences" className="text-text-secondary p-1 -ml-1 rounded-lg">
          <ChevronLeft className="w-5 h-5" strokeWidth={1.6} />
        </Link>
        <div>
          <h1 className="text-base font-medium text-text-primary">Nuova residenza</h1>
          <p className="text-xs text-text-secondary">{STEP_TITLES[step]}</p>
        </div>
      </div>

      {/* Due strade per creare la residenza. La seconda è questa pagina; la
          prima è la route "da documento". Solo al passo 1: più avanti un clic
          sbagliato perderebbe quanto già compilato. */}
      {step === 1 && (
        <nav aria-label="Come creare la residenza" className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <Link
            href="/admin/residences/new/da-documento"
            className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 hover:bg-background transition-colors"
          >
            <FileText className="w-5 h-5 mt-0.5 flex-shrink-0 text-brand-medium" strokeWidth={1.6} />
            <span>
              <span className="block text-sm font-medium text-text-primary">Parti da un documento</span>
              <span className="block text-xs text-text-secondary mt-0.5">
                Carica un PDF: la bozza si compila da sola e la rivedi prima di creare.
              </span>
            </span>
          </Link>
          <div
            aria-current="page"
            className="flex items-start gap-3 rounded-xl border border-brand-dark bg-brand-light p-4"
          >
            <PencilLine className="w-5 h-5 mt-0.5 flex-shrink-0 text-brand-dark" strokeWidth={1.6} />
            <span>
              <span className="block text-sm font-medium text-brand-dark">Compila a mano</span>
              <span className="block text-xs text-text-secondary mt-0.5">
                Inserisci dati, dotazioni e unità passo dopo passo.
              </span>
            </span>
          </div>
        </nav>
      )}

      {resetNotice && (
        <div className="bg-brand-light rounded-xl p-3 mb-5">
          <p className="text-sm text-brand-dark">
            Il modulo è stato azzerato: la residenza precedente risultava già creata.
            Compila di nuovo per crearne un&apos;altra.
          </p>
        </div>
      )}

      {/* Tutti e tre gli step restano montati (quelli non attivi sono hidden):
          i valori non controllati dello step 1 e le checkbox dello step 2
          devono restare nel DOM, perché il submit legge new FormData(form). */}
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* ============ STEP 1 — Dati residenza ============ */}
        <div className={step === 1 ? 'space-y-5' : 'hidden'}>
          <ResidenceDataSection
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

          <button
            type="button"
            onClick={handleNext}
            className="w-full py-3 bg-brand-dark text-white rounded-xl font-medium text-sm"
          >
            Avanti
          </button>
        </div>

        {/* ============ STEP 2 — Dotazioni ============ */}
        <div className={step === 2 ? 'space-y-5' : 'hidden'}>
          <FeaturesSection
            features={features}
            onChange={(key, checked) => setFeatures(prev => ({ ...prev, [key]: checked }))}
          />

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-6 py-3 border border-border rounded-xl text-sm text-text-secondary font-medium"
            >
              Indietro
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="flex-1 py-3 bg-brand-dark text-white rounded-xl font-medium text-sm"
            >
              Avanti
            </button>
          </div>
        </div>

        {/* ============ STEP 3 — Unità ============ */}
        <div className={step === 3 ? 'space-y-5' : 'hidden'}>
          <UnitGeneratorSection generator={generator} />

          <UnitListSection
            units={units}
            rowErrors={rowErrors}
            onUpdate={updateUnit}
            onAdd={addUnit}
            onRemove={removeUnit}
          />

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

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-6 py-3 border border-border rounded-xl text-sm text-text-secondary font-medium"
            >
              Indietro
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 py-3 bg-brand-dark text-white rounded-xl font-medium text-sm disabled:opacity-50"
            >
              {pending ? 'Creazione in corso…' : 'Crea residenza'}
            </button>
          </div>
        </div>
      </form>

      {generator.showReplaceConfirm && (
        <ReplaceUnitsConfirm
          count={generator.filledCount}
          onCancel={() => generator.setShowReplaceConfirm(false)}
          onConfirm={generator.confirmReplace}
        />
      )}
    </>
  )
}
