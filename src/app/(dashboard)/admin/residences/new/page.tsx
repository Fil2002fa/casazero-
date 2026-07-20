'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { createResidence } from './actions'

const WIZARD_CATEGORIES = [
  { label: 'Coperture e tetto',      value: 'Coperture'    },
  { label: 'Ventilazione',           value: 'Ventilazione' },
  { label: 'Termico e clima',        value: 'Termico'      },
  { label: 'Elettrico',              value: 'Elettrico'    },
  { label: 'Fotovoltaico',           value: 'Fotovoltaico' },
  { label: 'Finiture e serramenti',  value: 'Finiture'     },
  { label: 'Sicurezza in copertura', value: 'Sicurezza'    },
  { label: 'Scarichi e spurghi',     value: 'Spurghi'      },
]

const MAX_UNITS = 200

type UnitRow = { label: string; floor: string }

// Fonte di verità unica per i nomi generati: usata sia dall'anteprima
// sia dalla generazione vera, così non possono divergere.
function generatedLabel(prefix: string, n: number): string {
  return prefix ? `${prefix} ${n}` : String(n)
}

// Ritorna un messaggio d'errore per riga (indice → messaggio); vuoto = tutto valido.
function validateUnitRows(rows: UnitRow[]): Record<number, string> {
  const errors: Record<number, string> = {}
  const seen = new Set<string>()
  rows.forEach((row, i) => {
    const problems: string[] = []
    const label = row.label.trim()
    if (!label) {
      problems.push('nome obbligatorio')
    } else if (seen.has(label.toLowerCase())) {
      problems.push('nome già usato')
    } else {
      seen.add(label.toLowerCase())
    }
    const floor = Number(row.floor)
    if (row.floor.trim() === '' || !Number.isInteger(floor) || floor < 0) {
      problems.push('piano: numero intero da 0 in su')
    }
    if (problems.length) errors[i] = problems.join(' · ')
  })
  return errors
}

