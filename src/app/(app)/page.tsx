import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, BookOpen, CalendarClock, ChevronRight, FileText, Home as HomeIcon, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireProfile, getUser } from '@/lib/auth'
import type { ObligationType } from '@/types/database'
import { formatDateIT } from '@/lib/formatDate'
import type { ListState } from '@/lib/maintenance-list'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import { pluralize } from '@/lib/pluralize'
import { HomeRiepilogo } from './HomeRiepilogo'
import { buildGreeting } from '@/lib/greeting'
import { summarizeHome, upcomingItems } from '@/lib/home-summary'
import { loadResidenceDocumentRows } from '@/lib/document-rows.server'
import { SISTEMA_LABELS } from '@/lib/document-classification'
import { deliveryChip, fileTypeLabel, residenceInitials, usablePhotoUrl } from '@/lib/home-card'
import styles from './home.module.css'
import {
  isCountable, isAwaitingDelivery, resolveCompletionMode, formatRelativeDue, todayISO,
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

const CHIP_BY_STATE: Record<ListState, string> = {
  scaduta: styles.chipOverdue,
  in_corso: styles.chipSoon,
  entro_30: styles.chipSoon,
  piu_avanti: styles.chipNeutral,
  in_attesa_consegna: styles.chipNeutral,
}

export default async function HomePage() {
  const profile = await requireProfile()
  const user = await getUser()
  const supabase = await createClient()

  const today = todayISO()

  // In parallelo (indipendenti tra loro, scopate da RLS): membership e voci del piano.
  const [
    { data: membership },
    { data: rawUrgent },
  ] = await Promise.all([
    supabase
      .from('unit_members')
      .select('unit_id, units(id, label, delivery_date, residence_id, residences(name, photo_url, address))')
      .eq('profile_id', profile.id)
      .is('ended_at', null)
      .maybeSingle(),
    // Voci del piano (card verde e In arrivo): si scarta in SQL solo ciò che non può mai esserlo
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
  ])

  const unit = membership?.units as unknown as {
    id: string; label: string; delivery_date: string | null; residence_id: string
    residences: { name: string; photo_url: string | null; address: string | null } | null
  } | null

  const summary = summarizeHome((rawUrgent ?? []) as unknown as ItemRow[], today)
  const upcoming = upcomingItems((rawUrgent ?? []) as unknown as ItemRow[], today, summary.top?.item.id ?? null)

  // Voci il cui piano non è partito: la data di consegna non è registrata.
  // Si leggono dalla STESSA lista dei candidati urgenti (nessuna query in più:
  // quella select non filtra per data) e servono solo a decidere se, in assenza
  // di una prossima scadenza, il motivo è "non c'è ancora niente in programma"
  // oppure "il piano non è partito". Sono due messaggi diversi.
  // Stessa espressione di prima, solo nominata: HomeRiepilogo la riceve e la
  // home la usa per non ripetere il messaggio di attesa consegna.
  const riepilogoAwaiting =
    ((rawUrgent ?? []) as unknown as ItemRow[]).some(i => isAwaitingDelivery(i) && resolveCompletionMode(i) === 'residente') &&
    !((rawUrgent ?? []) as unknown as ItemRow[]).some(i => isCountable(i) && resolveCompletionMode(i) === 'residente' && i.next_due_date !== null)

  // Documenti della casa: stesso loader di /documenti, client di sessione (RLS:
  // documenti della mia unità e della residenza). I più recenti per caricamento.
  const docsResult = unit
    ? await loadResidenceDocumentRows(supabase, unit.residence_id)
    : { docs: [], units: [], error: null }
  const recentDocs = docsResult.docs.slice(0, 3)

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

      {/* In arrivo: prossime 3 voci dopo quella in evidenza nella card verde */}
      <section aria-label="In arrivo">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>In arrivo</h2>
          {upcoming.length > 0 && <span className={styles.sectionCount}>{pluralize(upcoming.length, 'voce', 'voci')}</span>}
        </div>
        {upcoming.length === 0 ? (
          <div className={styles.empty}>
            <strong>Niente in arrivo</strong>
            Non ci sono altre manutenzioni in programma.
          </div>
        ) : (
          <div className={styles.listCard}>
            {upcoming.map(({ item: i, state, label }) => (
              <Link key={i.id} href={`/manutenzioni/${i.id}`} className={styles.listRow}>
                <div className={styles.symbol} aria-hidden="true"><CalendarClock size={19} /></div>
                <div className={styles.lrBody}>
                  <div className={styles.lrTitle}>{i.maintenance_templates?.title ?? 'Manutenzione'}</div>
                  <div className={styles.lrSub}>
                    {i.next_due_date === null
                      ? 'Da definire'
                      : state === 'scaduta' ? `Scaduta il ${formatDateIT(i.next_due_date)}` : formatRelativeDue(i.next_due_date, today)}
                    {i.maintenance_templates?.scope === 'condominium' && ' · Parti comuni'}
                  </div>
                </div>
                <div className={styles.lrEnd}>
                  <span className={`${styles.chip} ${CHIP_BY_STATE[state]}`}>{label}</span>
                </div>
              </Link>
            ))}
            <div className={styles.listFoot}>
              <Link href="/manutenzioni" className={styles.ghostLink}>Apri il piano di manutenzione <ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
          </div>
        )}
      </section>

      {/* Documenti della casa */}
      <section aria-label="Documenti della casa">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Documenti della casa</h2>
          {docsResult.docs.length > 0 && <span className={styles.sectionCount}>{pluralize(docsResult.docs.length, 'documento', 'documenti')}</span>}
        </div>
        {docsResult.error ? (
          <div className={styles.empty}>
            <strong>Documenti non disponibili</strong>
            Non è stato possibile caricarli. Riprova tra poco.
          </div>
        ) : recentDocs.length === 0 ? (
          <div className={styles.empty}>
            <strong>Nessun documento</strong>
            I documenti della tua casa compariranno qui appena caricati.
          </div>
        ) : (
          <div className={styles.listCard}>
            {recentDocs.map(d => (
              <Link key={d.id} href="/documenti" className={styles.listRow}>
                <div className={`${styles.symbol} ${styles.docIco}`} aria-hidden="true"><FileText size={19} /></div>
                <div className={styles.lrBody}>
                  <div className={styles.lrTitle}>{d.title}</div>
                  <div className={styles.lrSub}>
                    {[d.sistema ? SISTEMA_LABELS[d.sistema] : null, formatDateIT(d.file_date ?? d.created_at)].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {fileTypeLabel(d.file_name) && (
                  <div className={styles.lrEnd}><span className={styles.docType}>{fileTypeLabel(d.file_name)}</span></div>
                )}
              </Link>
            ))}
            <div className={styles.listFoot}>
              <Link href="/documenti" className={styles.ghostLink}>Apri l&apos;archivio documenti <ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
          </div>
        )}
      </section>

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
