'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { MaintenanceBadge } from '@/components/MaintenanceBadge'
import { ItemConfigForm } from './ItemConfigForm'
import type { MaintenancePriority, MaintenanceStatus, CompletionMode, ObligationType, ItemActivation } from '@/types/database'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import { formatFrequency } from '@/lib/formatFrequency'

export type ItemRow = {
  id: string
  status: MaintenanceStatus
  next_due_date: string | null
  unit_id: string | null
  priority: MaintenancePriority | null
  completion_mode: CompletionMode | null
  obligation_type: ObligationType | null
  activation_status: ItemActivation
  frequency_months: number | null
  warranty_info: string | null
  supplier_id: string | null
  maintenance_templates: {
    title: string
    category: string
    priority: MaintenancePriority
    completion_mode: CompletionMode
    obligation_type: ObligationType
    frequency_months: number
    scope: string
  } | null
  units: { label: string } | null
  suppliers: { id: string; name: string } | null
}

export type CompletionRow = {
  id: string
  completed_at: string
  item_id: string
  performed_by_name: string | null
}

export type FilterState = 'scaduta' | 'in_corso' | 'completate' | null

// Risoluzione assi: item override → template fallback. Unico call-site per testa e corpo,
// così non nascono calcoli paralleli divergenti. Refactor puro dei calcoli inline preesistenti.
function resolveAxes(item: ItemRow) {
  const tpl = item.maintenance_templates
  return {
    mode:       (item.completion_mode ?? tpl?.completion_mode) as CompletionMode,
    obligation: (item.obligation_type ?? tpl?.obligation_type) as ObligationType,
    priority:   (item.priority ?? tpl?.priority ?? 'N2') as MaintenancePriority,
  }
}

function daysOverdue(dateStr: string | null, today: Date): number {
  if (!dateStr) return 0
  return Math.floor((today.getTime() - new Date(dateStr).getTime()) / 86400000)
}

// Natural sort delle label unità: le label senza numero (nomi custom, es. "Appartamento
// Rossi") vanno prima in ordine alfabetico; le "Unità N" numerate seguono in ordine crescente.
function compareUnitLabels(a: string, b: string): number {
  const na = a.match(/\d+/)
  const nb = b.match(/\d+/)
  if (na && nb) {
    const diff = parseInt(na[0], 10) - parseInt(nb[0], 10)
    return diff !== 0 ? diff : a.localeCompare(b, 'it')
  }
  if (na) return 1  // solo a numerata → dopo
  if (nb) return -1 // solo b numerata → a (alfabetica) prima
  return a.localeCompare(b, 'it')
}

interface Props {
  residenceId: string
  items: ItemRow[]
  completions: CompletionRow[]
  suppliers: { id: string; name: string }[]
  unitPrimaryNames: Record<string, string>
  initialFilter?: FilterState
}

