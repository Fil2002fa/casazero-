'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { CompletionMode, MaintenanceStatus, ObligationType } from '@/types/database'
import { StatusBadge, PromemoriaBadge, TypeBadge } from '@/components/ui/Badge'
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
  mode: CompletionMode | null
  unitId: string | null
  residenceId: string
}

export function ManutenzioniList({
  daFare, inProgramma, consigli,
}: {
  daFare: ListItem[]
  inProgramma: ListItem[]
  consigli: ListItem[]
}) {
  const [sheetItem, setSheetItem] = useState<ListItem | null>(null)

  const tuttoInOrdine = daFare.length === 0 && inProgramma.length === 0 && consigli.length === 0

  return (
    <div className="space-y-6">
      {tuttoInOrdine && (
        <div className="bg-brand-light rounded-xl px-4 py-3">
          <p className="text-base font-medium text-brand-dark">Tutto in ordine</p>
          <p className="text-sm text-brand-medium mt-0.5">Nessuna manutenzione in scadenza</p>
        </div>
      )}

      <Section title="Da fare" count={daFare.length}>
        {daFare.map(item => (
          <div key={item.id} className="bg-surface rounded-xl border border-border p-4 space-y-3">
            <Link href={`/manutenzioni/${item.id}`} className="block space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status="scaduta" />
                {item.obligationType && <TypeBadge obligationType={item.obligationType} />}
              </div>
              <p className="text-base font-medium text-text-primary">{item.title}</p>
              <p className="text-sm text-text-secondary">{formatFrequency(item.frequencyMonths)}</p>
            </Link>
            {item.mode === 'residente' ? (
              <Button className="w-full" onClick={() => setSheetItem(item)}>
                Registra completamento
              </Button>
            ) : (
              <p className="text-sm text-text-secondary">A carico dell&apos;amministratore di condominio.</p>
            )}
          </div>
        ))}
      </Section>

      <Section title="In programma" count={inProgramma.length}>
        {inProgramma.map(item => (
          <Link
            key={item.id}
            href={`/manutenzioni/${item.id}`}
            className="block bg-surface rounded-xl border border-border p-4 space-y-1.5"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={item.status} />
              {item.obligationType && <TypeBadge obligationType={item.obligationType} />}
            </div>
            <p className="text-base font-medium text-text-primary">{item.title}</p>
            <p className="text-sm text-text-secondary">{formatFrequency(item.frequencyMonths)}</p>
          </Link>
        ))}
      </Section>

      <Section title="Consigli per la tua casa" count={consigli.length}>
        {consigli.map(item => (
          <Link
            key={item.id}
            href={`/manutenzioni/${item.id}`}
            className="block bg-surface rounded-xl border border-border p-4 space-y-1.5"
          >
            <PromemoriaBadge frequencyMonths={item.frequencyMonths} />
            <p className="text-base font-medium text-text-primary">{item.title}</p>
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
