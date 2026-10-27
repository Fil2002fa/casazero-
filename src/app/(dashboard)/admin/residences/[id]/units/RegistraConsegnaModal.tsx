'use client'

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { DateField } from '@/components/DateField'
import { useToast } from '@/components/ui/Toast'
import { planDeliveryRecalc, type DeliveryRecalcPlan, type DeliveryRecalcSummary } from '@/lib/delivery-recalc'
import { formatDateIT } from '@/lib/formatDate'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import { pluralize } from '@/lib/pluralize'
import { createInvite, getDeliveryPreview, registerDelivery, type DeliveryPreview } from './actions'
import { DeliveryPreviewWarnings } from './DeliveryPreviewWarnings'
import { InviteLinkCard } from './InviteLinkCard'

// Passi interni alla stessa modale: una modale non apre mai un'altra modale,
// quindi la conferma di "non consegnata" e l'invito dopo la consegna sono passi qui.
type Step = 'form' | 'conferma_rimozione' | 'invito' | 'revoca_fallita'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const STALL_MS = 20_000

// Il toast legge il riepilogo restituito da registerDelivery (ricalcolato su
// dati freschi al salvataggio), non quello dell'anteprima: dice ciò che è
// stato scritto davvero.
function deliveryOutcomeMessage(newDate: string | null, r: DeliveryRecalcSummary, revokedInvites: number): string {
  const head = newDate === null
    ? 'Consegna rimossa'
    : `Consegna registrata al ${formatDateIT(newDate)}`
  let msg = `${head}: ${pluralize(r.ricalcolate, 'voce ricalcolata', 'voci ricalcolate')}`
  if (r.gia_scadute > 0) msg += `, di cui ${pluralize(r.gia_scadute, 'già scaduta', 'già scadute')}`
  if (r.saltate.nel_fascicolo > 0) {
    msg += `; ${pluralize(r.saltate.nel_fascicolo, 'voce invariata', 'voci invariate')} perché nel fascicolo`
  }
  if (revokedInvites > 0) msg += `; ${pluralize(revokedInvites, 'invito revocato', 'inviti revocati')}`
  return `${msg}.`
}