export default function NewResidencePage() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [existingBuilding, setExistingBuilding] = useState(false)
  const [showDateWizard, setShowDateWizard] = useState(false)

  const [step, setStep] = useState<1 | 2>(1)
  const [units, setUnits] = useState<UnitRow[]>([])
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [listError, setListError] = useState<string | null>(null)

  // Generatore a pattern (parte sempre dal numero 1; numerazioni diverse
  // si ottengono modificando le righe della lista, che è la fonte di verità)
  const [genPrefix, setGenPrefix] = useState('Unità')
  const [genCount, setGenCount] = useState('')
  const [genPerFloor, setGenPerFloor] = useState('2')
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false)
  const [resetNotice, setResetNotice] = useState(false)

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
      setUnits([])
      setRowErrors({})
      setListError(null)
      setError(null)
      setExistingBuilding(false)
      setShowDateWizard(false)
      setGenPrefix('Unità')
      setGenCount('')
      setGenPerFloor('2')
      setShowReplaceConfirm(false)
      setResetNotice(true)
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  // Il form è noValidate: la validazione nativa non blocca mai il submit da sola
  // (i required dello step 1 sono nascosti allo step 2 e il browser fallirebbe
  // in silenzio: "invalid form control is not focusable"). La invochiamo noi
  // esplicitamente quando lo step 1 è visibile.
  function handleNext() {
    const form = formRef.current
    if (!form) return
    setError(null)
    if (!form.reportValidity()) return
    setStep(2)
  }

  // Campi del generatore validi? Unica definizione, condivisa da anteprima,
  // "Genera" e generazione effettiva.
  const gen = (() => {
    const count = parseInt(genCount, 10)
    const perFloor = parseInt(genPerFloor, 10)
    if (!Number.isInteger(count) || count < 1 || count > MAX_UNITS) return null
    if (!Number.isInteger(perFloor) || perFloor < 1) return null
    return { count, perFloor }
  })()

  function doGenerate() {
    if (!gen) return
    const prefix = genPrefix.trim()
    setUnits(Array.from({ length: gen.count }, (_, i) => ({
      label: generatedLabel(prefix, i + 1),
      floor: String(Math.floor(i / gen.perFloor) + 1),
    })))
    setRowErrors({})
    setListError(null)
  }

  function handleGenerate() {
    if (!gen) {
      setListError(`Controlla i campi del generatore: numero di unità (da 1 a ${MAX_UNITS}) e unità per piano (almeno 1)`)
      return
    }
    setListError(null)
    // Conferma solo se in lista ci sono già unità con un nome: righe vuote
    // appena aggiunte non sono lavoro da proteggere.
    if (units.some(u => u.label.trim())) {
      setShowReplaceConfirm(true)
      return
    }
    doGenerate()
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

    // Enter su un campo dello step 1: equivale ad "Avanti", non al submit finale.
    if (step === 1) {
      handleNext()
      return
    }

    setError(null)
    setListError(null)
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

  // Il riepilogo conta solo le righe con un nome compilato: una riga appena
  // aggiunta e ancora vuota non è un'unità.
  const filledUnits = units.filter(u => u.label.trim())
  const floorCount = new Set(filledUnits.map(u => u.floor.trim())).size

  // Anteprima live del generatore: primi 3 nomi + "…" e intervallo piani.
  const genPreview = gen ? (() => {
    const prefix = genPrefix.trim()
    const names = Array.from({ length: Math.min(gen.count, 3) }, (_, i) => generatedLabel(prefix, i + 1))
    const maxFloor = Math.floor((gen.count - 1) / gen.perFloor) + 1
    const floors = maxFloor === 1 ? 'piano 1' : `piani 1–${maxFloor}`
    return `Verranno generate: ${names.join(', ')}${gen.count > 3 ? '…' : ''} · ${floors}`
  })() : null

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/residences" className="text-text-secondary p-1 -ml-1 rounded-lg">
          <ChevronLeft className="w-5 h-5" strokeWidth={1.6} />
        </Link>
        <div>
          <h1 className="text-base font-medium text-text-primary">Nuova residenza</h1>
          <p className="text-xs text-text-secondary">
            {step === 1 ? 'Passo 1 di 2 — Dati residenza' : 'Passo 2 di 2 — Unità'}
          </p>
        </div>
      </div>

      {resetNotice && (
        <div className="bg-brand-light rounded-xl p-3 mb-5">
          <p className="text-sm text-brand-dark">
            Il modulo è stato azzerato: la residenza precedente risultava già creata.
            Compila di nuovo per crearne un&apos;altra.
          </p>
        </div>
      )}

      {/* Entrambi gli step restano montati (lo step non attivo è hidden):
          i valori non controllati dello step 1 devono restare nel DOM,
          perché il submit legge new FormData(form). */}
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* ============ STEP 1 — Dati residenza ============ */}
        <div className={step === 1 ? 'space-y-5' : 'hidden'}>
          <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
            <h2 className="text-sm font-medium text-text-primary">Dati residenza</h2>

            <Field label="Nome *" name="name" placeholder="es. Residenza Cavaccio" required />
            <Field label="Indirizzo" name="address" placeholder="Via Roma 1, Padova" />
            <Field label="Classe energetica" name="energy_class" placeholder="es. A4" />
            <div>
              <Field label="Data consegna *" name="delivery_date" type="date" required />
              <p className="text-xs text-text-secondary mt-1">
                Data di consegna chiavi al cliente. Da qui partono tutte le scadenze delle
                manutenzioni (data consegna + frequenza).
              </p>
            </div>
          </section>

          {/* Edificio esistente */}
          <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={existingBuilding}
                onChange={e => {
                  setExistingBuilding(e.target.checked)
                  setShowDateWizard(e.target.checked)
                }}
                className="w-4 h-4 rounded accent-brand-dark"
              />
              <div>
                <p className="text-sm font-medium text-text-primary">Edificio esistente</p>
                <p className="text-xs text-text-secondary">
                  Attiva per edifici già abitati: potrai inserire, per ogni categoria,
                  la data dell&apos;ultimo intervento noto invece della data di consegna.
                </p>
              </div>
            </label>

            {existingBuilding && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowDateWizard(!showDateWizard)}
                  className="flex items-center gap-2 text-sm text-brand-medium"
                >
                  {showDateWizard ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {showDateWizard ? 'Nascondi' : 'Mostra'} wizard date per categoria
                </button>

                {showDateWizard && (
                  <div className="mt-3 space-y-3">
                    <p className="text-xs text-text-secondary">
                      Lascia vuoto per usare la data di consegna come base. La scadenza sarà calcolata
                      come <em>data base + frequenza template</em>.
                    </p>
                    {WIZARD_CATEGORIES.map(({ label, value }) => (
                      <div key={value} className="flex items-center gap-3">
                        <label className="text-xs text-text-secondary w-40 flex-shrink-0">{label}</label>
                        <input
                          type="date"
                          name={`date_${value}`}
                          className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <button
            type="button"
            onClick={handleNext}
            className="w-full py-3 bg-brand-dark text-white rounded-xl font-medium text-sm"
          >
            Avanti
          </button>
        </div>

        {/* ============ STEP 2 — Unità ============ */}
        <div className={step === 2 ? 'space-y-5' : 'hidden'}>
          {/* Generatore a pattern */}
          <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
            <h2 className="text-sm font-medium text-text-primary">Genera unità</h2>
            <p className="text-xs text-text-secondary">
              Scorciatoia per popolare la lista. Ogni riga resta poi modificabile singolarmente.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <GenField label="Nome unità" value={genPrefix} onChange={setGenPrefix} placeholder="es. Unità, Int., A" />
              <GenField label="Numero di unità" value={genCount} onChange={setGenCount} type="number" min="1" max={String(MAX_UNITS)} placeholder="es. 14" />
            </div>
            <GenField
              label="Unità per piano"
              value={genPerFloor}
              onChange={setGenPerFloor}
              type="number"
              min="1"
              hint="Per assegnare i piani in automatico: es. 2 = le prime due unità al piano 1, le successive al piano 2, e così via. Modificabile poi riga per riga."
            />
            {genPreview && (
              <p className="text-xs text-text-secondary">{genPreview}</p>
            )}
            <button
              type="button"
              onClick={handleGenerate}
              className="w-full py-2 border border-brand-dark text-brand-dark rounded-lg text-sm font-medium"
            >
              Genera
            </button>
          </section>

          {/* Lista editabile — fonte di verità */}
          <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-text-primary">Unità</h2>
              {filledUnits.length > 0 && (
                <p className="text-xs text-text-secondary">
                  {filledUnits.length} unità su {floorCount} {floorCount === 1 ? 'piano' : 'piani'}
                </p>
              )}
            </div>

            {units.length === 0 && (
              <p className="text-xs text-text-secondary">
                Nessuna unità in lista. Usa il generatore qui sopra o aggiungile una a una.
              </p>
            )}

            {units.map((unit, i) => (
              <div key={i}>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={unit.label}
                    onChange={e => updateUnit(i, { label: e.target.value })}
                    placeholder={`es. Int. ${i + 1}`}
                    maxLength={60}
                    aria-label={`Nome unità ${i + 1}`}
                    className={`flex-1 min-w-0 border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium ${rowErrors[i] ? 'border-semantic-red' : 'border-border'}`}
                  />
                  <input
                    type="number"
                    value={unit.floor}
                    onChange={e => updateUnit(i, { floor: e.target.value })}
                    placeholder="Piano"
                    min="0"
                    aria-label={`Piano unità ${i + 1}`}
                    className={`w-20 border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium ${rowErrors[i] ? 'border-semantic-red' : 'border-border'}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeUnit(i)}
                    aria-label={`Rimuovi unità ${i + 1}`}
                    className="p-2 rounded-lg text-text-secondary hover:text-semantic-red transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {rowErrors[i] && (
                  <p className="text-xs text-semantic-red mt-1">{rowErrors[i]}</p>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={addUnit}
              className="flex items-center gap-1.5 text-sm text-brand-medium font-medium"
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
              Aggiungi unità
            </button>
          </section>

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
              onClick={() => setStep(1)}
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

      {/* Modale conferma sostituzione lista unità */}
      {showReplaceConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
          <div className="bg-surface rounded-xl border border-border p-5 w-full max-w-sm space-y-3">
            <p className="text-sm font-medium text-text-primary">Sostituire le unità?</p>
            <p className="text-sm text-text-secondary">
              Le {filledUnits.length} unità in lista verranno sostituite da quelle generate.
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowReplaceConfirm(false)}
                className="px-4 py-2 border border-border rounded-lg text-sm text-text-secondary"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => { setShowReplaceConfirm(false); doGenerate() }}
                className="px-4 py-2 bg-brand-dark text-white rounded-lg text-sm font-medium"
              >
                Sostituisci
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Field({
  label, name, placeholder, required, type = 'text',
}: {
  label: string; name: string; placeholder?: string; required?: boolean; type?: string
}) {
  return (
    <div>
      <label className="text-xs text-text-secondary mb-1 block">{label}</label>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        required={required}
        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
      />
    </div>
  )
}

function GenField({
  label, value, onChange, placeholder, type = 'text', min, max, hint,
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; min?: string; max?: string; hint?: string
}) {
  return (
    <div>
      <label className="text-xs text-text-secondary mb-1 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
      />
      {hint && <p className="text-xs text-text-secondary mt-1">{hint}</p>}
    </div>
  )
}
