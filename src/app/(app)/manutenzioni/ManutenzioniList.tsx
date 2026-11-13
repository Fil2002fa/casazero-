'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Building2, ChevronRight, Search, Wrench, Wind, Droplets, ShieldCheck, AlertTriangle, Clock, Check } from 'lucide-react'
import type { CompletionMode, MaintenanceStatus, ObligationType } from '@/types/database'
import { PromemoriaBadge } from '@/components/ui/Badge'
import { AWAITING_DELIVERY_LABEL } from '@/lib/maintenance-status'
import { MODE_LABELS, OBLIGATION_LABELS } from '@/lib/maintenance-labels'
import styles from './maintenance-v5.module.css'
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
  lastCompletedAt: string | null
  historyUnavailable: boolean
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

const RESIDENT_MODE_LABELS: Record<CompletionMode, string> = {
  residente: 'Tocca a te',
  amministratore: 'Se ne occupa l’amministratore',
  promemoria: 'Solo promemoria',
}

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
  return new Date(value.length === 10 ? `${value}T00:00:00Z` : value).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

function TaskIcon({ category, common }: { category: string; common: boolean }) {
  const name = category.toLocaleLowerCase('it')
  const Icon = /ventil|climat/.test(name) ? Wind : /idric|acqua/.test(name) ? Droplets
    : /sicurezza/.test(name) ? ShieldCheck : common ? Building2 : Wrench
  return <Icon aria-hidden="true" size={22} strokeWidth={1.8} />
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
      item.mode ? MODE_LABELS[item.mode] : '', item.mode ? RESIDENT_MODE_LABELS[item.mode] : '',
      item.obligationType ? OBLIGATION_LABELS[item.obligationType] : '']
    return matchesFilter && searchable.join(' ').toLocaleLowerCase('it').includes(term)
  })

  return (
    <div>
      <section aria-label="Riepilogo del tuo appartamento" className={styles.overview}>
        <p>La tua casa, oggi</p>
        <h2>
          {items.length === 0 ? 'Il piano non contiene ancora manutenzioni.'
            : attentionCount > 0 ? `${attentionCount === 1 ? 'C’è' : 'Ci sono'} ${pluralize(attentionCount, 'cosa', 'cose')} a cui pensare.`
            : awaitingCount > 0 ? 'Alcune voci attendono la consegna.'
            : progressCount > 0 ? 'Ci sono interventi in corso.'
            : unitItems.length === 0 ? 'Consulta le manutenzioni comuni.' : 'Tutto in regola.'}
        </h2>
        <div className={styles.counts}>
          <span><strong>{overdueCount}</strong> {overdueCount === 1 ? 'scaduta' : 'scadute'}</span>
          <span><strong>{soonCount}</strong> entro 30 giorni</span>
        </div>
        {awaitingCount > 0 && <p className={styles.deliveryNote}>Per le voci in attesa, le date partiranno dalla consegna registrata.</p>}
      </section>

      <div role="group" aria-label="Filtra le manutenzioni" className={styles.filters}>
        {FILTERS.map(option => (
          <button key={option.key} type="button" aria-pressed={filter === option.key} onClick={() => setFilter(option.key)}
            className={styles.filter}>
            {option.label}
          </button>
        ))}
      </div>
      <div className={styles.search}>
        <Search aria-hidden="true" size={17} />
        <input type="search" aria-label="Cerca manutenzione" placeholder="Cerca una manutenzione" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} />
      </div>

      <div aria-live="polite" aria-atomic="true" className="sr-only">{pluralize(filtered.length, 'voce trovata', 'voci trovate')}</div>
      {[false, true].map(common => {
        const scoped = filtered.filter(({ item }) => (item.unitId === null) === common)
        if (!scoped.length) return null
        return (
          <section key={String(common)} aria-label={common ? 'Parti comuni' : 'Il tuo appartamento'}>
            <div className={styles.sectionHeader}>
              <h2>{common ? 'Parti comuni' : 'Il tuo appartamento'}</h2>
              <span>{pluralize(scoped.length, 'voce', 'voci')}</span>
            </div>
            {common && <p className={styles.commonHint}>Consultabili da te, gestite dall’amministratore.</p>}
            {GROUPS.map(group => {
              const rows = scoped.filter(({ bucket }) => bucket === group.key)
              if (!rows.length) return null
              return (
                <div key={group.key}>
                  <h3 className={styles.groupLabel}>{group.label}</h3>
                  <div>
                    {rows.map(({ item, bucket }) => (
                      <div key={item.id} className={styles.card}>
                        <Link href={`/manutenzioni/${item.id}`} className={styles.cardLink}>
                          <div className={styles.cardTop}>
                            <span className={styles.symbol}>
                              <TaskIcon category={item.category} common={common} />
                            </span>
                            <div className={styles.cardBody}>
                              <h4>{item.title}</h4>
                              <p>{[item.category, common ? 'Parti comuni' : 'Appartamento'].filter(Boolean).join(' · ')}</p>
                            </div>
                            <ChevronRight aria-hidden="true" size={17} className={styles.arrow} />
                          </div>
                          <div className={styles.metadata}>
                            {bucket === 'reminder' ? <PromemoriaBadge frequencyMonths={item.frequencyMonths} className={styles.reminder} />
                              : bucket === 'delivery' ? <span className={styles.chip}>{AWAITING_DELIVERY_LABEL}</span>
                              : <span className={`${styles.chip} ${styles[bucket] ?? ''}`}>
                                {bucket === 'overdue' ? <AlertTriangle aria-hidden="true" size={12} /> : bucket === 'soon' || bucket === 'progress' ? <Clock aria-hidden="true" size={12} /> : <Check aria-hidden="true" size={12} />}
                                {bucket === 'overdue' ? 'Scaduta' : bucket === 'soon' ? 'Entro 30 giorni' : bucket === 'progress' ? 'In corso' : 'In programma'}
                              </span>}
                            {item.obligationType && <span className={`${styles.chip} ${styles[item.obligationType === 'A' ? 'legal' : item.obligationType === 'B' ? 'recommended' : 'advice']}`}>{OBLIGATION_LABELS[item.obligationType]}</span>}
                            {item.mode && <span className={styles.chip}>{RESIDENT_MODE_LABELS[item.mode]}</span>}
                          </div>
                          {bucket === 'delivery' ? <p className={styles.footHint}>Le date partiranno dalla consegna.</p>
                            : bucket !== 'reminder' && (
                              <dl className={styles.metaStrip}>
                                <div><dt>Prossima scadenza</dt><dd>{item.nextDueDate ? <time dateTime={item.nextDueDate}>{dateLabel(item.nextDueDate)}</time> : 'Non disponibile'}</dd></div>
                                <div><dt>Ultima esecuzione</dt><dd>{item.historyUnavailable ? 'Storico non disponibile' : item.lastCompletedAt ? <time dateTime={item.lastCompletedAt}>{dateLabel(item.lastCompletedAt)}</time> : 'Nessun intervento registrato'}</dd></div>
                              </dl>
                            )}
                        </Link>
                        {bucket === 'overdue' && item.mode === 'residente' && item.unitId !== null && (
                          <div className={styles.registration}><button type="button" className={styles.button} onClick={() => setSheetItem(item)}>Registra completamento</button></div>
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
        <div className={styles.empty}>
          <Search size={24} aria-hidden="true" />
          <strong>{items.length ? 'Nessun risultato' : 'Nessuna manutenzione nel piano'}</strong>
          <p>{items.length ? 'Prova un altro termine o cambia filtro.' : 'Qui troverai le voci attive della tua casa.'}</p>
          {items.length > 0 && <button type="button" className={styles.button} onClick={() => { setQuery(''); setFilter('all') }}>Mostra tutte le voci</button>}
        </div>
      )}
      {sheetItem && (
        <CompletionSheet open onClose={() => setSheetItem(null)} itemId={sheetItem.id} unitId={sheetItem.unitId!}
          residenceId={sheetItem.residenceId} title={sheetItem.title} residenceName={residenceName} unitLabel={unitLabel} />
      )}
    </div>
  )
}
