'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { CompletionMode, MaintenanceStatus, ObligationType } from '@/types/database'
import { StatusBadge, PromemoriaBadge } from '@/components/ui/Badge'
import { AWAITING_DELIVERY_LABEL } from '@/lib/maintenance-status'
import { OBLIGATION_LABELS } from '@/components/MaintenanceBadge'
import { Button } from '@/components/ui/Button'
import { formatFrequency } from '@/lib/formatFrequency'
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
}

export function ManutenzioniList({
  daFare, inProgramma, consigli, residenceName, unitLabel,
}: {
  daFare: ListItem[]
  inProgramma: ListItem[]
  consigli: ListItem[]
  residenceName: string
  unitLabel: string
}) {
  const [sheetItem, setSheetItem] = useState<ListItem | null>(null)

  const unitFirst = (a: ListItem, b: ListItem) => Number(a.unitId === null) - Number(b.unitId === null)
  const scadute = [...daFare].sort(unitFirst)
  const future = [...inProgramma, ...consigli].sort(unitFirst)
  const awaitingUnit = inProgramma.some(i => i.unitId !== null && i.isAwaitingDelivery)
  // Le date non arrivano al componente: il gruppo entro 30 giorni non è deducibile.
  const unknownDates = inProgramma.some(i => !i.isAwaitingDelivery)

  return (
    <div className="space-y-6">
      {!awaitingUnit && (
        <div className="flex flex-wrap gap-2 text-sm">
          {scadute.length === 0 && !unknownDates ? (
            <span className="rounded-full bg-brand-light text-brand-dark px-3 py-1">Tutto in regola</span>
          ) : (
            <>
              <span className="rounded-full bg-semantic-red-bg text-semantic-red px-3 py-1">{scadute.length} scadute</span>
              <span className="rounded-full bg-surface border border-border text-text-secondary px-3 py-1">
                {unknownDates ? 'Entro 30 giorni: date non disponibili' : '0 entro 30 giorni'}
              </span>
            </>
          )}
        </div>
      )}

      <Section title="Scadute" count={scadute.length}>
        {scadute.map(item => (
          /* Link e Button sono fratelli, mai annidati; il Link porta lui il
             padding così l'area di tocco copre la card fino ai bordi. */
          <div key={item.id} className="bg-surface rounded-xl border border-border">
            <Link
              href={`/manutenzioni/${item.id}`}
              className="flex items-center gap-3 p-4 rounded-t-xl active:bg-background"
            >
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status="scaduta" />
                  {item.obligationType && <ObligationLabel value={item.obligationType} />}
                </div>
                <p className="text-base font-medium text-text-primary [overflow-wrap:anywhere]">{item.title}</p>
                <p className="text-sm text-text-secondary">{formatFrequency(item.frequencyMonths)}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-text-secondary flex-shrink-0" strokeWidth={1.6} />
            </Link>
            <div className="px-4 pb-4">
              {item.mode === 'residente' ? (
                <Button className="w-full" onClick={() => setSheetItem(item)}>
                  Registra completamento
                </Button>
              ) : (
                <p className="text-sm text-text-secondary">A carico dell&apos;amministratore di condominio.</p>
              )}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Più avanti" count={future.length}>
        {future.map(item => (
          <Link
            key={item.id}
            href={`/manutenzioni/${item.id}`}
            className="flex items-center gap-3 bg-surface rounded-xl border border-border p-4 active:bg-background"
          >
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                {item.mode === 'promemoria' ? <PromemoriaBadge frequencyMonths={item.frequencyMonths} /> : item.isAwaitingDelivery ? (
                  <span className="inline-flex items-center rounded-full h-[22px] px-2.5 text-xs font-medium bg-neutral-600/7 text-neutral-600">
                    {AWAITING_DELIVERY_LABEL}
                  </span>
                ) : <StatusBadge status={item.status} />}
                {item.obligationType && <ObligationLabel value={item.obligationType} />}
              </div>
              <p className="text-base font-medium text-text-primary [overflow-wrap:anywhere]">{item.title}</p>
              {item.mode !== 'promemoria' && <p className="text-sm text-text-secondary">{formatFrequency(item.frequencyMonths)}</p>}
            </div>
            <ChevronRight className="w-4 h-4 text-text-secondary flex-shrink-0" strokeWidth={1.6} />
          </Link>
        ))}
      </Section>

      {sheetItem && (
        <CompletionSheet
          open
          onClose={() => setSheetItem(null)}
          itemId={sheetItem.id}
          unitId={sheetItem.unitId!}
          residenceId={sheetItem.residenceId}
          title={sheetItem.title}
          residenceName={residenceName}
          unitLabel={unitLabel}
        />
      )}
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null
  return (
    <section className="space-y-2">
      <h2 className="text-[13px] font-medium text-neutral-500">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function ObligationLabel({ value }: { value: ObligationType }) {
  return <span className="text-xs text-text-secondary">{OBLIGATION_LABELS[value]}</span>
}
