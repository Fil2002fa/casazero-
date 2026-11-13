'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, X } from 'lucide-react'
import { MaintenanceIllustration } from '../../MaintenanceIllustration'
import type { MaintenanceIllustrationAsset } from '../../maintenance-illustrations'
import type { ResidentGuideContent } from './guide-content'
import styles from './guide-v5.module.css'

type Props = {
  content: ResidentGuideContent
  stepIllustrations?: readonly (MaintenanceIllustrationAsset | undefined)[]
  detailHref: string
}

export function GuideExperience({ content, stepIllustrations, detailHref }: Props) {
  const { title, description, beforeStart, whoCanIntervene, steps } = content
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
        <p className={styles.kicker}>Guida informativa · {title}</p>
        {!started && <h1 className={styles.title}>{title}</h1>}
        {!started && description && <p className={styles.text}>{description}</p>}
      </header>

      {started && (
        <div>
          <p className={styles.counter}>{finished ? 'Lettura terminata' : `Argomento ${stepIndex + 1} di ${steps.length}`}</p>
          <div className={styles.progress} role="progressbar" aria-label="Avanzamento della guida" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            {steps.map((step, index) => <span key={`${index}-${step.title}`} className={finished || index < stepIndex ? styles.complete : index === stepIndex ? styles.current : undefined} />)}
          </div>
        </div>
      )}

      {!started ? (
        <section>
          <div className={styles.intro}>
            <h2 className={styles.introTitle}>Prima di iniziare</h2>
            <p className={styles.manual}>{beforeStart}</p>
            <aside className={styles.note}>
              <AlertTriangle aria-hidden="true" className={styles.warningIcon} />
              <div>
                <p className={styles.noteTitle}>Chi può intervenire</p>
                <p className={styles.noteText}>{whoCanIntervene}</p>
              </div>
            </aside>
          </div>
          <p className={styles.footnote}>La consultazione non registra l’esecuzione di una manutenzione.</p>
          <button type="button" onClick={() => setStarted(true)} className={styles.start}>
            Continua
          </button>
        </section>
      ) : finished ? (
        <section className={styles.finished}>
          <span className={styles.finishedIcon}><BookOpen aria-hidden="true" size={24} /></span>
          <h1 className={styles.title}>Hai terminato la lettura</h1>
          <p className={styles.text}>La lettura non conferma l’esecuzione di una manutenzione e non registra alcun intervento.</p>
          <Link href={detailHref} className={styles.start}>Torna al dettaglio</Link>
        </section>
      ) : (
        <section>
          <div aria-live="polite" className={styles.step}>
            <h1 className={styles.title}>{steps[stepIndex].title}</h1>
            <p className={styles.text}>{steps[stepIndex].body}</p>
            {stepIllustrations?.[stepIndex] && <MaintenanceIllustration asset={stepIllustrations[stepIndex]} />}
          </div>
          <div className={styles.actions}>
            <button type="button" disabled={stepIndex === 0} onClick={() => setStepIndex(index => Math.max(0, index - 1))} className={styles.secondary}>
              <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Indietro
            </button>
            <button type="button" onClick={() => setStepIndex(index => index + 1)} className={styles.primary}>
              {stepIndex === steps.length - 1 ? 'Termina la lettura' : 'Continua'} <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
