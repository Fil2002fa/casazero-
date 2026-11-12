import Link from 'next/link'
import { isInCorso, isOverdueLive, type LiveStatusItem } from '@/lib/maintenance-status'

type RiepilogoItem = LiveStatusItem & {
  id: string
  maintenance_templates: (NonNullable<LiveStatusItem['maintenance_templates']> & { title: string }) | null
}

export function HomeRiepilogo({ shown, today, awaitingDelivery, urgentCount }: {
  shown: RiepilogoItem | null
  today: string
  awaitingDelivery: boolean
  urgentCount: number
}) {
  return (
    <section className="bg-surface rounded-xl border border-border p-4 space-y-3 [overflow-wrap:anywhere]">
      <h2 className="font-serif text-lg font-semibold text-text-primary">Cosa fare adesso</h2>
      {urgentCount > 0 ? (
        <Link href="/manutenzioni" className="block rounded-lg bg-semantic-red-bg px-3 py-2 text-semantic-red">
          <p className="text-sm font-medium">{urgentCount} {urgentCount === 1 ? 'scadenza richiede' : 'scadenze richiedono'} attenzione</p>
          <p className="text-xs mt-0.5">Tocca per vedere tutte</p>
        </Link>
      ) : awaitingDelivery ? (
        <p className="text-base text-text-secondary">Le scadenze partono dalla consegna dell&apos;appartamento.</p>
      ) : (
        <div className="rounded-lg bg-brand-light px-3 py-2">
          <p className="text-base font-medium text-brand-dark">Tutto in regola</p>
          <p className="text-sm text-brand-medium mt-0.5">Non hai manutenzioni urgenti</p>
        </div>
      )}
      {shown && (
        <Link href={`/manutenzioni/${shown.id}`} className="block rounded-lg py-2 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20">
          <p className="text-xs text-text-secondary mb-1">{urgentCount > 0 ? 'Da seguire adesso' : 'Prossima manutenzione'}</p>
          <p className="text-base font-medium text-text-primary">{shown.maintenance_templates?.title ?? 'Manutenzione'}</p>
          <p className="text-sm text-text-secondary mt-1">
            {isInCorso(shown) && 'In corso · '}
            {shown.next_due_date ? (
              <>{isOverdueLive(shown, today) ? 'Scaduta il ' : ''}{new Date(`${shown.next_due_date}T00:00:00Z`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</>
            ) : 'Data prevista non disponibile'}
          </p>
          <span className="text-sm text-brand-medium underline">Vai al dettaglio</span>
        </Link>
      )}
    </section>
  )
}
