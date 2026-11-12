import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronDown, CalendarDays, Info, UserRound, FileText, ShieldCheck, Wrench, Phone, BookOpen, ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'
import { StatusBadge, PromemoriaBadge, TypeBadge } from '@/components/ui/Badge'
import { CompletionAction } from '../CompletionAction'
import { N3AdminActions } from '@/components/N3AdminActions'
import { AwaitingDeliveryNote } from '@/components/AwaitingDelivery'
import type { ObligationType } from '@/types/database'
import { formatRegisteredBy } from '@/lib/formatRegisteredBy'
import { formatFrequency } from '@/lib/formatFrequency'
import { pluralize } from '@/lib/pluralize'
import { isResidentGuideAvailable } from '../guide-eligibility'
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
    <Link href="/manutenzioni" className="inline-flex min-h-11 items-center gap-1 rounded-lg text-sm font-medium text-brand-dark focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-medium/40">
      <ChevronLeft aria-hidden="true" className="h-4 w-4" />
      Tutte le manutenzioni
    </Link>
  )
}

function InfoSection({ title, icon, children, open = false }: {
  title: string; icon: ReactNode; children: ReactNode; open?: boolean
}) {
  return (
    <details open={open} className="group rounded-2xl border border-border bg-surface open:border-brand-medium/25">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-4 text-[13px] font-medium text-text-primary hover:bg-brand-light/20 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-medium/40 [&::-webkit-details-marker]:hidden">
        {icon}
        <h3 className="min-w-0 flex-1">{title}</h3>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-text-secondary group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-5 text-[13px] leading-7 text-text-secondary whitespace-pre-line [overflow-wrap:anywhere]">{children}</div>
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
      id, status, next_due_date, unit_id, residence_id, completion_mode, activation_status, frequency_months, obligation_type, warranty_info,
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
      <div className="space-y-5 px-5 pt-4 pb-8">
        <BackLink />
        <h1 className="font-serif text-3xl text-brand-dark">Manutenzione</h1>
        <p role="alert" className="rounded-2xl border border-border bg-surface p-4 text-sm text-text-secondary">Non è stato possibile caricare la manutenzione. Riprova ricaricando la pagina.</p>
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
  const isAdminMode = mode === 'amministratore'
  const registeredBy = mode === 'promemoria' ? 'Nessuna registrazione prevista.'
    : mode === 'amministratore' ? "L'amministratore di condominio."
    : mode === 'residente' ? 'Il residente associato all’unità.'
    : 'Responsabile della registrazione non indicato.'

  return (
    <div className="space-y-5 px-5 pt-3 pb-8 [overflow-wrap:anywhere]">
      <BackLink />
      <header className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-brand-medium">
          {[tpl?.category, isCommon ? 'Parti comuni' : 'Appartamento'].filter(Boolean).join(' · ')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'promemoria' ? <PromemoriaBadge frequencyMonths={frequencyMonths} />
            : awaitingDelivery ? <span className="rounded-full bg-neutral-600/7 px-3 py-1 text-xs text-text-secondary">{AWAITING_DELIVERY_LABEL}</span>
            : <StatusBadge status={status} />}
          {obligationType && <TypeBadge obligationType={obligationType} />}
        </div>
        <h1 className="font-serif text-[34px] leading-[1.12] tracking-[-0.035em] text-brand-dark">{tpl?.title ?? 'Manutenzione'}</h1>
        <p className="text-[13px] leading-[1.7] text-text-secondary whitespace-pre-line">
          {tpl?.description?.trim() || 'Descrizione non ancora disponibile.'}
        </p>
        <p className="inline-flex max-w-full items-start gap-2 rounded-xl bg-brand-light/50 px-3 py-2 text-xs leading-relaxed text-brand-dark">
          <UserRound aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span><span className="font-medium">Registrazione: </span>{registeredBy}</span>
        </p>
      </header>

      <section aria-labelledby="maintenance-dates" className="rounded-[18px] border border-border bg-surface p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="maintenance-dates" className="text-xs font-medium text-text-primary">{mode === 'promemoria' ? 'Frequenza e interventi' : 'Scadenze e interventi'}</h2>
          <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-medium" />
        </div>
        <div className={`grid gap-4 ${mode !== 'promemoria' && formattedDue ? 'grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]' : 'grid-cols-1'}`}>
        {mode !== 'promemoria' && (formattedDue ? (
          <div className={`min-w-0 ${status === 'scaduta' ? 'text-semantic-red' : status === 'in_corso' ? 'text-semantic-amber' : 'text-brand-dark'}`}>
            <p className="text-[11px] text-text-secondary">{status === 'scaduta' ? 'Scaduta il' : status === 'in_corso' ? 'Intervento in corso · data prevista' : 'Prossima scadenza'}</p>
            <p className="mt-2 font-serif text-[27px] leading-[1.15] tracking-tight"><time dateTime={item.next_due_date!}>{formattedDue}</time></p>
          </div>
        ) : awaitingDelivery ? <AwaitingDeliveryNote shell="app" /> : (
          <p className="rounded-xl bg-background p-4 text-sm text-text-secondary">Data non disponibile.</p>
        ))}
        <div className="min-w-0 text-xs leading-relaxed text-text-secondary">
          <p className="text-[11px]">Ultima esecuzione</p>
          {completionsError ? <p className="mt-2">Non disponibile: lo storico non è stato caricato.</p>
            : completions?.[0] ? <p className="mt-2 text-sm"><time dateTime={completions[0].completed_at}>{formatDate(completions[0].completed_at)}</time></p>
            : <p className="mt-2">Nessun intervento registrato.</p>}
        </div>
        </div>
        <div className="mt-4 border-t border-border pt-3 text-xs text-text-secondary">
          <p>Frequenza: {frequencyMonths == null ? 'non indicata' : formatFrequency(frequencyMonths)}</p>
        </div>
      </section>

      {canStartGuide && (
        <section aria-labelledby="guide-available-title" className="rounded-2xl border border-brand-medium/15 bg-brand-light/65 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-brand-dark">
              <BookOpen aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="guide-available-title" className="font-serif text-xl leading-tight text-brand-dark">Guida pratica disponibile</h2>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">Consulta i passaggi pratici per {tpl?.title?.toLocaleLowerCase('it-IT')}.</p>
            </div>
          </div>
          <Link href={`/manutenzioni/${item.id}/guida`} className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-dark px-5 py-3 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-medium/50">
            <BookOpen aria-hidden="true" className="h-4 w-4" />
            Inizia la guida
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </section>
      )}

      {((profile.role === 'client' && (isCommon || isAdminMode)) || (membershipError && profile.role === 'client' && mode === 'residente' && !isCommon) || (canCompleteResident && !isCommon)) && (
      <div className="space-y-3 rounded-2xl bg-brand-light/50 px-4 py-3">
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

      <section aria-labelledby="maintenance-info" className="space-y-2">
        <h2 id="maintenance-info" className="pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.13em] text-text-secondary">Informazioni utili</h2>
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
          <section id="storico-interventi" aria-labelledby="history-title" className="scroll-mt-5 space-y-3">
            <h2 id="history-title" className="font-serif text-2xl text-brand-dark">Storico interventi</h2>
            <p className="text-xs text-text-secondary">Gli ultimi 10 interventi, dal più recente.</p>
            {completionsError ? (
              <p role="alert" className="rounded-2xl border border-border bg-surface p-4 text-sm text-text-secondary">Non è stato possibile caricare lo storico e gli allegati. Riprova ricaricando la pagina.</p>
            ) : (completions?.length ?? 0) === 0 && (
              <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-text-secondary">Nessun intervento registrato finora.</p>
            )}
            {!completionsError && <ol className="border-l border-border ml-3 space-y-3">
              {completions?.map((c, index) => {
                const comp = c as {
                  id: string; completed_at: string
                  performed_by_name: string | null; notes: string | null
                  attachments: { id: string; file_name: string }[]
                }
                return (
                  <li key={comp.id} className="relative ml-5 bg-surface rounded-2xl border border-border p-4 [overflow-wrap:anywhere]">
                    <span className="absolute -left-9 top-4 w-6 h-6 rounded-full border border-border bg-surface flex items-center justify-center text-xs text-text-secondary" aria-label={`Intervento ${index + 1}`}>
                      {index + 1}
                    </span>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-medium text-text-primary">
                        <time dateTime={comp.completed_at}>{formatDate(comp.completed_at)}</time>
                      </span>
                      {comp.attachments?.length > 0 && (
                        <span className="text-xs text-text-secondary">
                          {pluralize(comp.attachments.length, 'allegato', 'allegati')}
                        </span>
                      )}
                    </div>
                    {comp.performed_by_name && (
                      <p className="text-xs text-text-secondary break-words">
                        Eseguito da: {formatRegisteredBy(comp.performed_by_name, mode, null)}
                      </p>
                    )}
                    {comp.notes && (
                      <p className="text-sm text-text-secondary mt-2 leading-relaxed whitespace-pre-line break-words">{comp.notes}</p>
                    )}
                    {comp.attachments?.length > 0 && (
                      <details className="mt-3 border-t border-border pt-2">
                        <summary className="min-h-11 cursor-pointer rounded-lg py-3 text-sm text-brand-medium focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-medium/40">Allegati registrati</summary>
                        <ul className="space-y-2 pb-2 text-xs text-text-secondary">
                          {comp.attachments.map(attachment => <li key={attachment.id} className="flex items-start gap-2"><FileText aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="min-w-0 [overflow-wrap:anywhere]">{attachment.file_name}</span></li>)}
                        </ul>
                      </details>
                    )}
                  </li>
                )
              })}
            </ol>}
          </section>
        }

      </div>
    </div>
  )
}
