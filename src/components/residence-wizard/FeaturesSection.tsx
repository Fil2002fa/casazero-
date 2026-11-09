'use client'

import type { ReactNode } from 'react'
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
  // Attaccato all'intestazione della card, sticky con essa: stato e azioni di
  // massa (quante senza risposta, "Segna le rimanenti come No").
  toolbar?: ReactNode
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

// Ramo revisione: una tabella. Etichetta a sinistra (con aiuto e provenienza
// sotto), "Da rispondere" in colonna fissa, Sì/No in colonna a destra.
// La provenienza compare solo quando il documento ha detto qualcosa: per un
// "non trovato" basta l'ambra.
function FeaturesReviewList({ review }: { review: FeaturesReview }) {
  return (
    <section className="bg-surface rounded-xl border border-border p-4">
      <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-t-xl border-b border-border bg-surface px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-text-primary">Dotazioni dell&apos;edificio</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Rispondi sì o no dove manca la risposta. Un No toglie le voci collegate dal piano.
          </p>
        </div>
        {review.toolbar}
      </div>

      <table className="w-full border-collapse">
        <thead className="sr-only">
          <tr>
            <th scope="col">Dotazione</th>
            <th scope="col">Stato</th>
            <th scope="col">Risposta</th>
          </tr>
        </thead>
        {FEATURE_GROUPS.map(group => (
          <tbody key={group}>
            <tr>
              <th
                colSpan={3}
                scope="colgroup"
                className="pt-4 pb-1 text-left text-[11px] font-medium uppercase tracking-wide text-text-secondary"
              >
                {group}
              </th>
            </tr>
            {RESIDENCE_FEATURES.filter(f => f.group === group).map(f => {
              const answer = review.answers[f.key]
              const field = review.fields[f.key]
              return (
                <tr key={f.key} className="border-t border-border/60 align-top">
                  <td className="py-2.5 pr-3">
                    <span className="text-sm text-text-primary">{f.label}</span>
                    {'help' in f && (
                      <p className="text-xs text-text-secondary mt-0.5">{f.help}</p>
                    )}
                    {field.state !== 'non_trovato' && <FieldProvenance field={field} format={yesNo} />}
                  </td>
                  <td className="w-28 py-3 pr-3 text-xs font-medium text-semantic-amber whitespace-nowrap">
                    {answer === undefined ? 'Da rispondere' : null}
                  </td>
                  <td className="w-24 py-2.5 text-right">
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
                    {answer === true && <input type="hidden" name={featureFieldName(f.key)} value="on" />}
                  </td>
                </tr>
              )
            })}
          </tbody>
        ))}
      </table>
    </section>
  )
}