export function ManutenzioniClient({ residenceId, items, completions, suppliers, unitPrimaryNames, initialFilter = null }: Props) {
  const [activeFilter, setActiveFilter] = useState<FilterState>(initialFilter)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null)

  const today = new Date()

  // Gli item archiviati spariscono dal piano attivo; le loro completion restano nel fascicolo
  const liveItems = items.filter(i => i.activation_status !== 'archiviata')

  // Contatori dalle sorgenti canoniche (invariati: liveItems e yearCompletions)
  const scaduteCount = liveItems.filter(i => i.status === 'scaduta').length
  const inCorsoCount = liveItems.filter(i => i.status === 'in_corso').length
  const years = [...new Set(completions.map(c => Number(c.completed_at.slice(0, 4))))].sort((a, b) => b - a)
  const yearCompletions = completions.filter(c => Number(c.completed_at.slice(0, 4)) === selectedYear)
  const completedCount = yearCompletions.length

  function toggleFilter(f: FilterState) {
    setActiveFilter(prev => (prev === f ? null : f))
  }

  // Opzioni del select-unità: derivate una volta da liveItems (mai da filteredItems),
  // così restano tutte le unità anche quando il piano è filtrato.
  const unitOptions = (() => {
    const seen = new Map<string, string>()
    for (const i of liveItems) {
      if (i.unit_id && i.units && !seen.has(i.unit_id)) seen.set(i.unit_id, i.units.label)
    }
    return [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => compareUnitLabels(a.label, b.label))
  })()

  // Filtro-unità come drill-down: gli item scope=condominio (unit_id null) restano sempre visibili.
  const filteredItems = selectedUnitId
    ? liveItems.filter(i => i.unit_id === selectedUnitId || i.unit_id === null)
    : liveItems

  // TESTA — zona attenzione (per-istanza). Guardia promemoria strutturale: N1 non scade mai.
  const allAttentionItems = filteredItems
    .filter(i => (i.status === 'scaduta' || i.status === 'in_corso') && resolveAxes(i).mode !== 'promemoria')
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'scaduta' ? -1 : 1
      if (a.status === 'scaduta') {
        const da = a.next_due_date ? new Date(a.next_due_date).getTime() : Infinity
        const db = b.next_due_date ? new Date(b.next_due_date).getTime() : Infinity
        return da - db // più in ritardo (data più vecchia) prima
      }
      return 0
    })

  // CORPO — piano per tipo, raggruppato per categoria (esterno) → titolo template (interno).
  const byTemplate = new Map<string, Map<string, ItemRow[]>>()
  for (const item of filteredItems) {
    const cat = item.maintenance_templates?.category ?? 'Altro'
    const title = item.maintenance_templates?.title ?? 'Senza titolo'
    if (!byTemplate.has(cat)) byTemplate.set(cat, new Map())
    const inner = byTemplate.get(cat)!
    if (!inner.has(title)) inner.set(title, [])
    inner.get(title)!.push(item)
  }

  // Filtro Scadute/In corso: mostra solo i tipi con almeno un'istanza in quello stato
  // (guardia promemoria). Il drill-down mostra comunque TUTTE le istanze del tipo.
  let displayTemplate: Map<string, Map<string, ItemRow[]>>
  if (activeFilter === null || activeFilter === 'completate') {
    displayTemplate = activeFilter === 'completate' ? new Map() : byTemplate
  } else {
    const status = activeFilter
    displayTemplate = new Map()
    for (const [cat, inner] of byTemplate) {
      const keptInner = new Map<string, ItemRow[]>()
      for (const [title, typeItems] of inner) {
        const hasMatch = typeItems.some(i => i.status === status && resolveAxes(i).mode !== 'promemoria')
        if (hasMatch) keptInner.set(title, typeItems)
      }
      if (keptInner.size > 0) displayTemplate.set(cat, keptInner)
    }
  }

  // Mappa completamenti per categoria (fascicolo, invariata — lookup su items RAW)
  const completionsByCategory = new Map<string, { completion: CompletionRow; item: ItemRow }[]>()
  if (activeFilter === 'completate') {
    for (const c of yearCompletions) {
      const item = items.find(i => i.id === c.item_id)
      if (!item) continue
      const cat = item.maintenance_templates?.category ?? 'Altro'
      if (!completionsByCategory.has(cat)) completionsByCategory.set(cat, [])
      completionsByCategory.get(cat)!.push({ completion: c, item })
    }
  }

  return (
    <div className="p-4 space-y-5">
      {/* Card-contatore cliccabili */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => toggleFilter('scaduta')}
          className={`rounded-xl p-3 text-center border transition-all ${
            activeFilter === 'scaduta'
              ? 'bg-semantic-red-bg border-semantic-red/40 ring-2 ring-semantic-red/20'
              : scaduteCount > 0
              ? 'bg-semantic-red-bg border-semantic-red/20'
              : 'bg-surface border-border'
          }`}
        >
          <p className={`text-xl font-medium ${scaduteCount > 0 ? 'text-semantic-red' : 'text-text-primary'}`}>
            {scaduteCount}
          </p>
          <p className="text-[10px] text-text-secondary">Scadute</p>
        </button>

        <button
          onClick={() => toggleFilter('in_corso')}
          className={`rounded-xl p-3 text-center border transition-all ${
            activeFilter === 'in_corso'
              ? 'bg-semantic-amber-bg border-semantic-amber/40 ring-2 ring-semantic-amber/20'
              : inCorsoCount > 0
              ? 'bg-semantic-amber-bg border-semantic-amber/20'
              : 'bg-surface border-border'
          }`}
        >
          <p className={`text-xl font-medium ${inCorsoCount > 0 ? 'text-semantic-amber' : 'text-text-primary'}`}>
            {inCorsoCount}
          </p>
          <p className="text-[10px] text-text-secondary">In corso</p>
        </button>

        <button
          onClick={() => toggleFilter('completate')}
          className={`rounded-xl p-3 text-center border transition-all ${
            activeFilter === 'completate'
              ? 'bg-brand-light border-brand-medium/40 ring-2 ring-brand-medium/20'
              : 'bg-surface border-border'
          }`}
        >
          <p className={`text-xl font-medium ${activeFilter === 'completate' ? 'text-brand-dark' : 'text-text-primary'}`}>
            {completedCount}
          </p>
          <p className="text-[10px] text-text-secondary">Completate</p>
        </button>
      </div>

      {/* Selettore anni — visibile solo con filtro Completate */}
      {activeFilter === 'completate' && years.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {years.map(year => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                selectedYear === year
                  ? 'bg-brand-dark text-white'
                  : 'bg-surface border border-border text-text-secondary'
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      )}

      {/* Lista completamenti (filtro Completate) — fascicolo invariato */}
      {activeFilter === 'completate' && (
        completionsByCategory.size === 0 ? (
          <div className="bg-surface rounded-xl border border-border p-6 text-center">
            <p className="text-sm text-text-secondary">
              Nessun intervento completato nel {selectedYear}.
            </p>
          </div>
        ) : (
          Array.from(completionsByCategory.entries()).map(([cat, entries]) => (
            <section key={cat} className="space-y-2">
              <h2 className="text-sm font-medium text-text-primary">{cat}</h2>
              <div className="space-y-2">
                {entries.map(({ completion, item }) => {
                  const tpl = item.maintenance_templates
                  const { mode: effMode, obligation: effObl } = resolveAxes(item)
                  const dateStr = new Date(completion.completed_at).toLocaleDateString('it-IT', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })
                  return (
                    <div key={completion.id} className="bg-surface rounded-xl border border-border p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-text-primary truncate">{tpl?.title}</p>
                        <MaintenanceBadge mode={effMode} obligation={effObl} status="completata" />
                      </div>
                      <div className="flex gap-3 mt-1 flex-wrap">
                        {item.units && (
                          <span className="text-xs text-text-secondary">{formatUnitLabel(item.units.label)}</span>
                        )}
                        <span className="text-xs text-brand-medium font-medium">
                          Completata il {dateStr}
                        </span>
                        {completion.performed_by_name && (
                          <span className="text-xs text-text-secondary">· {completion.performed_by_name}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))
        )
      )}

      {/* Select filtro-unità (drill-down secondario) */}
      {activeFilter !== 'completate' && unitOptions.length > 0 && (
        <select
          value={selectedUnitId ?? ''}
          onChange={e => { setSelectedUnitId(e.target.value || null); setExpandedTemplate(null) }}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none"
        >
          <option value="">Tutte le unità</option>
          {unitOptions.map(u => (
            <option key={u.id} value={u.id}>{formatUnitLabel(u.label)}</option>
          ))}
        </select>
      )}

      {/* TESTA — zona attenzione (per-istanza) */}
      {activeFilter !== 'completate' && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-text-primary">
            {allAttentionItems.length === 0
              ? 'Tutto in regola'
              : `${allAttentionItems.length} ${allAttentionItems.length === 1 ? 'intervento richiede' : 'interventi richiedono'} attenzione`}
          </h2>
          {allAttentionItems.length === 0 ? (
            <div className="bg-brand-light rounded-xl p-4 flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-medium flex-shrink-0" />
              <p className="text-sm text-brand-dark">Nessun intervento in ritardo.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {allAttentionItems.map(item => {
                const tpl = item.maintenance_templates
                const { mode: effMode, obligation: effObl } = resolveAxes(item)
                const unitLabel = item.unit_id === null
                  ? 'Condominio'
                  : (item.units ? formatUnitLabel(item.units.label) : '—')
                const accent = item.status === 'scaduta' ? 'border-l-semantic-red' : 'border-l-semantic-amber'
                const n = daysOverdue(item.next_due_date, today)
                return (
                  <div key={item.id} className={`bg-surface rounded-xl border border-border border-l-4 ${accent} p-3`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-text-primary truncate">{tpl?.title}</p>
                      <MaintenanceBadge mode={effMode} obligation={effObl} status={item.status} />
                    </div>
                    <div className="flex gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-text-secondary">{unitLabel}</span>
                      {item.status === 'scaduta' ? (
                        <span className="text-xs text-semantic-red">
                          in ritardo da {n} {n === 1 ? 'giorno' : 'giorni'}
                        </span>
                      ) : (
                        <span className="text-xs text-semantic-amber">in corso</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* CORPO — piano per tipo (categoria → righe-tipo → drill-down unità) */}
      {activeFilter !== 'completate' && (
        displayTemplate.size === 0 && activeFilter !== null ? (
          <div className="bg-surface rounded-xl border border-border p-6 text-center">
            <p className="text-sm text-text-secondary">
              Nessuna voce {activeFilter === 'scaduta' ? 'scaduta' : 'in corso'}.
            </p>
          </div>
        ) : (
          Array.from(displayTemplate.entries()).map(([cat, inner]) => (
            <section key={cat} className="space-y-2">
              <h2 className="text-sm font-medium text-text-primary">{cat}</h2>
              <div className="space-y-2">
                {Array.from(inner.entries()).map(([title, typeItems]) => {
                  const rep = typeItems[0]
                  const { mode, obligation } = resolveAxes(rep)
                  const isCondominio = typeItems.every(i => i.unit_id === null)
                  const inRitardo = typeItems.filter(
                    i => (i.status === 'scaduta' || i.status === 'in_corso') && resolveAxes(i).mode !== 'promemoria'
                  ).length
                  const freq = rep.frequency_months ?? rep.maintenance_templates?.frequency_months
                  const key = `${cat}__${title}`
                  const isExpanded = expandedTemplate === key

                  return (
                    <div key={title} className="bg-surface rounded-xl border border-border overflow-hidden">
                      <button
                        onClick={() => setExpandedTemplate(isExpanded ? null : key)}
                        className="w-full p-3 flex items-center gap-3 text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-text-primary truncate">{title}</p>
                            <MaintenanceBadge mode={mode} obligation={obligation} status="in_attesa" />
                          </div>
                          <div className="flex gap-3 mt-1 flex-wrap">
                            <span className="text-xs text-text-secondary">
                              {isCondominio ? 'Condominio' : `${typeItems.length} unità`}
                            </span>
                            <span className="text-xs text-text-secondary">{formatFrequency(freq)}</span>
                            {inRitardo > 0 && (
                              <span className="text-xs text-semantic-red font-medium">{inRitardo} in ritardo</span>
                            )}
                          </div>
                        </div>
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-text-secondary flex-shrink-0" strokeWidth={1.6} />
                          : <ChevronDown className="w-4 h-4 text-text-secondary flex-shrink-0" strokeWidth={1.6} />}
                      </button>

                      {isExpanded && (
                        <div className="border-t border-border">
                          {isCondominio ? (
                            <UnitRow
                              item={rep}
                              label="Condominio"
                              residenceId={residenceId}
                              suppliers={suppliers}
                              primaryName={null}
                            />
                          ) : (
                            typeItems.map(item => (
                              <UnitRow
                                key={item.id}
                                item={item}
                                label={item.units ? formatUnitLabel(item.units.label) : '—'}
                                residenceId={residenceId}
                                suppliers={suppliers}
                                primaryName={item.unit_id ? unitPrimaryNames[item.unit_id] ?? null : null}
                              />
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))
        )
      )}
    </div>
  )
}

// Riga-unità nel drill-down: dettaglio per-istanza + Configura (ItemConfigForm) invariata.
function UnitRow({ item, label, residenceId, suppliers, primaryName }: {
  item: ItemRow
  label: string
  residenceId: string
  suppliers: { id: string; name: string }[]
  primaryName: string | null
}) {
  const tpl = item.maintenance_templates
  const { mode: effMode, obligation: effObl } = resolveAxes(item)
  const formattedDue = item.next_due_date
    ? new Date(item.next_due_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-text-primary">
            {label}{primaryName ? ` · ${primaryName}` : ''}
          </span>
          <MaintenanceBadge mode={effMode} obligation={effObl} status={item.status} size="xs" />
        </div>
        <div className="flex gap-3 mt-1 flex-wrap">
          {effMode === 'promemoria' ? (
            <span className="text-xs text-semantic-blue">
              Promemoria · {formatFrequency(item.frequency_months ?? tpl?.frequency_months)}
            </span>
          ) : formattedDue ? (
            <span className={`text-xs ${item.status === 'scaduta' ? 'text-semantic-red' : 'text-text-secondary'}`}>
              {item.status === 'scaduta' ? 'Scaduta ' : 'Scade '}{formattedDue}
            </span>
          ) : null}
          {item.suppliers && (
            <span className="text-xs text-brand-medium">{item.suppliers.name}</span>
          )}
        </div>
      </div>
      <ItemConfigForm
        itemId={item.id}
        residenceId={residenceId}
        currentMode={effMode}
        currentObligation={effObl}
        currentFrequency={item.frequency_months ?? tpl?.frequency_months ?? null}
        currentWarranty={item.warranty_info}
        currentSupplierId={item.supplier_id}
        suppliers={suppliers}
      />
    </div>
  )
}
