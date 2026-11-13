import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronDown, CalendarDays, Info, UserRound, FileText, ShieldCheck, Wrench, Phone, BookOpen, ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'
import { PromemoriaBadge } from '@/components/ui/Badge'
import { MAINTENANCE_STATUS_LABELS, OBLIGATION_LABELS } from '@/lib/maintenance-labels'
import { MaintenanceHeader } from '../MaintenanceHeader'
import styles from '../maintenance-v5.module.css'
import { CompletionAction } from '../CompletionAction'
import { N3AdminActions } from '@/components/N3AdminActions'
import { AwaitingDeliveryNote } from '@/components/AwaitingDelivery'
import type { ObligationType } from '@/types/database'
import { formatRegisteredBy } from '@/lib/formatRegisteredBy'
import { formatFrequency } from '@/lib/formatFrequency'
import { pluralize } from '@/lib/pluralize'
import { isResidentGuideAvailable } from '../guide-eligibility'
import { resolveMaintenanceIllustrations } from '../maintenance-illustrations'
import { MaintenanceIllustration } from '../MaintenanceIllustration'
import {
  isOverdueLive, isAwaitingDelivery, AWAITING_DELIVERY_LABEL, resolveCompletionMode, resolveFrequencyMonths, resolveLiveStatus,
  resolveObligationType, todayISO,
  type LiveStatusItem,
} from '@/lib/maintenance-status'

export const metadata: Metadata = { title: 'Dettaglio manutenzione' }

type Params = Promise<{ id: string }>

