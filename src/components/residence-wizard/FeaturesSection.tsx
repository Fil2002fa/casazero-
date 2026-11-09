'use client'

import {
  FEATURE_GROUPS,
  RESIDENCE_FEATURES,
  featureFieldName,
  type FeatureKey,
} from '@/lib/residence-features'
import { pluralize } from '@/lib/pluralize'

// Passo "Dotazioni": le 19 checkbox raggruppate. Controllate dal chiamante
// (features) e con name feature_<key>, perché il submit legge new FormData(form).
export function FeaturesSection({
  features,
  onChange,
}: {
  features: Record<FeatureKey, boolean>
  onChange: (key: FeatureKey, checked: boolean) => void
}) {
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
