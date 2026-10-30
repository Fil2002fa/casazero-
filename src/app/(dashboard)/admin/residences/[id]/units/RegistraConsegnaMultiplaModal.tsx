'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { DateField } from '@/components/DateField'
import {
  bulkDeliveryOutcomeMessage, planDeliveryRecalc, sumDeliveryRecalcSummaries,
  type DeliveryRecalcPlan, type DeliveryRecalcSummary,
} from '@/lib/delivery-recalc'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import { pluralize } from '@/lib/pluralize'
import { bulkInviteMessage } from '@/lib/bulkInviteMessage'
import { createBulkInvites, getDeliveryPreviews, registerDelivery, type DeliveryPreviewResult } from './actions'
import { DeliveryPreviewWarnings } from './DeliveryPreviewWarnings'

// Consegna di più unità non consegnate con una sola data. Una chiamata a
// registerDelivery per unità, in serie: ogni unità è atomica per conto suo,
// l'esito può essere parziale e si dice unità per unità. Poi, come nella
// modale singola, gli inviti: una chiamata unica per le unità registrate.
type Step = 'form' | 'esecuzione' | 'esiti'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const STALL_MS = 20_000

type BulkUnit = { id: string; label: string; floor: number | null }

// Riga dell'anteprima: o un piano da registrare, o il motivo per cui l'unità
// resta fuori (letta male, consegnata nel frattempo, piano non calcolabile).
type Row = { unit: BulkUnit; label: string } & (
  | { plan: DeliveryRecalcPlan; excluded: null }
  | { plan: null; excluded: string }
)

type Outcome = { unitId: string; label: string; error: string | null; riepilogo: DeliveryRecalcSummary | null }

// Esito degli inviti dopo le consegne. null: nessuna unità registrata, o
// modale chiusa prima della chiamata.
type InviteOutcome = { message: string; error: null } | { message: null; error: string } | null

