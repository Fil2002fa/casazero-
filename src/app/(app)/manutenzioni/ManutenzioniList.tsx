'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Building2, ChevronRight, Search, Wrench } from 'lucide-react'
import type { CompletionMode, MaintenanceStatus, ObligationType } from '@/types/database'
import { StatusBadge, PromemoriaBadge, TypeBadge } from '@/components/ui/Badge'
import { AWAITING_DELIVERY_LABEL } from '@/lib/maintenance-status'
import { MODE_LABELS, OBLIGATION_LABELS } from '@/lib/maintenance-labels'
import { Button } from '@/components/ui/Button'
import { formatFrequency } from '@/lib/formatFrequency'
import { pluralize } from '@/lib/pluralize'
import { CompletionSheet } from './CompletionSheet'

export type ListItem = {
  id: string
  title: string
  category: string
  obligationType: ObligationType | null
  frequencyMonths: number | null
  status: MaintenanceStatus
  isAwaitingDelivery: boolean
  mode: CompletionMode | null
  unitId: string | null
  residenceId: string
  nextDueDate: string | null
}

type Bucket = 'overdue' | 'soon' | 'future' | 'progress' | 'delivery' | 'reminder'
const GROUPS: { key: Bucket; label: string }[] = [
  { key: 'overdue', label: 'Scadute' },
  { key: 'soon', label: 'Entro 30 giorni' },
  { key: 'progress', label: 'In corso' },
  { key: 'future', label: 'Più avanti' },
  { key: 'delivery', label: AWAITING_DELIVERY_LABEL },
  { key: 'reminder', label: 'Consigli per la casa' },
]
const FILTERS = [
  { key: 'all', label: 'Tutte' },
  { key: 'attention', label: 'Da fare' },
  { key: 'common', label: 'Parti comuni' },
] as const

// Un'unica classificazione alimenta riepilogo, filtri e gruppi.
function listBucket(item: ListItem, today: string, horizon: string): Bucket {
  if (item.mode === 'promemoria') return 'reminder'
  if (item.status === 'in_corso') return 'progress'
  if (item.isAwaitingDelivery || !item.nextDueDate) return 'delivery'
  if (item.status === 'scaduta') return 'overdue'
  if (item.nextDueDate >= today && item.nextDueDate <= horizon) return 'soon'
  return 'future'
}

