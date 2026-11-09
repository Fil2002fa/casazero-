'use client'

import type { ReactNode } from 'react'
import { AwaitingDeliveryChip } from '@/components/AwaitingDelivery'
import { PromemoriaBadge } from '@/components/ui/Badge'
import { SidePanel } from '@/components/ui/SidePanel'
import { cn } from '@/lib/cn'
import { formatDateIT } from '@/lib/formatDate'
import { rowScopeLabel } from '@/lib/maintenance-list'
import type { DetailSupplier, Field, SupplierSection, VoceDetail } from '@/lib/maintenance-detail'
import { pluralize } from '@/lib/pluralize'
import { StateBadge } from './StateBadge'

// Contenuto del pannello a destra di una voce. Il guscio (portal, sfondo
// cliccabile, X, focus, Tab, Escape, scroll) è SidePanel, condiviso con il
// pannello Configura.
//
// Sola lettura. Tutti i valori e i testi arrivano da maintenance-detail.ts
// (verify:maintdetail): qui solo lo schermo. Le voci consigliate (promemoria)
// non mostrano stato, prossima né ultima, e nessun linguaggio di scadenza.
//
// onClose deve avere identità stabile (useCallback nel chiamante): se cambia a
// ogni render l'effetto del focus si riesegue e ruba il focus.

type Props = {
  detail: VoceDetail | null
  onClose: () => void
}

