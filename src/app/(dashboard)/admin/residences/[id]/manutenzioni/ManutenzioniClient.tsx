'use client'

import { useState } from 'react'
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

  // Gli item archiviati spariscono dal piano attivo; le loro completion restano nel fascicolo
  const liveItems = items.filter(i => i.activation_status !== 'archiviata')

  // Contatori dalle sorgenti canoniche
  const scaduteCount = liveItems.filter(i => i.status === 'scaduta').length
  const inCorsoCount = liveItems.filter(i => i.status === 'in_corso').length
  const years = [...new Set(completions.map(c => Number(c.completed_at.slice(0, 4))))].sort((a, b) => b - a)
  const yearCompletions = completions.filter(c => Number(c.completed_at.slice(0, 4)) === selectedYear)
  const completedCount = yearCompletions.length

  function toggleFilter(f: FilterState) {
    setActiveFilter(prev => (prev === f ? null : f))
  }

  // Mappa per categoria (tutti gli item live)
  const byCategory = new Map<string, ItemRow[]>()
  for (const item of liveItems) {
    const cat = item.maintenance_templates?.category ?? 'Altro'
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat)!.push(item)
  }

  // Mappa filtrata per scaduta/in_corso
  let displayMap: Map<string, ItemRow[]>
  if (activeFilter === null) {
    displayMap = byCategory
  } else if (activeFilter !== 'completate') {
    const status = activeFilter
    displayMap = new Map(
      [...byCategory.entries()]
        .map(([cat, catItems]): [string, ItemRow[]] => [
          cat,
          catItems.filter(i => i.status === status),
        ])
        .filter(([, catItems]) => catItems.length > 0)
    )
  } else {
    displayMap = new Map()
  }

  // Mappa completamenti per categoria (solo quando filtro Completate attivo)
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

      {/* Lista completamenti (filtro Completate) */}
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
                  const effMode = (item.completion_mode ?? tpl?.completion_mode) as CompletionMode
                  const effObl  = (item.obligation_type  ?? tpl?.obligation_type)  as ObligationType
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

      {/* Lista manutenzioni (nessun filtro o Scadute/In corso) */}
      {activeFilter !== 'completate' && (
        displayMap.size === 0 && activeFilter !== null ? (
          <div className="bg-surface rounded-xl border border-border p-6 text-center">
            <p className="text-sm text-text-secondary">
              Nessuna voce {activeFilter === 'scaduta' ? 'scaduta' : 'in corso'}.
            </p>
          </div>
        ) : (
          Array.from(displayMap.entries()).map(([cat, catItems]) => (
            <section key={cat} className="space-y-2">
              <h2 className="text-sm font-medium text-text-primary">{cat}</h2>
              <div className="space-y-2">
                {catItems.map(item => {
                  const tpl = item.maintenance_templates
                  const effPriority = (item.priority ?? tpl?.priority ?? 'N2') as MaintenancePriority
                  const effMode = (item.completion_mode ?? tpl?.completion_mode) as CompletionMode
                  const effObl  = (item.obligation_type  ?? tpl?.obligation_type)  as ObligationType
                  const formattedDue = item.next_due_date
                    ? new Date(item.next_due_date).toLocaleDateString('it-IT', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })
                    : null

                  return (
                    <div key={item.id} className="bg-surface rounded-xl border border-border overflow-hidden">
                      <div className="p-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-text-primary truncate">{tpl?.title}</p>
                            <MaintenanceBadge mode={effMode} obligation={effObl} status={item.status} />
                          </div>
                          <div className="flex gap-3 mt-1 flex-wrap">
                            {item.units && (
                              <span className="text-xs text-text-secondary">
                                {formatUnitLabel(item.units.label)}
                                {item.unit_id && unitPrimaryNames[item.unit_id]
                                  ? ` · ${unitPrimaryNames[item.unit_id]}`
                                  : null}
                              </span>
                            )}
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
                })}
              </div>
            </section>
          ))
        )
      )}
    </div>
  )
}