function dateLabel(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

export function ManutenzioniList({ items, today, residenceName, unitLabel }: {
  items: ListItem[]
  today: string
  residenceName: string
  unitLabel: string
}) {
  const [sheetItem, setSheetItem] = useState<ListItem | null>(null)
  const [filter, setFilter] = useState<typeof FILTERS[number]['key']>('all')
  const [query, setQuery] = useState('')
  const horizonDate = new Date(`${today}T00:00:00Z`)
  horizonDate.setUTCDate(horizonDate.getUTCDate() + 30)
  const horizon = horizonDate.toISOString().slice(0, 10)
  const classified = items.map(item => ({ item, bucket: listBucket(item, today, horizon) }))
  const unitItems = classified.filter(({ item }) => item.unitId !== null)
  const overdueCount = unitItems.filter(({ bucket }) => bucket === 'overdue').length
  const soonCount = unitItems.filter(({ bucket }) => bucket === 'soon').length
  const awaitingCount = unitItems.filter(({ bucket }) => bucket === 'delivery').length
  const progressCount = unitItems.filter(({ bucket }) => bucket === 'progress').length
  const attentionCount = overdueCount + soonCount
  const term = query.trim().toLocaleLowerCase('it')
  const filtered = classified.filter(({ item, bucket }) => {
    const matchesFilter = filter === 'all' || (filter === 'common' ? item.unitId === null
      : item.unitId !== null && (bucket === 'overdue' || bucket === 'soon'))
    const searchable = [item.title, item.category, item.unitId === null ? 'Parti comuni' : 'Appartamento',
      item.mode ? MODE_LABELS[item.mode] : '', item.obligationType ? OBLIGATION_LABELS[item.obligationType] : '']
    return matchesFilter && searchable.join(' ').toLocaleLowerCase('it').includes(term)
  })

  return (
    <div>
      <section aria-label="Riepilogo del tuo appartamento" className="relative overflow-hidden rounded-[20px] bg-brand-dark p-5 text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full border border-white/15" />
        <p className="text-xs text-white/80">La tua casa, oggi</p>
        <h2 className="mt-2 font-serif text-[25px] leading-tight">
          {items.length === 0 ? 'Il piano non contiene ancora manutenzioni.'
            : attentionCount > 0 ? `${pluralize(attentionCount, 'attività', 'attività')} a cui pensare.`
            : awaitingCount > 0 ? 'Alcune voci attendono la consegna.'
            : progressCount > 0 ? 'Ci sono interventi in corso.'
            : unitItems.length === 0 ? 'Consulta le manutenzioni comuni.' : 'Nessuna attività urgente, per ora.'}
        </h2>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <span className="rounded-xl bg-white/10 px-3 py-2">{pluralize(overdueCount, 'scaduta', 'scadute')}</span>
          <span className="rounded-xl bg-white/10 px-3 py-2">{soonCount} entro 30 giorni</span>
        </div>
        {awaitingCount > 0 && <p className="mt-3 text-xs leading-relaxed text-white/80">Per le voci in attesa, le date partiranno dalla consegna registrata.</p>}
      </section>

      <div role="group" aria-label="Filtra le manutenzioni" className="flex flex-wrap gap-2 pb-3 pt-5">
        {FILTERS.map(option => (
          <button key={option.key} type="button" aria-pressed={filter === option.key} onClick={() => setFilter(option.key)}
            className={`min-h-11 rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-medium/40 ${filter === option.key ? 'border-brand-dark bg-brand-dark text-white' : 'border-border bg-surface text-text-secondary'}`}>
            {option.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-text-secondary" />
        <input type="search" aria-label="Cerca manutenzione" placeholder="Cerca una manutenzione" value={query} onChange={event => setQuery(event.target.value)}
          className="min-h-12 w-full rounded-xl border border-border bg-surface py-3 pl-10 pr-3 text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-medium/30" />
      </div>

      <div aria-live="polite" aria-atomic="true" className="sr-only">{pluralize(filtered.length, 'voce trovata', 'voci trovate')}</div>
      {[false, true].map(common => {
        const scoped = filtered.filter(({ item }) => (item.unitId === null) === common)
        if (!scoped.length) return null
        return (
          <section key={String(common)} className="mt-7" aria-label={common ? 'Parti comuni' : 'Il tuo appartamento'}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-serif text-2xl tracking-tight text-brand-dark">{common ? 'Parti comuni' : 'Il tuo appartamento'}</h2>
              <span className="shrink-0 text-xs text-text-secondary">{pluralize(scoped.length, 'voce', 'voci')}</span>
            </div>
            {common && <p className="mt-2 text-xs leading-relaxed text-text-secondary">Le manutenzioni condivise della tua residenza.</p>}
            {GROUPS.map(group => {
              const rows = scoped.filter(({ bucket }) => bucket === group.key)
              if (!rows.length) return null
              return (
                <div key={group.key} className="mt-5">
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-widest text-text-secondary">{group.label}</h3>
                  <div className="space-y-3">
                    {rows.map(({ item, bucket }) => (
                      <div key={item.id} className="overflow-hidden rounded-2xl border border-border bg-surface">
                        <Link href={`/manutenzioni/${item.id}`} className="block rounded-2xl p-4 transition-colors hover:bg-brand-light/20 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-brand-medium/40">
                          <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand-dark">
                              {common ? <Building2 aria-hidden="true" className="h-5 w-5" /> : <Wrench aria-hidden="true" className="h-5 w-5" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-sm font-medium leading-snug text-text-primary [overflow-wrap:anywhere]">{item.title}</h4>
                              <p className="mt-1 text-xs text-text-secondary [overflow-wrap:anywhere]">{[item.category, common ? 'Parti comuni' : 'Appartamento'].filter(Boolean).join(' · ')}</p>
                            </div>
                            <ChevronRight aria-hidden="true" className="mt-2 h-4 w-4 shrink-0 text-text-secondary" />
                          </div>
                          <div className="my-3 flex flex-wrap items-center gap-2">
                            {bucket === 'reminder' ? <PromemoriaBadge frequencyMonths={item.frequencyMonths} />
                              : bucket === 'delivery' ? <span className="text-xs text-text-secondary">{AWAITING_DELIVERY_LABEL}</span>
                              : bucket === 'soon' ? <span className="rounded-full bg-semantic-amber-bg px-2.5 py-1 text-xs font-medium text-semantic-amber">Entro 30 giorni</span>
                              : <StatusBadge status={item.status} />}
                            {item.obligationType && <TypeBadge obligationType={item.obligationType} />}
                            {item.mode && <span className="text-xs text-text-secondary">{MODE_LABELS[item.mode]}</span>}
                          </div>
                          {bucket === 'delivery' ? <p className="border-t border-border pt-3 text-xs text-text-secondary">Le date partiranno dalla consegna.</p>
                            : bucket !== 'reminder' && (
                              <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
                                <div><dt className="text-text-secondary">{bucket === 'overdue' ? 'Scaduta il' : 'Prossima scadenza'}</dt><dd className="mt-1 font-medium text-brand-dark">{item.nextDueDate ? dateLabel(item.nextDueDate) : 'Non disponibile'}</dd></div>
                                <div><dt className="text-text-secondary">Frequenza</dt><dd className="mt-1 font-medium text-brand-dark">{item.frequencyMonths == null ? 'Non indicata' : formatFrequency(item.frequencyMonths)}</dd></div>
                              </dl>
                            )}
                        </Link>
                        {bucket === 'overdue' && item.mode === 'residente' && item.unitId !== null && (
                          <div className="px-4 pb-4"><Button className="w-full" onClick={() => setSheetItem(item)}>Registra completamento</Button></div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </section>
        )
      })}
      {filtered.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-6 text-center">
          <p className="font-medium text-text-primary">{items.length ? 'Nessun risultato' : 'Nessuna manutenzione nel piano'}</p>
          <p className="mt-2 text-sm text-text-secondary">{items.length ? 'Prova un altro termine o cambia filtro.' : 'Qui troverai le voci attive della tua casa.'}</p>
          {items.length > 0 && <Button variant="ghost" className="mt-3" onClick={() => { setQuery(''); setFilter('all') }}>Mostra tutte le voci</Button>}
        </div>
      )}
      {sheetItem && (
        <CompletionSheet open onClose={() => setSheetItem(null)} itemId={sheetItem.id} unitId={sheetItem.unitId!}
          residenceId={sheetItem.residenceId} title={sheetItem.title} residenceName={residenceName} unitLabel={unitLabel} />
      )}
    </div>
  )
}
