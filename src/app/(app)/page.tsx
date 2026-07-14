import Link from 'next/link'
import { BookOpen, CalendarClock, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'
import { MaintenanceCard } from '@/components/MaintenanceCard'
import { OBLIGATION_LABELS } from '@/components/MaintenanceBadge'
import type { MaintenancePriority, ObligationType } from '@/types/database'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import { pluralize } from '@/lib/pluralize'
import {
  isCountable, isInCorso, isOverdueLive, resolveCompletionMode, resolveLiveStatus,
  formatRelativeDue, todayISO,
  LIVE_STATUS_FIELDS, LIVE_STATUS_TEMPLATE_FIELDS, type LiveStatusItem,
} from '@/lib/maintenance-status'

// Card urgenti: campi live (helper) + display. Estende LiveStatusItem così lo
// stato mostrato deriva da next_due_date, mai dal campo status salvato.
type ItemRow = LiveStatusItem & {
  id: string
  priority: MaintenancePriority | null
  maintenance_templates:
    | (NonNullable<LiveStatusItem['maintenance_templates']> & {
        title: string
        category: string
        priority: MaintenancePriority
        scope: string
      })
    | null
}

// Prossima manutenzione: campi live (helper) + display. Estende LiveStatusItem
// così isCountable/resolveCompletionMode restano l'unica fonte di verità.
type NextItemRow = LiveStatusItem & {
  id: string
  obligation_type: ObligationType | null
  frequency_months: number | null
  maintenance_templates:
    | (NonNullable<LiveStatusItem['maintenance_templates']> & {
        title: string
        obligation_type: ObligationType | null
        frequency_months: number | null
      })
    | null
}

export default async function HomePage() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const today = todayISO()

  // In parallelo (indipendenti tra loro, scopate da RLS): membership, urgenti e
  // candidati "prossima manutenzione".
  const [
    { data: membership },
    { data: rawUrgent },
    { data: rawNext },
  ] = await Promise.all([
    supabase
      .from('unit_members')
      .select('unit_id, units(id, label, residence_id, residences(name, photo_url))')
      .eq('profile_id', profile.id)
      .is('ended_at', null)
      .maybeSingle(),
    // Candidati urgenti: si scarta in SQL solo ciò che non può mai esserlo
    // (completata, esclusa dal piano) e si deriva lo stato in JS con
    // isOverdueLive/isInCorso. Filtrare su status IN ('scaduta','in_corso')
    // qui darebbe un conteggio stale: quel campo lo avanza solo il cron.
    supabase
      .from('maintenance_items')
      .select(`
        id, ${LIVE_STATUS_FIELDS}, priority,
        maintenance_templates!inner(${LIVE_STATUS_TEMPLATE_FIELDS}, title, category, priority, scope)
      `)
      .neq('status', 'completata')
      .eq('activation_status', 'inclusa')
      .order('next_due_date', { ascending: true, nullsFirst: false }),
    // Candidati alla "Prossima manutenzione": item datati futuri, non completati,
    // inclusi nel piano. Promemoria e template inattivi si scartano in JS via
    // isCountable/resolveCompletionMode (asse canonico completion_mode).
    supabase
      .from('maintenance_items')
      .select(`
        id, ${LIVE_STATUS_FIELDS}, obligation_type, frequency_months,
        maintenance_templates!inner(${LIVE_STATUS_TEMPLATE_FIELDS}, title, obligation_type, frequency_months)
      `)
      .neq('status', 'completata')
      .eq('activation_status', 'inclusa')
      .gte('next_due_date', today)
      .order('next_due_date', { ascending: true })
      .limit(20),
  ])

  const unit = membership?.units as unknown as {
    id: string; label: string; residence_id: string
    residences: { name: string; photo_url: string | null } | null
  } | null

  // Banner e card leggono la STESSA lista filtrata: il conteggio non può
  // divergere da ciò che si vede (bug class count/list divergence).
  const urgent = ((rawUrgent ?? []) as unknown as ItemRow[])
    .filter(i => isOverdueLive(i, today) || isInCorso(i))
  const urgentCount = urgent.length
  const urgentItems = urgent.slice(0, 3)

  // Prossimo item DATATO futuro, escluse le promemoria: prima riga countable non-promemoria.
  const nextItem =
    ((rawNext ?? []) as unknown as NextItemRow[])
      .find(i => isCountable(i) && resolveCompletionMode(i) !== 'promemoria') ?? null
  const nextObligation =
    (nextItem?.obligation_type ?? nextItem?.maintenance_templates?.obligation_type ?? null) as ObligationType | null

  // Teaser fascicolo. Perimetro IDENTICO a /fascicolo tab "Tutti" per un client
  // (unità + parti condominiali): residence_id = mia residenza AND (unit_id = mia
  // unità OR unit_id IS NULL). Vincolo di allineamento: se cambia il filtro qui va
  // cambiato anche in src/app/(app)/fascicolo/page.tsx (query completions). Solo
  // lettura via createClient (RLS), mai service client.
  let fascicoloCount = 0
  let lastCompletedAt: string | null = null
  if (unit) {
    const { count, data: lastRows } = await supabase
      .from('completions')
      .select('completed_at', { count: 'exact' })
      .eq('residence_id', unit.residence_id)
      .or(`unit_id.eq.${unit.id},unit_id.is.null`)
      .order('completed_at', { ascending: false })
      .limit(1)
    fascicoloCount = count ?? 0
    lastCompletedAt = lastRows?.[0]?.completed_at ?? null
  }
  const lastCompletedLabel = lastCompletedAt
    ? new Date(lastCompletedAt).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
    : null

  const residenceName = unit?.residences?.name ?? 'La tua residenza'
  const photoUrl      = unit?.residences?.photo_url ?? null

  return (
    <div className="p-6 space-y-6 pb-safe">
      {/* Header residenza */}
      <header>
        <p className="text-xs text-text-secondary uppercase tracking-wide">{residenceName}</p>
        <h1 className="text-xl font-medium text-text-primary mt-1">
          Ciao, {profile.full_name?.split(' ')[0] ?? 'benvenuto'}
        </h1>
      </header>

      {/* Card residenza */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="h-36 bg-background flex items-center justify-center">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={residenceName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-text-secondary text-sm">{residenceName}</span>
          )}
        </div>
        <div className="px-4 py-3">
          <p className="text-sm font-medium text-text-primary">{residenceName}</p>
          {unit && (
            <p className="text-xs text-text-secondary mt-0.5">{formatUnitLabel(unit.label)}</p>
          )}
        </div>
      </div>

      {/* Banner scadenze */}
      {urgentCount > 0 ? (
        <Link href="/manutenzioni">
          <div className="bg-semantic-red-bg border border-semantic-red/20 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-semantic-red">
                {urgentCount} {urgentCount === 1 ? 'scadenza richiede' : 'scadenze richiedono'} attenzione
              </p>
              <p className="text-xs text-semantic-red/70 mt-0.5">Tocca per vedere tutte</p>
            </div>
            <span className="text-2xl font-medium text-semantic-red">{urgentCount}</span>
          </div>
        </Link>
      ) : (
        <div className="bg-brand-light rounded-xl px-4 py-3">
          <p className="text-sm font-medium text-brand-dark">Tutto in ordine</p>
          <p className="text-xs text-brand-medium mt-0.5">Nessuna manutenzione in scadenza</p>
        </div>
      )}

      {/* Prime card urgenti */}
      {urgentItems.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-primary">Da completare</h2>
            <Link href="/manutenzioni" className="text-xs text-brand-medium">Vedi tutte</Link>
          </div>
          <div className="space-y-2">
            {urgentItems.map(i => (
              <MaintenanceCard
                key={i.id}
                id={i.id}
                title={i.maintenance_templates?.title ?? '—'}
                category={i.maintenance_templates?.category ?? ''}
                priority={(i.priority ?? i.maintenance_templates?.priority ?? 'N2') as MaintenancePriority}
                status={resolveLiveStatus(i, today)}
                nextDueDate={i.next_due_date}
                scope={(i.maintenance_templates?.scope ?? 'unit') as 'unit' | 'condominium'}
              />
            ))}
          </div>
        </section>
      )}

      {/* Prossima manutenzione — informativa, non un'azione di completamento */}
      {nextItem && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-text-primary">Prossima manutenzione</h2>
          <Link href={`/manutenzioni/${nextItem.id}`} className="block">
            <div className="bg-surface rounded-xl border border-border p-4 flex items-center gap-3 active:scale-[0.98] transition-transform">
              <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center flex-shrink-0">
                <CalendarClock className="w-5 h-5 text-brand-medium" strokeWidth={1.6} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">
                  {nextItem.maintenance_templates?.title ?? '—'}
                </p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {nextObligation ? OBLIGATION_LABELS[nextObligation] : 'Manutenzione'}
                  {' · '}
                  {formatRelativeDue(nextItem.next_due_date!, today)}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-text-secondary flex-shrink-0" strokeWidth={1.6} />
            </div>
          </Link>
        </section>
      )}

      {/* Teaser fascicolo — intero blocco cliccabile, nessun interattivo annidato */}
      <Link href="/fascicolo" className="block">
        <div className="bg-surface rounded-xl border border-border p-4 flex items-center gap-3 active:scale-[0.98] transition-transform">
          <div className="w-10 h-10 rounded-lg bg-brand-light flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-5 h-5 text-brand-medium" strokeWidth={1.6} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">Fascicolo</p>
            <p className="text-xs text-text-secondary mt-0.5">
              {fascicoloCount > 0
                ? `${pluralize(fascicoloCount, 'intervento registrato', 'interventi registrati')} · ultimo ${lastCompletedLabel}`
                : 'Ancora nessun intervento registrato'}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-text-secondary flex-shrink-0" strokeWidth={1.6} />
        </div>
      </Link>
    </div>
  )
}
