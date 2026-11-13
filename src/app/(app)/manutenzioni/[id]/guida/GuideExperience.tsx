'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, AlertTriangle, Check, X } from 'lucide-react'
import { MaintenanceIllustration } from '../../MaintenanceIllustration'
import type { MaintenanceIllustrationAsset } from '../../maintenance-illustrations'

type Props = {
  title: string
  description: string | null
  whoDoesIt: string
  steps: string[]
  stepIllustrations?: readonly (readonly MaintenanceIllustrationAsset[])[]
  detailHref: string
}

export function GuideExperience({ title, description, whoDoesIt, steps, stepIllustrations, detailHref }: Props) {
  const [started, setStarted] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const finished = started && stepIndex >= steps.length
  const progress = finished ? 100 : started ? Math.round(((stepIndex + 1) / steps.length) * 100) : 0

  return (
    <main className="mx-auto min-h-[calc(100dvh-5rem)] max-w-xl px-5 pb-8 pt-3 [overflow-wrap:anywhere]">
      <div className="flex min-h-11 items-center justify-between">
        <Link href={detailHref} className="inline-flex min-h-11 items-center gap-1 rounded-lg text-sm font-medium text-brand-dark focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-medium/40">
          <X aria-hidden="true" className="h-4 w-4" /> Esci dalla guida
        </Link>
        <span className="text-xs text-text-secondary">{started && !finished ? `${stepIndex + 1} di ${steps.length}` : 'Guida'}</span>
      </div>

      <header className="space-y-3 pb-6 pt-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.13em] text-brand-medium">Guida residente</p>
        <h1 className="font-serif text-[34px] leading-[1.12] tracking-[-0.035em] text-brand-dark">{title}</h1>
        {description && <p className="text-[13px] leading-[1.7] text-text-secondary">{description}</p>}
      </header>

      {started && (
        <div className="mb-6" aria-label={`Avanzamento ${progress}%`}>
          <div className="mb-2 flex gap-1.5" aria-hidden="true">
            {steps.map((step, index) => <span key={`${index}-${step}`} className={`h-1.5 flex-1 rounded-full ${finished || index <= stepIndex ? 'bg-brand-medium' : 'bg-brand-light'}`} />)}
          </div>
          <p className="text-xs text-text-secondary">{finished ? 'Guida completata' : `Passaggio ${stepIndex + 1} di ${steps.length}`}</p>
        </div>
      )}

      {!started ? (
        <section className="space-y-5">
          <div className="rounded-2xl border border-brand-medium/20 bg-brand-light/40 p-4">
            <h2 className="mb-2 font-serif text-xl text-brand-dark">Prima di iniziare</h2>
            <p className="text-sm leading-relaxed text-text-secondary">{whoDoesIt}</p>
            <p className="mt-3 border-t border-brand-medium/15 pt-3 text-xs leading-relaxed text-text-secondary">Segui il manuale del produttore. Se le indicazioni non corrispondono al tuo impianto o serramento, interrompi la guida e rivolgiti a un tecnico.</p>
          </div>
          <p className="text-xs leading-relaxed text-text-secondary">Questa guida accompagna i passaggi disponibili. Non registra l’intervento.</p>
          <button type="button" onClick={() => setStarted(true)} className="min-h-12 w-full rounded-xl bg-brand-dark px-5 py-3 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-medium/50">
            Inizia
          </button>
        </section>
      ) : finished ? (
        <section className="space-y-5 rounded-2xl border border-border bg-surface p-5">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-light text-brand-dark"><Check aria-hidden="true" className="h-6 w-6" /></span>
          <h2 className="font-serif text-2xl text-brand-dark">Hai terminato la guida</h2>
          <p className="text-sm leading-relaxed text-text-secondary">Nessun intervento è stato registrato. Se devi registrare un completamento, torna al dettaglio della manutenzione.</p>
          <Link href={detailHref} className="flex min-h-12 items-center justify-center rounded-xl bg-brand-dark px-5 py-3 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-medium/50">Torna al dettaglio</Link>
        </section>
      ) : (
        <section className="space-y-5">
          <div aria-live="polite" className="rounded-2xl border border-border bg-surface p-5">
            <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.12em] text-brand-medium">Passaggio {stepIndex + 1}</p>
            <p className="font-serif text-[25px] leading-[1.4] text-brand-dark">{steps[stepIndex]}</p>
            {stepIllustrations?.[stepIndex]?.map(asset => <MaintenanceIllustration key={`${stepIndex}-${asset.src}`} asset={asset} />)}
          </div>
          <aside className="flex items-start gap-3 rounded-xl border border-semantic-amber/25 bg-semantic-amber/10 px-4 py-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-semantic-amber" />
            <div>
              <p className="text-xs font-semibold text-text-primary">Chi può intervenire</p>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">{whoDoesIt}</p>
            </div>
          </aside>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" disabled={stepIndex === 0} onClick={() => setStepIndex(index => Math.max(0, index - 1))} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-brand-dark disabled:opacity-45 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-medium/40">
              <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Indietro
            </button>
            <button type="button" onClick={() => setStepIndex(index => index + 1)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-dark px-3 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-medium/50">
              {stepIndex === steps.length - 1 ? 'Concludi' : 'Avanti'} <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}
    </main>
  )
}