function formatDate(value: string): string {
  return new Date(value.length === 10 ? `${value}T00:00:00Z` : value).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

function BackLink() {
  return (
    <Link href="/manutenzioni" className={styles.detailBack}>
      <ChevronLeft aria-hidden="true" className="h-4 w-4" />
      Tutte le manutenzioni
    </Link>
  )
}

function InfoSection({ title, icon, children, open = false }: {
  title: string; icon: ReactNode; children: ReactNode; open?: boolean
}) {
  return (
    <details open={open} className={styles.detailAccordion}>
      <summary>
        {icon}
        <h3>{title}</h3>
        <ChevronDown aria-hidden="true" size={16} className={styles.detailCaret} />
      </summary>
      <div className={styles.detailAccordionContent}>{children}</div>
    </details>
  )
}

export default async function ItemDetailPage({ params }: { params: Params }) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: item, error: itemError } = await supabase
    .from('maintenance_items')
    .select(`
      id, template_id, status, next_due_date, unit_id, residence_id, completion_mode, activation_status, frequency_months, obligation_type, warranty_info,
      maintenance_templates!inner(title, category, description, why_it_matters, who_does_it, what_to_keep, how_to, technical_notes, completion_mode, is_active, frequency_months, scope, obligation_type),
      suppliers(name, phone, email),
      units(label),
      residences(name)
    `)
    .eq('id', id)
    .maybeSingle()

  if (itemError) {
    console.error('[manutenzione] Errore lettura voce', { itemId: id, error: itemError })
    return (
      <div className={`${styles.listPage} ${styles.detailPage}`}>
        <MaintenanceHeader residenceName="Residenza non disponibile" unitLabel="" backToList />
        <div className={`${styles.view} ${styles.detailView}`}>
        <BackLink />
        <h1 className={styles.detailTitle}>Manutenzione</h1>
        <p role="alert" className={styles.detailNotice}>Non è stato possibile caricare la manutenzione. Riprova ricaricando la pagina.</p>
        </div>
      </div>
    )
  }
  if (!item) notFound()

  const tpl = item.maintenance_templates as unknown as {
    title: string; category: string; description: string | null
    why_it_matters: string | null; who_does_it: string | null; what_to_keep: string | null
    how_to: string[] | null; technical_notes: string | null
    completion_mode: 'residente' | 'amministratore' | 'promemoria' | null
    is_active: boolean; frequency_months: number; scope: string
  } | null

  const supplier = item.suppliers as unknown as { name: string; phone: string | null; email: string | null } | null
  const unit = item.units as unknown as { label: string } | null
  const residence = item.residences as unknown as { name: string } | null
  const liveItem = item as unknown as LiveStatusItem
  const today = todayISO()
  const mode = resolveCompletionMode(liveItem)
  const status = resolveLiveStatus(liveItem, today)
  const awaitingDelivery = isAwaitingDelivery(liveItem)
  const isCommon = item.unit_id === null
  // Stessi badge della lista (ManutenzioniList.tsx), stessi resolver voce ?? template.
  const axesItem = item as unknown as {
    obligation_type: ObligationType | null
    frequency_months: number | null
    maintenance_templates: { obligation_type: ObligationType | null; frequency_months: number | null } | null
  }
  const obligationType = resolveObligationType(axesItem)
  const frequencyMonths = resolveFrequencyMonths(axesItem)

  const formattedDue = mode !== 'promemoria' && item.next_due_date
    ? formatDate(item.next_due_date)
    : null

  // Storico completamenti per questo item
  const { data: completions, error: completionsError } = await supabase
    .from('completions')
    .select('id, completed_at, performed_by_name, notes, attachments(id, file_name)')
    .eq('item_id', id)
    .order('completed_at', { ascending: false })
    .limit(10)

  // Unità attiva del client per il form di completamento residente
  const { data: membership, error: membershipError } = await supabase
    .from('unit_members')
    .select('unit_id')
    .eq('profile_id', profile.id)
    .is('ended_at', null)
    .maybeSingle()

  if (completionsError) console.error('[manutenzione] Errore lettura storico', { itemId: id, error: completionsError })
  if (membershipError) console.error('[manutenzione] Errore lettura membership', { itemId: id, error: membershipError })

  const canCompleteResident =
    mode === 'residente' &&
    isOverdueLive(liveItem, today) &&
    profile.role === 'client' &&
    !membershipError &&
    membership?.unit_id === item.unit_id

  const canStartGuide = isResidentGuideAvailable({
    isClient: profile.role === 'client',
    isOwnUnit: Boolean(item.unit_id && !membershipError && membership?.unit_id === item.unit_id),
    isApartmentItem: item.unit_id !== null,
    completionMode: mode,
    activationStatus: item.activation_status,
    templateActive: tpl?.is_active === true,
    title: tpl?.title ?? null,
    whoDoesIt: tpl?.who_does_it ?? null,
    howTo: tpl?.how_to ?? null,
  })

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin'
  const illustrations = canStartGuide
    ? resolveMaintenanceIllustrations(item.template_id, tpl?.title, tpl?.how_to)
    : null
  // Limita la presentazione della card ai template approvati, senza cambiare
  // i controlli di autorizzazione della guida o della registrazione.
  const showGuideCard = canStartGuide && (
    item.template_id === '010214e7-7058-4d5d-a70c-69654aa66fa0' ||
    item.template_id === '132b0e68-61e1-420b-adc6-e54703f49415'
  )
  const isAdminMode = mode === 'amministratore'
  const registeredBy = mode === 'promemoria' ? 'Nessuna registrazione prevista.'
    : mode === 'amministratore' ? "L'amministratore di condominio."
    : mode === 'residente' ? 'Il residente associato all’unità.'
    : 'Responsabile della registrazione non indicato.'

  return (
    <div className={`${styles.listPage} ${styles.detailPage}`}>
      <MaintenanceHeader residenceName={residence?.name ?? 'La tua residenza'} unitLabel={isCommon ? 'Parti comuni' : unit?.label ?? 'Appartamento'} backToList />
      <div className={`${styles.view} ${styles.detailView}`}>
      <BackLink />
      <header className={styles.detailHeading}>
        <p className={styles.eyebrow}>
          {[tpl?.category, isCommon ? 'Parti comuni' : 'Appartamento'].filter(Boolean).join(' · ')}
        </p>
        <div className={styles.detailMeta}>
          {mode === 'promemoria' ? <PromemoriaBadge frequencyMonths={frequencyMonths} className={styles.detailReminder} />
            : awaitingDelivery ? <span className={styles.chip}>{AWAITING_DELIVERY_LABEL}</span>
            : <span className={`${styles.chip} ${status === 'scaduta' ? styles.overdue : status === 'in_corso' ? styles.progress : ''}`}>{MAINTENANCE_STATUS_LABELS[status]}</span>}
          {obligationType && <span className={`${styles.chip} ${styles[obligationType === 'A' ? 'legal' : obligationType === 'B' ? 'recommended' : 'advice']}`}>{OBLIGATION_LABELS[obligationType]}</span>}
        </div>
        <h1 className={styles.detailTitle}>{tpl?.title ?? 'Manutenzione'}</h1>
        <p className={styles.detailDescription}>
          {tpl?.description?.trim() || 'Descrizione non ancora disponibile.'}
        </p>
        <div className={styles.detailMeta}>
          <span className={styles.chip} title={`Registrazione: ${registeredBy}`}>{mode === 'residente' ? 'Tocca a te' : mode === 'amministratore' ? 'Se ne occupa l’amministratore' : mode === 'promemoria' ? 'Solo promemoria' : registeredBy}</span>
          {showGuideCard && <span className={styles.chip}>Guida consultiva</span>}
        </div>
      </header>

      <section aria-labelledby="maintenance-dates" className={styles.detailDates}>
        <div className={styles.detailDatesHead}>
          <h2 id="maintenance-dates">{mode === 'promemoria' ? 'Frequenza e interventi' : 'Scadenze e interventi'}</h2>
          <CalendarDays aria-hidden="true" size={17} />
        </div>
        <div className={mode !== 'promemoria' && formattedDue ? styles.detailDatesGrid : styles.detailDatesStack}>
        {mode !== 'promemoria' && (formattedDue ? (
          <div>
            <p className={styles.detailStatLabel}>{status === 'scaduta' ? 'Scaduta il' : status === 'in_corso' ? 'Intervento in corso · data prevista' : 'Prossima scadenza'}</p>
            <p className={styles.detailDue}><time dateTime={item.next_due_date!}>{formattedDue}</time></p>
          </div>
        ) : awaitingDelivery ? <AwaitingDeliveryNote shell="app" /> : (
          <p className={styles.detailHint}>Data non disponibile.</p>
        ))}
        <div>
          <p className={styles.detailStatLabel}>Ultima esecuzione</p>
          {completionsError ? <p className={styles.detailHint}>Non disponibile: lo storico non è stato caricato.</p>
            : completions?.[0] ? <p className={styles.detailLast}><time dateTime={completions[0].completed_at}>{formatDate(completions[0].completed_at)}</time></p>
            : <p className={styles.detailHint}>Nessun intervento registrato.</p>}
        </div>
        </div>
        <div className={styles.detailFrequency}>
          <p>Frequenza: {frequencyMonths == null ? 'non indicata' : formatFrequency(frequencyMonths)}</p>
        </div>
      </section>

      {showGuideCard && (
        <section aria-labelledby="guide-available-title" className={styles.detailGuide}>
          <div className={styles.detailGuideHead}>
            <span className={styles.detailBook}>
              <BookOpen aria-hidden="true" size={30} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="guide-available-title">Guida pratica disponibile</h2>
              <p>Consulta i passaggi pratici per {tpl?.title?.toLocaleLowerCase('it-IT')}.</p>
            </div>
          </div>
          <MaintenanceIllustration asset={illustrations?.overview} />
          <Link href={`/manutenzioni/${item.id}/guida`} className={`${styles.button} ${styles.detailGuideButton}`}>
            <BookOpen aria-hidden="true" className="h-4 w-4" />
            Inizia la guida
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </section>
      )}

      {((profile.role === 'client' && (isCommon || isAdminMode)) || (membershipError && profile.role === 'client' && mode === 'residente' && !isCommon) || (canCompleteResident && !isCommon)) && (
      <div className={styles.detailAction}>
        {profile.role === 'client' && (isCommon || isAdminMode) && (
          <p className="text-xs leading-relaxed text-text-secondary">Puoi consultare questa manutenzione e il suo storico. Non devi registrare il completamento.
            {isAdminMode && status === 'in_corso' && ' L’intervento è in corso.'}
          </p>
        )}
        {membershipError && profile.role === 'client' && mode === 'residente' && !isCommon && (
          <p role="alert" className="text-sm text-text-secondary">Non è stato possibile verificare la tua associazione all’unità. La registrazione non è disponibile: riprova ricaricando la pagina.</p>
        )}
        {canCompleteResident && !isCommon && (
          <CompletionAction itemId={item.id} unitId={item.unit_id!} residenceId={item.residence_id}
            title={tpl?.title ?? ''} residenceName={residence?.name ?? 'La tua residenza'} unitLabel={unit?.label ?? ''} />
        )}
      </div>
      )}

      <section aria-labelledby="maintenance-info">
        <h2 id="maintenance-info" className={styles.detailKicker}>Informazioni utili</h2>
        {tpl?.why_it_matters?.trim() && (
          <InfoSection title="Perché è importante" open icon={<Info aria-hidden="true" className="h-5 w-5 shrink-0 text-brand-medium" />}>
            <p>{tpl.why_it_matters}</p>
          </InfoSection>
        )}
        <InfoSection title="Chi esegue l’intervento" icon={<UserRound aria-hidden="true" className="h-5 w-5 shrink-0 text-brand-medium" />}>
          <p>{tpl?.who_does_it?.trim() || 'Le indicazioni su chi esegue l’intervento non sono ancora disponibili.'}</p>
        </InfoSection>
        {tpl?.what_to_keep?.trim() && (
          <InfoSection title="Cosa conservare" icon={<FileText aria-hidden="true" className="h-5 w-5 shrink-0 text-brand-medium" />}>
            <p>{tpl.what_to_keep}</p>
          </InfoSection>
        )}
        {isAdmin && tpl?.technical_notes?.trim() && (
          <InfoSection title="Dettagli tecnici" icon={<Wrench aria-hidden="true" className="h-5 w-5 shrink-0 text-brand-medium" />}>
            <p>{tpl.technical_notes}</p>
          </InfoSection>
        )}
      </section>

      <div className="space-y-5">
        {/* Garanzia */}
        {item.warranty_info && (
          <div className="bg-brand-light rounded-xl p-4 flex gap-3">
            <ShieldCheck className="w-5 h-5 text-brand-medium flex-shrink-0 mt-0.5" strokeWidth={1.6} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-brand-dark uppercase tracking-wide mb-1">Garanzia collegata</p>
              <p className="text-base text-brand-dark leading-relaxed break-words">{item.warranty_info}</p>
            </div>
          </div>
        )}

        {/* Fornitore — dato interno del costruttore, mai al residente né all'amministratore */}
        {supplier && profile.role === 'super_admin' && (
          <div className="bg-surface rounded-xl border border-border p-4 flex gap-3">
            <Wrench className="w-5 h-5 text-text-secondary flex-shrink-0 mt-0.5" strokeWidth={1.6} />
            <div className="flex-1">
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">Installato da</p>
              <p className="text-sm font-medium text-text-primary">{supplier.name}</p>
              {supplier.phone && (
                <a href={`tel:${supplier.phone}`} className="flex items-center gap-1 text-sm text-brand-medium mt-1">
                  <Phone className="w-3.5 h-3.5" strokeWidth={1.6} />
                  {supplier.phone}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Azioni amministratore */}
        {isAdminMode && isAdmin && (status === 'scaduta' || status === 'in_corso') && (
          <div className="bg-surface rounded-xl border border-border p-4 space-y-3">
            <p className="text-sm font-medium text-text-primary">Gestione amministratore</p>
            <N3AdminActions itemId={item.id} residenceId={item.residence_id} status={status} />
          </div>
        )}

        {/* Storico */}
        {
          <section id="storico-interventi" aria-labelledby="history-title" className={styles.detailHistory}>
            <h2 id="history-title" className={styles.detailKicker}>Storico interventi</h2>
            <p className={styles.detailHint}>Gli ultimi 10 interventi, dal più recente.</p>
            {completionsError ? (
              <p role="alert" className={styles.detailNotice}>Non è stato possibile caricare lo storico e gli allegati. Riprova ricaricando la pagina.</p>
            ) : (completions?.length ?? 0) === 0 && (
              <p className={styles.detailHistoryEmpty}>Nessun intervento registrato finora.</p>
            )}
            {!completionsError && <ol>
              {completions?.map(c => {
                const comp = c as {
                  id: string; completed_at: string
                  performed_by_name: string | null; notes: string | null
                  attachments: { id: string; file_name: string }[]
                }
                return (
                  <li key={comp.id} className={styles.detailHistoryRow}>
                    <span className={styles.detailHistoryDot} aria-hidden="true" />
                    <div className={styles.detailHistoryBody}>
                    <div className={styles.detailHistoryHead}>
                      <strong>
                        <time dateTime={comp.completed_at}>{formatDate(comp.completed_at)}</time>
                      </strong>
                      {comp.attachments?.length > 0 && (
                        <span className={styles.detailHint}>
                          {pluralize(comp.attachments.length, 'allegato', 'allegati')}
                        </span>
                      )}
                    </div>
                    {comp.performed_by_name && (
                      <p className={styles.detailHistoryBy}>
                        Eseguito da: {formatRegisteredBy(comp.performed_by_name, mode, null)}
                      </p>
                    )}
                    {comp.notes && (
                      <p className={styles.detailHistoryNote}>{comp.notes}</p>
                    )}
                    {comp.attachments?.length > 0 && (
                      <details className={styles.detailAttachments}>
                        <summary>Allegati registrati</summary>
                        <ul>
                          {comp.attachments.map(attachment => <li key={attachment.id} className="flex items-start gap-2"><FileText aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="min-w-0 [overflow-wrap:anywhere]">{attachment.file_name}</span></li>)}
                        </ul>
                      </details>
                    )}
                    </div>
                  </li>
                )
              })}
            </ol>}
          </section>
        }

      </div>
      </div>
    </div>
  )
}
