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
  const { review } = props

  // Contato scorrendo la costante, non Object.values(features): l'elenco delle
  // dotazioni che esistono è uno solo, e il riepilogo deve leggerlo da lì.
  const featureCount = review
    ? RESIDENCE_FEATURES.filter(f => review.answers[f.key] === true).length
    : RESIDENCE_FEATURES.filter(f => props.features![f.key]).length
  const unresolvedCount = review
    ? RESIDENCE_FEATURES.filter(f => review.answers[f.key] === undefined).length
    : 0

  return (
    <section className="bg-surface rounded-xl border border-border p-4 space-y-5">
      <div>
        <h2 className="text-sm font-medium text-text-primary">Dotazioni dell&apos;edificio</h2>
        <p className="text-xs text-text-secondary mt-1">
          {review
            ? 'Il documento non dice mai "no" per conto tuo: rispondi sì o no a ogni dotazione senza risposta. Un "no" toglie le voci di manutenzione collegate dal piano, anche per le unità aggiunte dopo.'
            : 'Spunta ciò che la residenza ha davvero: il piano di manutenzione nascerà con le sole voci che riguardano queste dotazioni. Puoi proseguire senza spuntare nulla.'}
        </p>
      </div>

      {FEATURE_GROUPS.map(group => (
        <div key={group} className="space-y-2.5">
          <h3 className="text-xs font-medium text-text-secondary">{group}</h3>
          {RESIDENCE_FEATURES.filter(f => f.group === group).map(f => {
            const label = (
              <>
                <p className="text-sm text-text-primary">{f.label}</p>
                {'help' in f && (
                  <p className="text-xs text-text-secondary mt-0.5">{f.help}</p>
                )}
              </>
            )

            if (!review) {
              return (
                <label key={f.key} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name={featureFieldName(f.key)}
                    checked={props.features![f.key]}
                    onChange={e => props.onChange!(f.key, e.target.checked)}
                    className="w-4 h-4 mt-0.5 flex-shrink-0 rounded accent-brand-dark"
                  />
                  <div>{label}</div>
                </label>
              )
            }

            const answer = review.answers[f.key]
            return (
              <div key={f.key} className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  {label}
                  <FieldProvenance field={review.fields[f.key]} format={yesNo} />
                  {answer === undefined && (
                    <p className="text-xs font-medium text-semantic-amber mt-1">Da rispondere</p>
                  )}
                </div>
                <div role="group" aria-label={`Risposta: ${f.label}`} className="flex gap-1 flex-shrink-0">
                  {([true, false] as const).map(v => (
                    <button
                      key={String(v)}
                      type="button"
                      aria-pressed={answer === v}
                      onClick={() => review.onAnswer(f.key, v)}
                      className={cn(
                        'px-3 py-1 rounded-lg border text-xs font-medium',
                        answer === v
                          ? 'bg-brand-dark text-white border-brand-dark'
                          : 'bg-background text-text-secondary border-border',
                      )}
                    >
                      {yesNo(v)}
                    </button>
                  ))}
                </div>
                {answer === true && <input type="hidden" name={featureFieldName(f.key)} value="on" />}
              </div>
            )
          })}
        </div>
      ))}

      {/* Riepilogo: chi salta il passaggio deve accorgersene. */}
      <p className="text-xs text-text-secondary border-t border-border pt-3">
        {review && unresolvedCount > 0
          ? `${pluralize(unresolvedCount, 'dotazione senza risposta', 'dotazioni senza risposta')} · ${pluralize(featureCount, 'dotazione dichiarata', 'dotazioni dichiarate')}`
          : featureCount === 0
            ? 'Nessuna dotazione dichiarata'
            : pluralize(featureCount, 'dotazione dichiarata', 'dotazioni dichiarate')}
      </p>
    </section>
  )
}
