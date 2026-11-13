import Link from 'next/link'
import Image from 'next/image'
import { BookOpen, CalendarClock, ChevronRight, Home as HomeIcon, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireProfile, getUser } from '@/lib/auth'
import { MaintenanceCard } from '@/components/MaintenanceCard'
import { AwaitingDeliveryHomeCard } from '@/components/AwaitingDelivery'
import { OBLIGATION_LABELS } from '@/components/MaintenanceBadge'
import type { ObligationType } from '@/types/database'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import { pluralize } from '@/lib/pluralize'
import { HomeRiepilogo } from './HomeRiepilogo'
import { buildGreeting } from '@/lib/greeting'
import { summarizeHome } from '@/lib/home-summary'
import { deliveryChip, residenceInitials, usablePhotoUrl } from '@/lib/home-card'
import styles from './home.module.css'
import {
  isCountable, isInCorso, isOverdueLive, isAwaitingDelivery, resolveCompletionMode,
  resolveFrequencyMonths, resolveLiveStatus, resolveObligationType, formatRelativeDue, todayISO,
  LIVE_STATUS_FIELDS, LIVE_STATUS_TEMPLATE_FIELDS, type LiveStatusItem,
} from '@/lib/maintenance-status'

// Card urgenti: campi live (helper) + display. Estende LiveStatusItem così lo
// stato mostrato deriva da next_due_date, mai dal campo status salvato.
type ItemRow = LiveStatusItem & {
  id: string
  obligation_type: ObligationType | null
  frequency_months: number | null
  maintenance_templates:
    | (NonNullable<LiveStatusItem['maintenance_templates']> & {
        title: string
        category: string
        scope: string
        obligation_type: ObligationType | null
        frequency_months: number | null
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
  const user = await getUser()
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
      .select('unit_id, units(id, label, delivery_date, residence_id, residences(name, photo_url, address))')
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
        id, ${LIVE_STATUS_FIELDS}, obligation_type, frequency_months,
        maintenance_templates!inner(${LIVE_STATUS_TEMPLATE_FIELDS}, title, category, scope, obligation_type, frequency_months)
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
    id: string; label: string; delivery_date: string | null; residence_id: string
    residences: { name: string; photo_url: string | null; address: string | null } | null
  } | null

  // Banner e card leggono la STESSA lista filtrata: il conteggio non può
  // divergere da ciò che si vede (bug class count/list divergence).
  const urgent = ((rawUrgent ?? []) as unknown as ItemRow[])
    .filter(i => resolveCompletionMode(i) !== 'promemoria' && (isOverdueLive(i, today) || isInCorso(i)))
  const urgentCount = urgent.length
  const summary = summarizeHome((rawUrgent ?? []) as unknown as ItemRow[], today)

  // Prossimo item DATATO futuro, escluse le promemoria: prima riga countable non-promemoria.
  const nextItem =
    ((rawNext ?? []) as unknown as NextItemRow[])
      .find(i => isCountable(i) && resolveCompletionMode(i) !== 'promemoria') ?? null

  const primaryItem = urgent[0] ?? nextItem
  const urgentItems = urgent.filter(i => i.id !== primaryItem?.id).slice(0, 3)
  const showNextItem = nextItem && nextItem.id !== primaryItem?.id &&
    !urgentItems.some(i => i.id === nextItem.id)

  // Voci il cui piano non è partito: la data di consegna non è registrata.
  // Si leggono dalla STESSA lista dei candidati urgenti (nessuna query in più:
  // quella select non filtra per data) e servono solo a decidere se, in assenza
  // di una prossima scadenza, il motivo è "non c'è ancora niente in programma"
  // oppure "il piano non è partito". Sono due messaggi diversi.
  const awaitingDelivery = ((rawUrgent ?? []) as unknown as ItemRow[]).filter(isAwaitingDelivery)

  // Stessa espressione di prima, solo nominata: HomeRiepilogo la riceve e la
  // home la usa per non ripetere il messaggio di attesa consegna.
  const riepilogoAwaiting =
    awaitingDelivery.some(i => resolveCompletionMode(i) === 'residente') &&
    !((rawUrgent ?? []) as unknown as ItemRow[]).some(i => isCountable(i) && resolveCompletionMode(i) === 'residente' && i.next_due_date !== null)

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
  const photoUrl      = usablePhotoUrl(unit?.residences?.photo_url)
  const address       = unit?.residences?.address?.trim() || null
  const greeting      = buildGreeting(profile.full_name, user?.email, new Date())
  const delivery      = deliveryChip(unit?.delivery_date, today)

  return (
    <div className={`${styles.home} space-y-6 pb-safe`}>
      <div>
        <div className={styles.eyebrow}>La tua casa</div>
        <h1 className={styles.pageTitle}>
          {greeting.name ? `${greeting.word}, ${greeting.name}` : greeting.word}
          <span>.</span>
        </h1>
        <p className={styles.lead}>Cosa c&apos;è da fare, i documenti della casa e chi contattare. Tutto in un posto.</p>
      </div>

      {/* Card residenza: non cliccabile. Foto se valida, altrimenti iniziali. */}
      <section className={styles.resCard} aria-label="La tua residenza">
        {photoUrl ? (
          <div className="relative h-[138px] bg-background">
            {/* Elemento LCP della home: next/image + priority. sizes: colonna max-w-lg
                (32rem) meno 20px di padding per lato = 472px; sotto, 100vw - 40px. */}
            <Image
              src={photoUrl}
              alt={residenceName}
              fill
              sizes="(min-width: 560px) 472px, calc(100vw - 2.5rem)"
              priority
              className="object-cover"
            />
          </div>
        ) : (
          <div className={styles.resVisual} aria-hidden="true">
            <span className={styles.resInitials}>{residenceInitials(residenceName)}</span>
            <HomeIcon className={styles.resIco} size={54} strokeWidth={1.4} />
          </div>
        )}
        <div className={styles.resBody}>
          <h2 className={styles.resName}>{residenceName}</h2>
          <div className={styles.resAddr}>{address ?? 'Indirizzo non indicato'}</div>
          <div className={styles.pillRow}>
            {unit
              ? <span className={`${styles.chip} ${styles.chipNeutral}`}>{formatUnitLabel(unit.label)}</span>
              : <span className={`${styles.chip} ${styles.chipNeutral}`}>Nessuna unità associata</span>}
            {unit && (
              <span className={`${styles.chip} ${delivery.tone === 'done' ? styles.chipDone : styles.chipSoon}`}>
                {delivery.tone === 'done' && <Check size={12} aria-hidden="true" />}
                {delivery.text}
              </span>
            )}
          </div>
        </div>
      </section>

      <HomeRiepilogo
        awaitingDelivery={riepilogoAwaiting}
        overdue={summary.overdue}
        soon={summary.soon}
        top={summary.top && {
          overdue: summary.top.overdue,
          item: {
            id: summary.top.item.id,
            title: summary.top.item.maintenance_templates?.title ?? 'Manutenzione',
            dueISO: summary.top.item.next_due_date,
          },
        }}
        today={today}
      />

      {/* Prime card urgenti */}
      {urgentItems.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-primary">Da completare</h2>
            <Link href="/manutenzioni" className="inline-flex items-center h-11 -mt-3 -mb-2 -mr-2 px-2 text-xs text-brand-medium">Vedi tutte</Link>
          </div>
          <div className="space-y-2">
            {urgentItems.map(i => (
              <MaintenanceCard
                key={i.id}
                id={i.id}
                title={i.maintenance_templates?.title ?? '—'}
                category={i.maintenance_templates?.category ?? ''}
                mode={resolveCompletionMode(i)}
                obligationType={resolveObligationType(i)}
                status={resolveLiveStatus(i, today)}
                nextDueDate={i.next_due_date}
                frequencyMonths={resolveFrequencyMonths(i)}
                scope={(i.maintenance_templates?.scope ?? 'unit') as 'unit' | 'condominium'}
              />
            ))}
          </div>
        </section>
      )}

      {/* Nessuna prossima scadenza perché il piano non è partito: card neutra,
          senza conteggi e senza colori di allarme. Non è un problema da
          risolvere da parte di chi legge, è un dato che manca a monte. */}
      {!nextItem && !(riepilogoAwaiting && urgentCount === 0) && awaitingDelivery.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-text-primary">Prossima manutenzione</h2>
          <AwaitingDeliveryHomeCard />
        </section>
      )}

      {/* Prossima manutenzione — informativa, non un'azione di completamento */}
      {nextItem && showNextItem && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-text-primary">Più avanti</h2>
          <Link href={`/manutenzioni/${nextItem.id}`} className="block">
            <div className="bg-surface rounded-xl border border-border p-4 flex items-center gap-3 active:bg-background">
              <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center flex-shrink-0">
                <CalendarClock className="w-5 h-5 text-brand-medium" strokeWidth={1.6} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary line-clamp-2 break-words">
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
        <div className="bg-surface rounded-xl border border-border p-4 flex items-center gap-3 active:bg-background">
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
