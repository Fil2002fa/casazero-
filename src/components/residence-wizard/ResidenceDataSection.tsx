'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { DateField } from '@/components/DateField'
import { Field } from './WizardFields'
import { WIZARD_CATEGORIES } from './shared'

// Valori iniziali dei campi non controllati (defaultValue). Vuoti nel wizard
// manuale; la revisione da documento li passa dalla proposta.
export type ResidenceDataDefaults = {
  name?: string
  address?: string
  energy_class?: string
  delivery_date?: string
}

// Le due sezioni del passo 1: "Dati residenza" e "Edificio esistente".
// I campi di testo restano non controllati (il submit legge new FormData(form));
// lo stato dell'edificio esistente è del chiamante, che lo azzera al ripristino
// dal bfcache.
export function ResidenceDataSection({
  defaults,
  existingBuilding,
  onExistingBuildingChange,
  unitsAlreadyDelivered,
  onUnitsAlreadyDeliveredChange,
  showDateWizard,
  onShowDateWizardChange,
}: {
  defaults?: ResidenceDataDefaults
  existingBuilding: boolean
  onExistingBuildingChange: (checked: boolean) => void
  unitsAlreadyDelivered: boolean
  onUnitsAlreadyDeliveredChange: (checked: boolean) => void
  showDateWizard: boolean
  onShowDateWizardChange: (show: boolean) => void
}) {
  return (
    <>
      <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
        <h2 className="text-sm font-medium text-text-primary">Dati residenza</h2>

        <Field label="Nome *" name="name" placeholder="es. Residenza Cavaccio" required defaultValue={defaults?.name} />
        <Field label="Indirizzo *" name="address" placeholder="Via Roma 1, Padova" required defaultValue={defaults?.address} />
        <Field label="Classe energetica" name="energy_class" placeholder="es. A4" defaultValue={defaults?.energy_class} />
        <div>
          <Field label="Data consegna *" name="delivery_date" type="date" required defaultValue={defaults?.delivery_date} />
          <p className="text-xs text-text-secondary mt-1">
            Data di consegna delle parti comuni. Da qui partono le scadenze delle
            manutenzioni condominiali (data consegna + frequenza). Le scadenze di ogni
            unità partono dalla sua consegna, che si registra dalla pagina Unità.
          </p>
        </div>
      </section>

      {/* Edificio esistente */}
      <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={existingBuilding}
            onChange={e => onExistingBuildingChange(e.target.checked)}
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

        {/* Il campo data esiste solo con l'opzione attiva: senza, non arriva
            nel FormData e le unità nascono non consegnate. */}
        {existingBuilding && (
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={unitsAlreadyDelivered}
                onChange={e => onUnitsAlreadyDeliveredChange(e.target.checked)}
                className="w-4 h-4 rounded accent-brand-dark"
              />
              <span className="text-sm text-text-primary">Unità già consegnate tutte il</span>
            </label>
            {unitsAlreadyDelivered && (
              <DateField name="units_delivery_date" required />
            )}
            <p className="text-xs text-text-secondary">
              {unitsAlreadyDelivered
                ? 'Tutte le unità nascono consegnate in questa data: le loro scadenze partono da qui.'
                : 'Senza questa opzione le unità nascono non consegnate: la consegna di ciascuna si registra dalla pagina Unità.'}
            </p>
          </div>
        )}

        {existingBuilding && (
          <div>
            <button
              type="button"
              onClick={() => onShowDateWizardChange(!showDateWizard)}
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
                    <DateField
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
    </>
  )
}
