'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, AlertTriangle, Check, X } from 'lucide-react'
import { MaintenanceIllustration } from '../../MaintenanceIllustration'
import type { MaintenanceIllustrationAsset } from '../../maintenance-illustrations'
import styles from './guide-v5.module.css'

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
    <div className={styles.guide}>
      <div className="flex min-h-11 items-center justify-between">
        <Link href={detailHref} className={styles.exit}>
          <X aria-hidden="true" className="h-4 w-4" /> Esci dalla guida
        </Link>
      </div>

      <header className={styles.header}>
        <p className={styles.kicker}>Guida pratica · {title}</p>
        {!started && <h1 className={styles.title}>{title}</h1>}
        {!started && description && <p className={styles.text}>{description}</p>}
      </header>

      {started && (
        <div>
          <p className={styles.counter}>{finished ? 'Guida completata' : `Passaggio ${stepIndex + 1} di ${steps.length}`}</p>
          <div className={styles.progress} role="progressbar" aria-label="Avanzamento della guida" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            {steps.map((step, index) => <span key={`${index}-${step}`} className={finished || index < stepIndex ? styles.complete : index === stepIndex ? styles.current : undefined} />)}
          </div>
        </div>
      )}

      {!started ? (
        <section>
          <div className={styles.intro}>
            <h2 className={styles.introTitle}>Prima di iniziare</h2>
            <p className={styles.text}>{whoDoesIt}</p>
            <p className={styles.manual}>Segui il manuale del produttore. Se le indicazioni non corrispondono al tuo impianto o serramento, interrompi la guida e rivolgiti a un tecnico.</p>
          </div>
          <p className={styles.footnote}>Questa guida accompagna i passaggi disponibili. Non registra l’intervento.</p>
          <button type="button" onClick={() => setStarted(true)} className={styles.start}>
            Inizia
          </button>
        </section>
      ) : finished ? (
        <section className={styles.finished}>
          <span className={styles.finishedIcon}><Check aria-hidden="true" size={24} /></span>
          <h1 className={styles.title}>Hai terminato la guida</h1>
          <p className={styles.text}>Nessun intervento è stato registrato. Se devi registrare un completamento, torna al dettaglio della manutenzione.</p>
          <Link href={detailHref} className={styles.start}>Torna al dettaglio</Link>
        </section>
      ) : (
        <section>
          <div aria-live="polite" className={styles.step}>
            <h1 className={styles.title}>{steps[stepIndex]}</h1>
            {stepIllustrations?.[stepIndex]?.map(asset => <MaintenanceIllustration key={`${stepIndex}-${asset.src}`} asset={asset} />)}
          </div>
          <aside className={styles.note}>
            <AlertTriangle aria-hidden="true" className={styles.warningIcon} />
            <div>
              <p className={styles.noteTitle}>Chi può intervenire</p>
              <p className={styles.noteText}>{whoDoesIt}</p>
            </div>
          </aside>
          <div className={styles.actions}>
            <button type="button" disabled={stepIndex === 0} onClick={() => setStepIndex(index => Math.max(0, index - 1))} className={styles.secondary}>
              <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Indietro
            </button>
            <button type="button" onClick={() => setStepIndex(index => index + 1)} className={styles.primary}>
              {stepIndex === steps.length - 1 ? 'Concludi' : 'Avanti'} <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