export function RegistraConsegnaModal({
  unit, residenceId, appUrl, hasNoActiveAccount, activeInviteCount, onClose,
}: {
  /** deliveryDate è quella mostrata nella card: decide se la modale registra o modifica. */
  unit: { id: string; label: string; floor: number | null; deliveryDate: string | null }
  residenceId: string
  appUrl: string
  hasNoActiveAccount: boolean
  /** Inviti attivi mostrati nella card: la conferma di rimozione dice che verranno revocati. */
  activeInviteCount: number
  onClose: () => void
}) {
  const { showToast } = useToast()
  const [busy, startTransition] = useTransition()
  const [preview, setPreview] = useState<DeliveryPreview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [newDate, setNewDate] = useState('')
  const [step, setStep] = useState<Step>('form')
  const [invite, setInvite] = useState<{ token: string; expiresAt: string; existing: boolean } | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  // Nessuna risposta dopo STALL_MS: la modale lo dice e diventa chiudibile.
  // Non si chiude da sola e non annulla nulla: l'esito reale si vede ricaricando.
  const [stalled, setStalled] = useState(false)

  useEffect(() => {
    if (!busy) return
    const t = setTimeout(() => setStalled(true), STALL_MS)
    return () => clearTimeout(t)
  }, [busy])

  useEffect(() => {
    let cancelled = false
    getDeliveryPreview(unit.id)
      .then(res => {
        if (cancelled) return
        if (res.error || !res.preview) {
          setLoadError(res.error ?? 'Errore temporaneo nella lettura dell\'unità, riprova.')
          return
        }
        setPreview(res.preview)
        setNewDate(res.preview.deliveryDate ?? '')
      })
      .catch(() => { if (!cancelled) setLoadError('Errore imprevisto, ricarica la pagina') })
    return () => { cancelled = true }
  }, [unit.id])

  // Data bersaglio del passo corrente: la rimozione si anteprima come la
  // registrazione, con unitDeliveryDate null.
  const target: string | null = step === 'conferma_rimozione' ? null : newDate
  const targetValid = target === null || ISO_DATE.test(target)
  const unchanged = preview !== null && target === preview.deliveryDate

  const planned = useMemo((): { plan: DeliveryRecalcPlan } | { error: true } | null => {
    if (!preview || !targetValid || unchanged) return null
    try {
      return {
        plan: planDeliveryRecalc({
          unitDeliveryDate: target,
          items: preview.items,
          categoryDates: preview.categoryDates,
          today: preview.today,
        }),
      }
    } catch (err) {
      console.error('RegistraConsegnaModal: piano non calcolabile', { unitId: unit.id, err })
      return { error: true }
    }
  }, [preview, target, targetValid, unchanged, unit.id])

  const plan = planned && 'plan' in planned ? planned.plan : null
  const itemById = useMemo(
    () => new Map((preview?.items ?? []).map(i => [i.id, i] as const)),
    [preview],
  )

  // In attesa si chiude solo se la risposta tarda (stalled): prima no, per non
  // perdere l'esito di un salvataggio che sta per tornare.
  const waiting = busy && !stalled
  function handleClose() {
    if (!waiting) onClose()
  }

  function submit() {
    if (!preview || !plan) return
    setActionError(null)
    setStalled(false)
    startTransition(async () => {
      try {
        const res = await registerDelivery(unit.id, preview.deliveryDate, target)
        if (res.error || !res.riepilogo) {
          setActionError(res.error ?? 'Errore temporaneo nella registrazione della consegna, riprova.')
          return
        }
        // La consegna è scritta anche se la revoca degli inviti è fallita:
        // si dice entrambe le cose, la modale resta aperta sul messaggio.
        if (res.revokeError) {
          setActionError(res.revokeError)
          setStep('revoca_fallita')
          return
        }
        showToast('success', deliveryOutcomeMessage(target, res.riepilogo, res.revokedInvites ?? 0))
        if (target === null || !hasNoActiveAccount) {
          onClose()
          return
        }
        // Consegnata e senza residente: l'invito si mostra subito. createInvite
        // restituisce quello attivo se c'è, altrimenti ne genera uno: mai due.
        // try separato: la consegna è già scritta, un guasto qui riguarda solo l'invito.
        try {
          const inv = await createInvite(unit.id, residenceId)
          if (inv.error || !inv.token || !inv.expiresAt) {
            setInviteError(inv.error ?? 'Errore generazione invito')
          } else {
            setInvite({ token: inv.token, expiresAt: inv.expiresAt, existing: inv.existing ?? false })
          }
        } catch {
          setInviteError('errore imprevisto, generalo dalla card dell\'unità.')
        }
        setStep('invito')
      } catch {
        setActionError('Errore imprevisto, ricarica la pagina')
      }
    })
  }

  const unitLabel = formatUnitLabel(unit.label, unit.floor)
  // Modifica se l'unità ha già una data: "Modifica data di consegna" e
  // "Salva nuova data"; altrimenti "Registra consegna" per entrambi.
  const isEdit = unit.deliveryDate !== null
  const title = `${
    step === 'conferma_rimozione' ? 'Segna come non consegnata'
    : isEdit ? 'Modifica data di consegna'
    : 'Registra consegna'
  } · ${unitLabel}`

  let footer: ReactNode
  if (busy && stalled) {
    footer = <Button variant="secondary" className="whitespace-nowrap" onClick={onClose}>Chiudi</Button>
  } else if (step === 'invito' || step === 'revoca_fallita') {
    footer = <Button variant="secondary" className="whitespace-nowrap" onClick={onClose}>Chiudi</Button>
  } else if (step === 'conferma_rimozione') {
    footer = (
      <>
        <Button variant="secondary" disabled={busy} className="whitespace-nowrap" onClick={() => { setActionError(null); setStep('form') }}>
          Annulla
        </Button>
        <Button variant="destructive" disabled={busy || !plan} className="whitespace-nowrap" onClick={submit}>
          {busy ? 'Salvataggio…' : 'Segna come non consegnata'}
        </Button>
      </>
    )
  } else if (preview) {
    footer = (
      <>
        {preview.deliveryDate !== null && (
          <button
            type="button"
            disabled={busy}
            onClick={() => { setActionError(null); setStep('conferma_rimozione') }}
            className="mr-auto whitespace-nowrap text-sm text-semantic-red/80 hover:text-semantic-red hover:underline underline-offset-2 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            Segna come non consegnata
          </button>
        )}
        <Button variant="secondary" disabled={busy} className="whitespace-nowrap" onClick={handleClose}>Annulla</Button>
        <Button variant="primary" disabled={busy || !plan} className="whitespace-nowrap" onClick={submit}>
          {busy ? 'Salvataggio…' : isEdit ? 'Salva nuova data' : 'Registra consegna'}
        </Button>
      </>
    )
  } else {
    footer = <Button variant="secondary" onClick={handleClose}>Chiudi</Button>
  }

  return (
    <Modal open onClose={handleClose} title={title} size="wide" footer={footer}>
      <div className="space-y-4 text-sm text-neutral-900">
        {busy && stalled && (
          <p className="rounded-lg bg-semantic-amber-bg px-3 py-2 text-semantic-amber">
            Nessuna risposta dal server. Ricarica la pagina per vedere lo stato attuale.
          </p>
        )}
        {loadError && <p className="text-semantic-red">{loadError}</p>}

        {!loadError && !preview && (
          <p className="flex items-center gap-2 text-neutral-600">
            <Loader2 className="w-4 h-4 animate-spin" /> Caricamento delle voci…
          </p>
        )}

        {step === 'invito' && (
          <div className="space-y-3">
            {invite ? (
              <>
                <p>
                  Consegna registrata. {invite.existing
                    ? 'L\'unità aveva già un invito attivo: è questo.'
                    : 'Invito generato per il residente:'}
                </p>
                <InviteLinkCard url={`${appUrl}/welcome/${invite.token}`} expiresAt={invite.expiresAt} />
              </>
            ) : (
              <p className="text-semantic-red">
                Consegna registrata, ma l&apos;invito non è stato generato: {inviteError}
              </p>
            )}
          </div>
        )}

        {preview && step === 'form' && (
          <div className="space-y-1.5">
            <label htmlFor="delivery-date" className="block text-xs font-medium text-neutral-600">
              Data di consegna <span className="text-semantic-red">*</span>
            </label>
            <DateField
              id="delivery-date"
              name="delivery_date"
              required
              defaultValue={preview.deliveryDate ?? ''}
              onChange={setNewDate}
            />
            {preview.deliveryDate !== null && (
              <p className="text-xs text-neutral-600">Data attuale: {formatDateIT(preview.deliveryDate)}</p>
            )}
          </div>
        )}

        {preview && step === 'conferma_rimozione' && preview.deliveryDate !== null && (
          <p>
            La data di consegna del {formatDateIT(preview.deliveryDate)} viene rimossa. Le voci qui sotto
            tornano a dipendere dalla data di categoria o di residenza, se presente.
            {activeInviteCount > 0 && (
              <> {activeInviteCount === 1 ? 'L\'invito attivo verrà revocato' : `Gli inviti attivi (${activeInviteCount}) verranno revocati`}: un&apos;unità non consegnata non ha inviti attivi.</>
            )}
            {!hasNoActiveAccount && <> Il residente già attivo mantiene l&apos;accesso.</>}
          </p>
        )}

        {preview && step !== 'invito' && step !== 'revoca_fallita' && (
          <>
            {step === 'form' && !newDate && <p className="text-neutral-600">Scegli una data per vedere l&apos;anteprima.</p>}
            {step === 'form' && newDate && unchanged && (
              <p className="text-neutral-600">La data di consegna è già questa: nessuna modifica.</p>
            )}
            {planned && 'error' in planned && (
              <p className="text-semantic-red">
                Dati del piano non coerenti per questa unità: la consegna non si può registrare.
              </p>
            )}

            {plan && (
              <div className="space-y-3">
                <p className="font-medium">
                  {pluralize(plan.riepilogo.ricalcolate, 'voce ricalcolata', 'voci ricalcolate')}
                </p>

                <DeliveryPreviewWarnings riepilogo={plan.riepilogo} />

                {plan.riepilogo.ricalcolate > 0 && (
                  <ul className="max-h-64 overflow-y-auto divide-y divide-border rounded-lg border border-border">
                    {plan.voci.filter(v => v.esito === 'ricalcola').map(v => {
                      const item = itemById.get(v.item_id)
                      const expired = v.nuova_data !== null && v.nuova_data < preview.today
                      return (
                        <li key={v.item_id} className="flex items-start justify-between gap-4 px-3 py-2">
                          {/* Nome mai troncato: va a capo, le date restano allineate a destra. */}
                          <span className="min-w-0 break-words">{item?.title || 'Voce'}</span>
                          <span className="shrink-0 flex items-baseline gap-2 whitespace-nowrap">
                            {item?.currentDueDate && item.currentDueDate !== v.nuova_data && (
                              <s className="text-xs text-neutral-500">{formatDateIT(item.currentDueDate)}</s>
                            )}
                            <span className={expired ? 'font-medium text-semantic-amber' : 'font-medium text-neutral-900'}>
                              {v.nuova_data ? formatDateIT(v.nuova_data) : 'senza scadenza'}
                            </span>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        {actionError && <p className="text-semantic-red">{actionError}</p>}
      </div>
    </Modal>
  )
}
