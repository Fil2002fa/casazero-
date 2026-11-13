import Link from 'next/link'
import { ArrowRight, CalendarClock, CalendarDays, Check } from 'lucide-react'
import { formatDateIT } from '@/lib/formatDate'
import { formatRelativeDue } from '@/lib/maintenance-status'
import styles from './home.module.css'

type TopItem = { id: string; title: string; dueISO: string | null }

// Card verde "La tua casa, oggi". Tre varianti: in attesa di consegna, con
// scadenze (conteggi + voce più urgente a carico del residente), tutto in regola.
// I numeri arrivano già calcolati (lib/home-summary.ts): qui solo presentazione.
export function HomeRiepilogo({ awaitingDelivery, overdue, soon, top, today }: {
  awaitingDelivery: boolean
  overdue: number
  soon: number
  top: { item: TopItem; overdue: boolean } | null
  today: string
}) {
  const total = overdue + soon

  if (total === 0 && awaitingDelivery) {
    return (
      <section className={styles.overview} aria-label="La tua casa, oggi">
        <p>In attesa della consegna</p>
        <h2>Il tuo piano inizierà quando riceverai le chiavi.</h2>
        <span className={styles.okPill}><CalendarDays size={14} aria-hidden="true" /> Le scadenze partono dalla consegna dell&apos;appartamento.</span>
      </section>
    )
  }

  if (total === 0) {
    return (
      <section className={styles.overview} aria-label="La tua casa, oggi">
        <p>La tua casa, oggi</p>
        <h2>Tutto in regola.</h2>
        <span className={styles.okPill}><Check size={14} aria-hidden="true" /> Nessuna scadenza nei prossimi 30 giorni.</span>
      </section>
    )
  }

  return (
    <section className={styles.overview} aria-label="La tua casa, oggi">
      <p>La tua casa, oggi</p>
      <h2>{total === 1 ? 'Ci è 1 cosa a cui pensare.' : `Ci sono ${total} cose a cui pensare.`}</h2>
      <div className={styles.counts}>
        <span><strong>{overdue}</strong> {overdue === 1 ? 'scaduta' : 'scadute'}</span>
        <span><strong>{soon}</strong> entro 30 giorni</span>
      </div>
      {top && (
        <Link href={`/manutenzioni/${top.item.id}`} className={styles.ovNext}>
          <div className={styles.symbol} aria-hidden="true"><CalendarClock size={19} /></div>
          <div className={styles.ovBody}>
            <div className={styles.ovLabel}>{top.overdue ? 'Da fare subito' : 'La prossima'}</div>
            <div className={styles.ovTitle}>{top.item.title}</div>
            {top.item.dueISO && (
              <div className={styles.ovSub}>
                {top.overdue ? `Scaduta il ${formatDateIT(top.item.dueISO)}` : formatRelativeDue(top.item.dueISO, today)}
              </div>
            )}
          </div>
          <ArrowRight size={16} className={styles.arrow} aria-hidden="true" />
        </Link>
      )}
      <Link href="/manutenzioni" className={styles.ovLink}>
        Vedi tutte le manutenzioni <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  )
}
