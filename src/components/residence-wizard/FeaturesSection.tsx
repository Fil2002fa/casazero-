'use client'

import {
  FEATURE_GROUPS,
  RESIDENCE_FEATURES,
  featureFieldName,
  type FeatureKey,
} from '@/lib/residence-features'
import type { DraftField } from '@/lib/residence-draft'
import { pluralize } from '@/lib/pluralize'
import { cn } from '@/lib/cn'
import { FieldProvenance } from './FieldProvenance'

// Revisione da documento: ogni dotazione ha tre stati, non due. `answers` ha la
// chiave solo se c'è una risposta effettiva (sì/no); senza chiave la dotazione
// è DA RISPONDERE e blocca la creazione. Mai un "no" implicito.
export type FeaturesReview = {
  fields: Record<FeatureKey, DraftField<boolean>>
  answers: Partial<Record<FeatureKey, boolean>>
  onAnswer: (key: FeatureKey, value: boolean) => void
}

type FeaturesSectionProps =
  | {
      // Wizard manuale: 19 checkbox, tutte rispondono (false = "no" dichiarato).
      features: Record<FeatureKey, boolean>
      onChange: (key: FeatureKey, checked: boolean) => void
      review?: undefined
    }
  | { review: FeaturesReview; features?: undefined; onChange?: undefined }

const yesNo = (v: boolean) => (v ? 'Sì' : 'No')

// Passo "Dotazioni". Nel wizard sono checkbox controllate con name feature_<key>
// (il submit legge new FormData(form)); nella revisione sono due bottoni Sì/No
// per voce e la risposta "sì" arriva al form come input nascosto con lo stesso
// name — così a createResidence il FormData ha la stessa forma di sempre.
export function FeaturesSection(props: FeaturesSectionProps) {
  if (props.review) return <FeaturesReviewList review={props.review} />
  const { features, onChange } = props

  // Contato scorrendo la costante, non Object.values(features): l'elenco delle
  // dotazioni che esistono è uno solo, e il riepilogo deve leggerlo da lì.
  const featureCount = RESIDENCE_FEATURES.filter(f => features[f.key]).length

  return (
    <section className="bg-surface rounded-xl border border-border p-4 space-y-5">
      <div>
        <h2 className="text-sm font-medium text-text-primary">Dotazioni dell&apos;edificio</h2>
        <p className="text-xs text-text-secondary mt-1">
          Spunta ciò che la residenza ha davvero: il piano di manutenzione nascerà
          con le sole voci che riguardano queste dotazioni. Puoi proseguire senza
          spuntare nulla.
        </p>
      </div>

      {FEATURE_GROUPS.map(group => (
        <div key={group} className="space-y-2.5">
          <h3 className="text-xs font-medium text-text-secondary">{group}</h3>
          {RESIDENCE_FEATURES.filter(f => f.group === group).map(f => (
            <label key={f.key} className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name={featureFieldName(f.key)}
                checked={features[f.key]}
                onChange={e => onChange(f.key, e.target.checked)}
                className="w-4 h-4 mt-0.5 flex-shrink-0 rounded accent-brand-dark"
              />
              <div>
                <p className="text-sm text-text-primary">{f.label}</p>
                {'help' in f && (
                  <p className="text-xs text-text-secondary mt-0.5">{f.help}</p>
                )}
              </div>
            </label>
          ))}
        </div>
      ))}

      {/* Riepilogo: chi salta il passaggio deve accorgersene. */}
      <p className="text-xs text-text-secondary border-t border-border pt-3">
        {featureCount === 0
          ? 'Nessuna dotazione dichiarata'
          : pluralize(featureCount, 'dotazione dichiarata', 'dotazioni dichiarate')}
      </p>
    </section>
  )
}

// Ramo revisione. Una riga per dotazione: etichetta e Sì/No affiancati, poi
// "Da rispondere" se manca la risposta. La provenienza compare solo quando il
// documento ha detto qualcosa: per un "non trovato" basta l'ambra.
function FeaturesReviewList({ review }: { review: FeaturesReview }) {
  return (
    <section className="bg-surface rounded-xl border border-border p-4 space-y-4">
      <div>
        <h2 className="text-sm font-medium text-text-primary">Dotazioni dell&apos;edificio</h2>
        <p className="text-xs text-text-secondary mt-1">
          Rispondi sì o no dove manca la risposta. Un No toglie le voci collegate dal piano.
        </p>
      </div>

      {FEATURE_GROUPS.map(group => (
        <div key={group}>
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-text-secondary pb-1 border-b border-border">
            {group}
          </h3>
          <div className="divide-y divide-border">
            {RESIDENCE_FEATURES.filter(f => f.group === group).map(f => {
              const answer = review.answers[f.key]
              const field = review.fields[f.key]
              return (
                <div key={f.key} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-sm text-text-primary">{f.label}</span>
                    <div
                      role="group"
                      aria-label={`Risposta: ${f.label}`}
                      className="inline-flex rounded-lg border border-border overflow-hidden"
                    >
                      {([true, false] as const).map(v => (
                        <button
                          key={String(v)}
                          type="button"
                          aria-pressed={answer === v}
                          onClick={() => review.onAnswer(f.key, v)}
                          className={cn(
                            'px-3 py-1 text-xs font-medium transition-colors',
                            v === false && 'border-l border-border',
                            answer === v
                              ? 'bg-brand-dark text-white'
                              : 'bg-background text-text-secondary hover:text-text-primary',
                          )}
                        >
                          {yesNo(v)}
                        </button>
                      ))}
                    </div>
                    {answer === undefined && (
                      <span className="text-xs font-medium text-semantic-amber">Da rispondere</span>
                    )}
                  </div>
                  {'help' in f && (
                    <p className="text-xs text-text-secondary mt-0.5">{f.help}</p>
                  )}
                  {field.state !== 'non_trovato' && <FieldProvenance field={field} format={yesNo} />}
                  {answer === true && <input type="hidden" name={featureFieldName(f.key)} value="on" />}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
