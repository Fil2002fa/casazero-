import Link from 'next/link'
import { formatRelativeDue, isCountable, isOverdueLive, resolveCompletionMode, type LiveStatusItem } from '@/lib/maintenance-status'
import { pluralize } from '@/lib/pluralize'

type RiepilogoItem = LiveStatusItem & {
  id: string
  maintenance_templates: (NonNullable<LiveStatusItem['maintenance_templates']> & { title: string }) | null
}

export function HomeRiepilogo({ items, today, awaitingDelivery }: {
  items: RiepilogoItem[]
  today: string
  awaitingDelivery: boolean
}) {
  const dated = items
    .filter(i => isCountable(i) && resolveCompletionMode(i) !== 'promemoria' && i.status !== 'completata' && i.next_due_date)
    .sort((a, b) => a.next_due_date!.localeCompare(b.next_due_date!))
  const limit = new Date(`${today}T00:00:00Z`)
  limit.setUTCDate(limit.getUTCDate() + 30)
  const limitISO = limit.toISOString().slice(0, 10)
  const actions = dated.filter(i => resolveCompletionMode(i) === 'residente' && i.next_due_date! <= limitISO)
  const first = actions[0]
  const next = dated.find(i => i.next_due_date! >= today)
  const shown = first ?? next

  return (
    <section className="bg-surface rounded-xl border border-border p-4 space-y-2 [overflow-wrap:anywhere]">
      <h2 className="font-serif text-lg font-semibold text-text-primary">Cosa fare adesso</h2>
      {awaitingDelivery ? (
        <p className="text-base text-text-secondary">Le scadenze partono dalla consegna dell&apos;appartamento.</p>
      ) : (
        <>
          {!first && <p className="text-base font-medium text-brand-dark">Tutto in regola</p>}
          {shown && (
            <Link href={`/manutenzioni/${shown.id}`} className="block rounded-lg py-2 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20">
              <p className="text-base font-medium text-text-primary">{shown.maintenance_templates?.title ?? 'Manutenzione'}</p>
              <p className="text-sm text-text-secondary mt-1">
                {shown.next_due_date! < today ? (
                  <>{isOverdueLive(shown, today) ? 'Scaduta il ' : 'In corso · data prevista: '}{new Date(`${shown.next_due_date}T00:00:00Z`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</>
                ) : formatRelativeDue(shown.next_due_date!, today)}
              </p>
              <span className="text-sm text-brand-medium underline">Vai al dettaglio</span>
            </Link>
          )}
          {actions.length > 1 && <p className="text-sm text-text-secondary">Altre {pluralize(actions.length - 1, 'voce da seguire', 'voci da seguire')}</p>}
        </>
      )}
    </section>
  )
}
