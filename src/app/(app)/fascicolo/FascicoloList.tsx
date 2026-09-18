'use client'

import { useMemo, useState } from 'react'
import { Download, Paperclip } from 'lucide-react'

// Date, anno e colore del punto arrivano già calcolati dal server: calcolarli
// qui darebbe testo diverso fra Node e Safari e un mismatch di hydration.
export type FascicoloEntry = {
  id: string
  title: string
  category: string | null
  isCondominium: boolean
  dotClass: string
  dateStr: string
  year: number
  performedByName: string | null
  notes: string | null
  attachments: { id: string; file_name: string; storage_path: string }[]
}

type Scope = 'all' | 'unit' | 'condominium'

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'all',         label: 'Tutti' },
  { value: 'unit',        label: 'Unità' },
  { value: 'condominium', label: 'Condominio' },
]

// Lo scope "Tutti" è già in memoria: Unità e Condominio sono una partizione
// su unit_id, quindi il filtro non passa dal server.
export function FascicoloList({
  entries, thisYear, scaduteCount,
}: {
  entries: FascicoloEntry[]
  thisYear: number
  scaduteCount: number
}) {
  const [scope, setScope] = useState<Scope>('all')

  const visible = useMemo(
    () => scope === 'all'
      ? entries
      : entries.filter(e => (scope === 'condominium') === e.isCondominium),
    [entries, scope]
  )

  const yearCount = useMemo(
    () => visible.filter(e => e.year === thisYear).length,
    [visible, thisYear]
  )

  return (
    <>
      {/* Contatori */}
      <div className="grid grid-cols-3 gap-3">
        <StatBox label="Totali" value={visible.length} />
        <StatBox label={`Anno ${thisYear}`} value={yearCount} />
        <StatBox label="Scadute" value={scaduteCount} alert={scaduteCount > 0} />
      </div>

      {/* Filtro scope */}
      <div className="flex gap-2">
        {SCOPES.map(s => (
          <button
            key={s.value}
            type="button"
            onClick={() => setScope(s.value)}
            aria-pressed={scope === s.value}
            className={`flex items-center h-11 px-4 rounded-full text-sm font-medium focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 ${
              scope === s.value
                ? 'bg-brand-dark text-white'
                : 'bg-surface border border-border text-text-secondary'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {visible.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-8 text-center">
          <p className="text-base text-text-secondary">Nessun intervento registrato.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {visible.map((c, idx) => {
            const showYearSep = idx === 0 || visible[idx - 1].year !== c.year

            return (
              <div key={c.id}>
                {showYearSep && (
                  <div className="flex items-center gap-3 py-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-text-secondary font-medium">{c.year}</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}

                <div className="flex gap-3">
                  {/* Timeline line */}
                  <div className="flex flex-col items-center">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${c.dotClass}`} />
                    {idx < visible.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-1" />
                    )}
                  </div>

                  {/* Card */}
                  <div className="flex-1 min-w-0 bg-surface rounded-xl border border-border p-4 mb-2">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-medium text-text-primary line-clamp-2 break-words">
                          {c.title}
                        </p>
                        <p className="text-xs text-text-secondary break-words">{c.category}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                          c.isCondominium
                            ? 'bg-brand-light text-brand-dark'
                            : 'bg-semantic-blue-bg text-semantic-blue'
                        }`}>
                          {c.isCondominium ? 'Condominio' : 'Unità'}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-text-secondary">{c.dateStr}</p>

                    {c.performedByName && (
                      <p className="text-xs text-text-secondary mt-0.5 break-words">
                        Eseguito da: <span className="text-text-primary">{c.performedByName}</span>
                      </p>
                    )}

                    {c.notes && (
                      <p className="text-base text-text-secondary mt-1.5 leading-relaxed break-words">{c.notes}</p>
                    )}

                    {c.attachments.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {c.attachments.map(att => (
                          <a
                            key={att.id}
                            href={`/api/download?bucket=attachments&path=${encodeURIComponent(att.storage_path)}`}
                            className="flex items-center gap-1.5 h-11 -mx-1 px-1 rounded-lg text-sm text-brand-medium focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20"
                          >
                            <Paperclip className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.6} />
                            <span className="truncate">{att.file_name}</span>
                            <Download className="w-3.5 h-3.5 ml-auto flex-shrink-0" strokeWidth={1.6} />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function StatBox({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className={`rounded-xl p-4 text-center border ${
      alert ? 'bg-semantic-red-bg border-semantic-red/20' : 'bg-surface border-border'
    }`}>
      <p className={`text-2xl font-medium ${alert ? 'text-semantic-red' : 'text-text-primary'}`}>
        {value}
      </p>
      <p className="text-xs text-text-secondary mt-0.5">{label}</p>
    </div>
  )
}