export function MaintenanceDetailPanel({ detail, onClose }: Props) {
  if (detail === null) {
    // SidePanel resta montato anche chiuso: il suo hook restituisce il focus alla riga.
    return <SidePanel open={false} onClose={onClose} titleId="voce-detail-title" title="">{null}</SidePanel>
  }
  const { row } = detail
  const reminder = row.group === 'consigliate'

  return (
    <SidePanel open onClose={onClose} titleId="voce-detail-title" title={detail.title} subtitle={`${detail.category} · ${rowScopeLabel(row)}`}>
      <div className="space-y-6 px-4 py-5 sm:px-6">
        <Section title="Stato">
          <dl className="space-y-2.5">
            {reminder ? (
              <Item label="Frequenza">
                {detail.frequency.mixed || row.frequencies.length !== 1
                  ? <FieldValue field={detail.frequency} />
                  : <PromemoriaBadge frequencyMonths={row.frequencies[0]} />}
              </Item>
            ) : (
              <>
                <Item label="Stato">
                  <div className="space-y-1">
                    <StateBadge state={row.group as Exclude<typeof row.group, 'consigliate'>} />
                    {row.awaitingCount > 0 && row.awaitingCount < row.timedCount && (
                      <div><AwaitingDeliveryChip count={row.awaitingCount} total={row.timedCount} /></div>
                    )}
                  </div>
                </Item>
                <Item label="Prossima">
                  {row.next === null ? <Dash /> : (
                    <span className="text-sm text-text-primary">
                      {formatDateIT(row.next.date)}
                      {row.next.unitLabel !== null && row.unitCount > 1 && (
                        <span className="text-text-secondary"> · {row.next.unitLabel}</span>
                      )}
                    </span>
                  )}
                </Item>
                <Item label="Ultima">
                  {row.last === null ? <Dash /> : <span className="text-sm text-text-primary">{formatDateIT(row.last)}</span>}
                </Item>
                <Item label="Frequenza"><FieldValue field={detail.frequency} /></Item>
              </>
            )}
            <Item label="Regola"><FieldValue field={detail.rule} /></Item>
            <Item label="Chi la chiude"><FieldValue field={detail.closer} /></Item>
            <Item label="Obbligo"><FieldValue field={detail.obligation} /></Item>
            <Item label="Info garanzia"><FieldValue field={detail.warranty} /></Item>
          </dl>
        </Section>

        {detail.units !== null && (
          <Section title={`Unità · ${detail.units.length}`}>
            <UnitsGrid detail={detail} reminder={reminder} />
          </Section>
        )}

        {detail.suppliers !== null && (
          <Section title="Chi chiamare">
            <Suppliers section={detail.suppliers} />
          </Section>
        )}

        <Section title="Storico">
          <History detail={detail} />
        </Section>
      </div>
    </SidePanel>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      {children}
    </section>
  )
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 items-start">
      <dt className="text-xs text-text-secondary pt-0.5">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

function Dash() {
  return (
    <>
      <span aria-hidden="true" className="text-sm text-text-secondary">—</span>
      <span className="sr-only">non disponibile</span>
    </>
  )
}

function FieldValue({ field }: { field: Field }) {
  if (field.mixed) return <span className="text-sm text-text-secondary">Valori diversi tra le unità</span>
  if (field.text === null) return <Dash />
  return <span className="text-sm text-text-primary">{field.text}</span>
}

const FIELD_ORDER = ['frequency', 'closer', 'rule', 'obligation', 'warranty'] as const
const FIELD_NAMES: Record<(typeof FIELD_ORDER)[number], string> = {
  frequency: 'Frequenza',
  closer: 'Chi la chiude',
  rule: 'Regola',
  obligation: 'Obbligo',
  warranty: 'Info garanzia',
}

function UnitsGrid({ detail, reminder }: { detail: VoceDetail; reminder: boolean }) {
  const units = detail.units ?? []
  const divergent = FIELD_ORDER.flatMap(k => {
    const f = detail[k]
    return f.mixed ? [{ key: k, name: FIELD_NAMES[k], entries: f.entries }] : []
  })
  return (
    <div className="space-y-3">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border text-xs text-text-secondary">
            <th scope="col" className="py-1.5 pr-2 font-medium">Unità</th>
            <th scope="col" className="py-1.5 pr-2 font-medium">Stato</th>
            <th scope="col" className="py-1.5 pr-2 font-medium">Prossima</th>
            <th scope="col" className="py-1.5 font-medium">Ultima</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {units.map(u => (
            <tr key={u.itemId} aria-current={u.highlighted ? 'true' : undefined} className={cn(u.highlighted && 'bg-brand-light')}>
              <th scope="row" className="py-2 pr-2 pl-1 text-sm font-medium text-text-primary align-top">{u.label}</th>
              <td className="py-2 pr-2 align-top text-sm">
                {u.state === null ? <Dash /> : <StateBadge state={u.state} wrap />}
              </td>
              <td className="py-2 pr-2 align-top text-sm text-text-primary whitespace-nowrap">
                {u.next === null ? <Dash /> : formatDateIT(u.next)}
              </td>
              <td className="py-2 align-top text-sm text-text-primary whitespace-nowrap">
                {u.last === null ? <Dash /> : formatDateIT(u.last)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {reminder && <p className="text-xs text-text-secondary">Voce consigliata: nessuno stato, nessuna data.</p>}
      {divergent.length > 0 && (
        <div className="rounded-lg bg-background p-3 space-y-1.5">
          <p className="text-xs font-medium text-text-primary">Valori diversi tra le unità</p>
          {divergent.map(d => (
            <p key={d.key} className="text-xs text-text-secondary break-words">
              <span className="font-medium text-text-primary">{d.name}</span>
              {' — '}
              {d.entries.map(e => e.text).join(' · ')}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function SupplierLine({ supplier }: { supplier: DetailSupplier }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-text-primary break-words">{supplier.name}</p>
      {supplier.phone && (
        <p className="text-xs"><a href={`tel:${supplier.phone}`} className="text-brand-dark underline">{supplier.phone}</a></p>
      )}
      {supplier.email && (
        <p className="text-xs break-all"><a href={`mailto:${supplier.email}`} className="text-brand-dark underline">{supplier.email}</a></p>
      )}
    </div>
  )
}

function Suppliers({ section }: { section: SupplierSection }) {
  if (section.kind === 'none') {
    return <p className="text-sm text-text-secondary">Nessun fornitore collegato.</p>
  }
  if (section.kind === 'single') return <SupplierLine supplier={section.supplier} />
  return (
    <ul className="space-y-2.5">
      {section.entries.map((e, idx) => (
        <li key={`${e.unitLabel}-${idx}`} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3">
          <span className="text-xs text-text-secondary pt-0.5">{e.unitLabel}</span>
          {e.supplier ? <SupplierLine supplier={e.supplier} /> : <span className="text-sm text-text-secondary">Nessun fornitore collegato</span>}
        </li>
      ))}
    </ul>
  )
}

function History({ detail }: { detail: VoceDetail }) {
  const { entries, hidden } = detail.history
  if (entries.length === 0) return <p className="text-sm text-text-secondary">Nessuna esecuzione registrata.</p>
  return (
    <div className="space-y-2">
      <ol className="divide-y divide-border rounded-lg border border-border">
        {entries.map(h => (
          <li key={h.id} className="px-3 py-2">
            <p className="text-sm font-medium text-text-primary">
              {formatDateIT(h.completedAt)}
              <span className="font-normal text-text-secondary"> · {h.scope}</span>
            </p>
            <p className="text-xs text-text-secondary break-words">
              Eseguito da {h.registeredBy}
              {h.attachmentCount > 0 && ` · ${pluralize(h.attachmentCount, 'allegato', 'allegati')}`}
            </p>
          </li>
        ))}
      </ol>
      {hidden > 0 && <p className="text-xs text-text-secondary">e altri {hidden}</p>}
    </div>
  )
}