export function RegistraConsegnaMultiplaModal({
  units, residenceId, onClose,
}: {
  /** Unità selezionate, tutte non consegnate quando la modale si apre. */
  units: BulkUnit[]
  residenceId: string
  onClose: () => void
}) {
  const [results, setResults] = useState<DeliveryPreviewResult[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [newDate, setNewDate] = useState('')
  const [step, setStep] = useState<Step>('form')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)
  const [outcomes, setOutcomes] = useState<Outcome[]>([])
  const [invitesPhase, setInvitesPhase] = useState(false)
  const [inviteOutcome, setInviteOutcome] = useState<InviteOutcome>(null)
  // Il timer dei 20 s riparte a ogni unità (dipende da `done`) e all'avvio
  // degli inviti: conta il silenzio della singola chiamata, non del lotto.
  const [stalled, setStalled] = useState(false)
  // Chiusa la modale (possibile solo se una risposta tarda), il ciclo non
  // avvia altre registrazioni: quella in volo finisce, le successive no.
  const closed = useRef(false)
  // Rimesso a false al mount: in sviluppo StrictMode smonta e rimonta una volta.
  useEffect(() => {
    closed.current = false
    return () => { closed.current = true }
  }, [])

  useEffect(() => {
    if (!busy) return
    const t = setTimeout(() => setStalled(true), STALL_MS)
    return () => clearTimeout(t)
  }, [busy, done, invitesPhase])

  useEffect(() => {
    let cancelled = false
    getDeliveryPreviews(units.map(u => u.id), residenceId)
      .then(res => {
        if (cancelled) return
        if (res.error || !res.results) {
          setLoadError(res.error ?? 'Errore temporaneo nella lettura delle unità, riprova.')
          return
        }
        setResults(res.results)
      })
      .catch(() => { if (!cancelled) setLoadError('Errore imprevisto, ricarica la pagina') })
    return () => { cancelled = true }
  }, [units, residenceId])

  const dateValid = ISO_DATE.test(newDate)

  const rows = useMemo((): Row[] | null => {
    if (!results || !dateValid) return null
    const byId = new Map(results.map(r => [r.unitId, r] as const))
    return units.map((unit): Row => {
      const label = formatUnitLabel(unit.label, unit.floor)
      const r = byId.get(unit.id)
      if (!r) return { unit, label, plan: null, excluded: 'Unità non letta: ricarica la pagina.' }
      if ('error' in r) return { unit, label, plan: null, excluded: r.error }
      // Selezionabile solo da non consegnata: se nel frattempo ha una data,
      // correggerla è un atto singolo, dalla card dell'unità.
      if (r.preview.deliveryDate !== null) {
        return { unit, label, plan: null, excluded: 'Consegnata nel frattempo: la data si modifica dalla card dell\'unità.' }
      }
      try {
        const plan = planDeliveryRecalc({
          unitDeliveryDate: newDate,
          items: r.preview.items,
          categoryDates: r.preview.categoryDates,
          today: r.preview.today,
        })
        return { unit, label, plan, excluded: null }
      } catch (err) {
        console.error('RegistraConsegnaMultiplaModal: piano non calcolabile', { unitId: unit.id, err })
        return { unit, label, plan: null, excluded: 'Dati del piano non coerenti: la consegna non si può registrare.' }
      }
    })
  }, [results, dateValid, newDate, units])

  const eligible = useMemo(
    () => (rows ?? []).filter((r): r is Row & { plan: DeliveryRecalcPlan } => r.plan !== null),
    [rows],
  )
  const total = useMemo(() => sumDeliveryRecalcSummaries(eligible.map(r => r.plan.riepilogo)), [eligible])

  // In attesa si chiude solo se la risposta tarda (stalled), come nella modale singola.
  const waiting = busy && !stalled
  function handleClose() {
    if (!waiting) onClose()
  }

  async function submit() {
    if (!rows || eligible.length === 0) return
    const date = newDate
    setStep('esecuzione')
    setBusy(true)
    setStalled(false)
    setDone(0)
    const collected: Outcome[] = []
    for (const row of rows) {
      if (row.plan === null) {
        collected.push({ unitId: row.unit.id, label: row.label, error: row.excluded, riepilogo: null })
        continue
      }
      if (closed.current) return
      setStalled(false)
      let outcome: Outcome
      try {
        // expectedOldDate null: l'anteprima l'ha letta non consegnata. Se
        // un'altra scheda l'ha registrata nel frattempo, la RPC rifiuta (PT409).
        const res = await registerDelivery(row.unit.id, null, date)
        outcome = res.error || !res.riepilogo
          ? { unitId: row.unit.id, label: row.label, error: res.error ?? 'Errore temporaneo nella registrazione della consegna, riprova.', riepilogo: null }
          : { unitId: row.unit.id, label: row.label, error: null, riepilogo: res.riepilogo }
      } catch {
        outcome = { unitId: row.unit.id, label: row.label, error: 'Errore imprevisto: ricarica la pagina per vedere lo stato attuale.', riepilogo: null }
      }
      collected.push(outcome)
      setDone(d => d + 1)
    }
    // Le unità con un account attivo o un invito attivo le salta il server
    // (createBulkInvites), e le conta: il messaggio lo dice.
    const delivered = collected.filter(o => o.error === null).map(o => o.unitId)
    let invites: InviteOutcome = null
    if (delivered.length > 0 && !closed.current) {
      setStalled(false)
      setInvitesPhase(true)
      // try separato: le consegne sono già scritte, un guasto qui riguarda solo gli inviti.
      try {
        const res = await createBulkInvites(delivered, residenceId)
        invites = res.error
          ? { message: null, error: res.error }
          : { message: bulkInviteMessage(res) + (res.count > 0 ? ' I link sono nelle card delle unità.' : ''), error: null }
      } catch {
        invites = { message: null, error: 'Errore imprevisto.' }
      }
    }
    setInviteOutcome(invites)
    setInvitesPhase(false)
    setOutcomes(collected)
    setBusy(false)
    setStalled(false)
    setStep('esiti')
  }

  const writtenTotal = sumDeliveryRecalcSummaries(
    outcomes.flatMap(o => (o.riepilogo ? [o.riepilogo] : [])),
  )

  let footer: ReactNode
  if (step === 'esecuzione') {
    footer = stalled
      ? <Button variant="secondary" className="whitespace-nowrap" onClick={onClose}>Chiudi</Button>
      : null
  } else if (step === 'esiti' || !results) {
    footer = <Button variant="secondary" className="whitespace-nowrap" onClick={handleClose}>Chiudi</Button>
  } else {
    footer = (
      <>
        <Button variant="secondary" className="whitespace-nowrap" onClick={handleClose}>Annulla</Button>
        <Button variant="primary" disabled={eligible.length === 0} className="whitespace-nowrap" onClick={submit}>
          Registra consegna{eligible.length > 0 ? ` (${eligible.length})` : ''}
        </Button>
      </>
    )
  }

  return (
    <Modal
      open
      onClose={handleClose}
      title={`Registra consegna · ${pluralize(units.length, 'unità', 'unità')}`}
      size="wide"
      footer={footer}
    >
      <div className="space-y-4 text-sm text-neutral-900">
        <p className="text-neutral-600">
          Per unità consegnate lo stesso giorno. Se le date sono diverse, registrale una alla volta dalla card.
        </p>
        {stalled && (
          <p className="rounded-lg bg-semantic-amber-bg px-3 py-2 text-semantic-amber">
            Nessuna risposta dal server. Ricarica la pagina per vedere lo stato attuale.
          </p>
        )}
        {loadError && <p className="text-semantic-red">{loadError}</p>}

        {!loadError && !results && (
          <p className="flex items-center gap-2 text-neutral-600">
            <Loader2 className="w-4 h-4 animate-spin" /> Caricamento delle unità…
          </p>
        )}

        {results && step === 'form' && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="bulk-delivery-date" className="block text-xs font-medium text-neutral-600">
                Data di consegna per tutte le unità <span className="text-semantic-red">*</span>
              </label>
              <DateField id="bulk-delivery-date" name="delivery_date" required onChange={setNewDate} />
            </div>

            {!rows && <p className="text-neutral-600">Scegli una data per vedere l&apos;anteprima.</p>}

            {rows && (
              <div className="space-y-3">
                <p className="font-medium">
                  {pluralize(eligible.length, 'unità da registrare', 'unità da registrare')} ·{' '}
                  {pluralize(total.ricalcolate, 'voce ricalcolata', 'voci ricalcolate')}
                </p>
                <DeliveryPreviewWarnings riepilogo={total} />

                <ul className="max-h-72 overflow-y-auto divide-y divide-border rounded-lg border border-border">
                  {rows.map(row => (
                    <li key={row.unit.id} className="flex items-start justify-between gap-4 px-3 py-2">
                      <span className="min-w-0 break-words font-medium">{row.label}</span>
                      {row.plan ? (
                        <span className="shrink-0 text-right">
                          <span className="block">
                            {pluralize(row.plan.riepilogo.ricalcolate, 'voce ricalcolata', 'voci ricalcolate')}
                          </span>
                          {row.plan.riepilogo.gia_scadute > 0 && (
                            <span className="block text-xs text-semantic-amber">
                              {pluralize(row.plan.riepilogo.gia_scadute, 'già scaduta', 'già scadute')}
                            </span>
                          )}
                          {row.plan.riepilogo.saltate.nel_fascicolo > 0 && (
                            <span className="block text-xs text-semantic-amber">
                              {pluralize(row.plan.riepilogo.saltate.nel_fascicolo, 'invariata perché nel fascicolo', 'invariate perché nel fascicolo')}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="min-w-0 text-right text-xs text-semantic-red">Esclusa: {row.excluded}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {step === 'esecuzione' && (
          <p className="flex items-center gap-2 text-neutral-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            {invitesPhase ? 'Generazione degli inviti…' : <>Registrazione in corso: {done} di {eligible.length}…</>}
          </p>
        )}

        {step === 'esiti' && (
          <div className="space-y-3">
            <p className={outcomes.every(o => o.error === null) ? 'font-medium' : 'font-medium text-semantic-red'}>
              {bulkDeliveryOutcomeMessage(outcomes)}
            </p>
            {writtenTotal.ricalcolate > 0 && (
              <p className="text-neutral-600">
                {pluralize(writtenTotal.ricalcolate, 'voce ricalcolata', 'voci ricalcolate')} nelle unità registrate.
              </p>
            )}
            {inviteOutcome?.message && <p>{inviteOutcome.message}</p>}
            {inviteOutcome?.error && (
              <p className="text-semantic-red">
                Inviti non generati: {inviteOutcome.error} Si generano da «Invita tutte», sopra l&apos;elenco delle unità.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
