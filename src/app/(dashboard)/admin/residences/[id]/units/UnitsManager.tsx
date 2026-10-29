'use client'

import { useState, useTransition, useMemo } from 'react'
import { Plus, UserPlus, Check, Pencil, X, Loader2, CalendarCheck } from 'lucide-react'
import { createUnit, createInvite, revokeInvite, updateUnitLabel, createBulkInvites } from './actions'
import { unitHasNoActiveAccount, unitNotDelivered, unitResidentStatus, type UnitResidentStatus } from '@/lib/unit-utils'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import { pluralize } from '@/lib/pluralize'
import { formatDateIT } from '@/lib/formatDate'
import { InviteLinkCard } from './InviteLinkCard'
import { useToast } from '@/components/ui/Toast'
import { RegistraConsegnaModal } from './RegistraConsegnaModal'
import { RegistraConsegnaMultiplaModal } from './RegistraConsegnaMultiplaModal'

type MemberRow = { profile_id: string; is_primary: boolean; profiles: { full_name: string | null } | null }
type InviteRow = { id: string; token: string; expires_at: string; used_at: string | null }
type UnitRow = { id: string; label: string; floor: number | null; deliveryDate: string | null; members: MemberRow[]; rawMembers: { ended_at: string | null }[]; invites: InviteRow[] }

// Stato del residente come testo colorato, senza pillola. Sotto md segue
// "Piano · consegna" sulla stessa riga, preceduto da " · "; da md va a destra
// (ml-auto) e il separatore sparisce. Colore solo sul testo dello stato
// (per il residente, solo sul nome).
const RESIDENT_STATUS_COLOR: Record<Exclude<UnitResidentStatus['stato'], 'nessuno'>, string> = {
  da_invitare:          'text-semantic-amber',
  invito_inviato:       'text-text-secondary',
  residente:            'text-brand-medium',
  residente_gia_attivo: 'text-semantic-amber',
}

function ResidentStatusText({ status }: { status: UnitResidentStatus }) {
  if (status.stato === 'nessuno') return null
  // Residente: l'etichetta resta neutra, il colore va solo sul nome.
  const content = status.stato === 'residente'
    ? <><span className="text-text-secondary">Residente: </span><span className={RESIDENT_STATUS_COLOR.residente}>{status.nome ?? 'attivo'}</span></>
    : <span className={RESIDENT_STATUS_COLOR[status.stato]}>
        {status.stato === 'da_invitare' ? 'Da invitare' : status.stato === 'invito_inviato' ? 'Invito inviato' : 'Residente già attivo'}
      </span>
  return (
    <span className="text-xs md:text-sm md:ml-auto md:shrink-0">
      <span className="text-text-secondary md:hidden">· </span>
      {content}
    </span>
  )
}

// Invito attivo = non usato e non scaduto: stessa definizione del server
// (createInvite, createBulkInvites, revoca in registerDelivery).
function activeInvitesOf(unit: { invites: InviteRow[] }): InviteRow[] {
  return unit.invites.filter(i => !i.used_at && new Date(i.expires_at) > new Date())
}

function bulkInviteMessage(r: { count: number; skipped: number; notDelivered: number }): string {
  const head = r.count > 0 ? `Inviti generati per ${r.count} unità` : 'Nessun nuovo invito generato'
  const notes: string[] = []
  if (r.notDelivered > 0) {
    notes.push(`${pluralize(r.notDelivered, 'unità saltata', 'unità saltate')} perché non ${r.notDelivered === 1 ? 'consegnata' : 'consegnate'}`)
  }
  const other = r.skipped - r.notDelivered
  if (other > 0) {
    notes.push(`${pluralize(other, 'unità saltata', 'unità saltate')} perché ${other === 1 ? 'ha' : 'hanno'} già un account o un invito attivo`)
  }
  return notes.length > 0 ? `${head}; ${notes.join('; ')}.` : `${head}.`
}

export function UnitsManager({
  residenceId, units, appUrl, initialFilter,
}: {
  residenceId: string
  units: UnitRow[]
  appUrl: string
  initialFilter?: string
}) {
  const { showToast } = useToast()
  const [pending, startTransition] = useTransition()
  const [newUnitLabel, setNewUnitLabel] = useState('')
  const [newUnitFloor, setNewUnitFloor] = useState('')
  const [showNewUnitForm, setShowNewUnitForm] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null)
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [filterSenzaAccount, setFilterSenzaAccount] = useState(initialFilter === 'senza_account')
  const [deliveryUnitId, setDeliveryUnitId] = useState<string | null>(null)
  const deliveryUnit = deliveryUnitId ? units.find(u => u.id === deliveryUnitId) ?? null : null
  // Consegna multipla: si selezionano solo unità non consegnate. Correggere
  // una data già registrata è un atto singolo, dalla card dell'unità.
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  // Istantanea delle unità all'apertura: la modale non cambia elenco se la
  // pagina si aggiorna mentre registra.
  const [bulkDeliveryUnits, setBulkDeliveryUnits] = useState<{ id: string; label: string; floor: number | null }[] | null>(null)

  const displayUnits = filterSenzaAccount
    ? units.filter(u => unitHasNoActiveAccount(u.rawMembers))
    : units

  const unitsSenzaAccount = useMemo(
    () => units.filter(u => unitHasNoActiveAccount(u.rawMembers)),
    [units]
  )

  const bulkTargets = useMemo(
    () => unitsSenzaAccount.filter(u => activeInvitesOf(u).length === 0),
    [unitsSenzaAccount]
  )
  // Il numero sul bottone conta solo le unità che riceveranno davvero l'invito.
  const bulkDeliveredCount = bulkTargets.filter(u => !unitNotDelivered(u.deliveryDate)).length

  // Derivate dalle unità visibili: un'unità consegnata nel frattempo o nascosta
  // dal filtro esce dalla selezione senza bisogno di ripulire lo stato.
  const selectableUnits = displayUnits.filter(u => unitNotDelivered(u.deliveryDate))
  const selectedUnits = selectableUnits.filter(u => selected.has(u.id))
  const allSelected = selectableUnits.length > 0 && selectedUnits.length === selectableUnits.length

  function toggleSelected(unitId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(unitId)) next.delete(unitId)
      else next.add(unitId)
      return next
    })
  }

  function toggleAllSelected() {
    setSelected(allSelected ? new Set() : new Set(selectableUnits.map(u => u.id)))
  }

  function handleAddUnit() {
    if (!newUnitLabel.trim()) return
    setLocalError(null)
    startTransition(async () => {
      try {
        const res = await createUnit(residenceId, newUnitLabel, newUnitFloor ? parseInt(newUnitFloor) : null)
        if (res.error) {
          setLocalError(res.error)
        } else {
          setNewUnitLabel('')
          setNewUnitFloor('')
          setShowNewUnitForm(false)
        }
      } catch {
        setLocalError('Errore imprevisto, ricarica la pagina')
      }
    })
  }

  function handleGenerateInvite(unitId: string) {
    setLocalError(null)
    startTransition(async () => {
      try {
        const res = await createInvite(unitId, residenceId)
        if (res.error) {
          setLocalError(res.error)
        } else {
          showToast('success', res.existing ? 'Esiste già un invito attivo: è quello mostrato.' : 'Invito generato.')
        }
      } catch {
        setLocalError('Errore imprevisto, ricarica la pagina')
      }
    })
  }

  function handleSaveLabel(unitId: string) {
    const trimmed = editLabel.trim()
    if (!trimmed) return
    startTransition(async () => {
      try {
        const res = await updateUnitLabel(unitId, trimmed, residenceId)
        if (res.error) {
          setLocalError(res.error)
        } else {
          setEditingUnitId(null)
        }
      } catch {
        setLocalError('Errore imprevisto, ricarica la pagina')
      }
    })
  }

  function handleRevokeInvite(inviteId: string) {
    setLocalError(null)
    startTransition(async () => {
      try {
        const res = await revokeInvite(inviteId, residenceId)
        if (res.error) {
          setLocalError(res.error)
        }
      } catch {
        setLocalError('Errore imprevisto, ricarica la pagina')
      }
    })
  }

  function handleBulkInvite() {
    setLocalError(null)
    startTransition(async () => {
      try {
        // Si mandano anche le non consegnate: è il server a saltarle e contarle,
        // così il riepilogo dice quante sono rimaste fuori e perché.
        const res = await createBulkInvites(bulkTargets.map(u => u.id), residenceId)
        if (res.error) {
          setLocalError(res.error)
        } else {
          showToast('success', bulkInviteMessage(res))
        }
      } catch {
        setLocalError('Errore imprevisto, ricarica la pagina')
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Testata: conteggio + azioni. Le azioni vanno a capo quando non stanno
          accanto al conteggio: su un telefono i due bottoni da soli occupano
          quasi tutta la larghezza, e senza wrap la pagina scorre di lato. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-text-primary">{units.length} unità</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleBulkInvite}
            disabled={pending || bulkDeliveredCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-semantic-amber text-white rounded-lg text-xs font-medium disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            {pending && <Loader2 className="w-3 h-3 animate-spin" />}
            Invita le unità consegnate{bulkDeliveredCount > 0 ? ` (${bulkDeliveredCount})` : ''}
          </button>
          <button
            onClick={() => setShowNewUnitForm(!showNewUnitForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-dark text-white rounded-lg text-xs font-medium cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
            Aggiungi
          </button>
        </div>
      </div>

      {showNewUnitForm && (
        <div className="bg-surface rounded-xl border border-border p-4 space-y-3">
          <p className="text-sm font-medium text-text-primary">Nuova unità</p>
          <input
            type="text"
            value={newUnitLabel}
            onChange={e => setNewUnitLabel(e.target.value)}
            placeholder="Etichetta (es. Unità 15)"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
          <input
            type="number"
            value={newUnitFloor}
            onChange={e => setNewUnitFloor(e.target.value)}
            placeholder="Piano (opzionale)"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAddUnit}
              disabled={pending || !newUnitLabel.trim()}
              className="flex-1 py-2 bg-brand-dark text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {pending ? '…' : 'Crea'}
            </button>
            <button
              onClick={() => setShowNewUnitForm(false)}
              className="px-4 py-2 border border-border rounded-lg text-sm text-text-secondary"
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {localError && (
        <div className="bg-semantic-red-bg border border-semantic-red/20 rounded-xl p-3">
          <p className="text-sm text-semantic-red">{localError}</p>
        </div>
      )}

      {/* Banner filtro attivo — solo indicatore, l'azione vive nel bottone di testata */}
      {filterSenzaAccount && (
        <div className="flex items-center justify-between px-3 py-2 gap-3 bg-semantic-amber-bg rounded-lg border border-semantic-amber/20">
          <p className="text-xs text-semantic-amber shrink-0">
            {displayUnits.length} unità senza account cliente
          </p>
          <button
            onClick={() => setFilterSenzaAccount(false)}
            className="text-xs text-semantic-amber underline shrink-0"
          >
            Mostra tutte
          </button>
        </div>
      )}

      {/* Selezione per la consegna multipla: esiste solo se c'è qualcosa da
          selezionare. Comando discreto, testuale: l'azione vera è il bottone. */}
      {selectableUnits.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4">
          <button
            type="button"
            onClick={toggleAllSelected}
            className="text-sm text-text-secondary underline underline-offset-2 hover:text-text-primary cursor-pointer"
          >
            {allSelected ? 'Deseleziona tutte' : `Seleziona le non consegnate (${selectableUnits.length})`}
          </button>
          {selectedUnits.length > 0 && (
            <button
              onClick={() => setBulkDeliveryUnits(selectedUnits.map(u => ({ id: u.id, label: u.label, floor: u.floor })))}
              disabled={pending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-dark text-white rounded-lg text-xs font-medium disabled:opacity-40"
            >
              <CalendarCheck className="w-3.5 h-3.5" /> Registra consegna ({selectedUnits.length})
            </button>
          )}
        </div>
      )}

      {/* Lista unità */}
      {displayUnits.map(unit => {
        const activeInvites = activeInvitesOf(unit)
        const isExpanded = expandedUnit === unit.id
        const notDelivered = unitNotDelivered(unit.deliveryDate)

        return (
          <div key={unit.id} className="bg-surface rounded-xl border border-border overflow-hidden">
            {/* Header unità. La casella di selezione sta accanto all'header, non
                dentro: l'header è già un elemento interattivo. Solo le non
                consegnate hanno la casella: le consegnate non sono selezionabili. */}
            <div className="flex items-stretch">
              {notDelivered && (
                <label className="flex items-center pl-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(unit.id)}
                    onChange={() => toggleSelected(unit.id)}
                    aria-label={`Seleziona ${formatUnitLabel(unit.label, unit.floor)}`}
                    className="w-4 h-4 accent-brand-dark cursor-pointer"
                  />
                </label>
              )}
              <div
                role="button"
                tabIndex={0}
                onClick={() => { if (editingUnitId !== unit.id) setExpandedUnit(isExpanded ? null : unit.id) }}
                onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && editingUnitId !== unit.id) setExpandedUnit(isExpanded ? null : unit.id) }}
                className={`flex-1 min-w-0 flex items-center justify-between p-4 text-left cursor-pointer${notDelivered ? ' pl-3' : ''}`}
              >
                {/* Una sola struttura per le due larghezze. Sotto md: nome a tutta
                    riga, sotto "Piano · consegna · stato residente". Da md: tutto
                    su una riga, lo stato residente spinto a destra (ml-auto). */}
                <div className="flex-1 min-w-0 flex flex-wrap md:flex-nowrap items-baseline gap-x-1 md:gap-x-3 gap-y-0.5">
                  {editingUnitId === unit.id ? (
                    <div onClick={e => e.stopPropagation()} className="basis-full md:basis-auto flex items-center gap-1.5 mb-1">
                      <input
                        value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                        maxLength={60}
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveLabel(unit.id)
                          if (e.key === 'Escape') setEditingUnitId(null)
                        }}
                        className="flex-1 min-w-0 border border-brand-medium rounded-lg px-2 py-1 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                      />
                      <button
                        onClick={() => handleSaveLabel(unit.id)}
                        disabled={pending || !editLabel.trim()}
                        className="p-1.5 rounded-lg bg-brand-dark text-white disabled:opacity-40"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingUnitId(null)}
                        className="p-1.5 rounded-lg border border-border text-text-secondary"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="basis-full md:basis-auto shrink-0 flex items-center gap-1.5">
                      <p className="text-sm md:text-[15px] font-medium text-text-primary">{formatUnitLabel(unit.label, unit.floor)}</p>
                      <button
                        onClick={e => { e.stopPropagation(); setEditingUnitId(unit.id); setEditLabel(unit.label) }}
                        className="p-0.5 rounded text-text-secondary hover:text-text-primary transition-colors"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-text-secondary">
                    {unit.floor ? `Piano ${unit.floor} · ` : ''}
                    {/* Da md la consegna pesa come dato principale; il piano resta secondario. */}
                    <span className="md:text-sm md:text-text-primary">
                      {notDelivered ? 'Non consegnata' : `Consegnata il ${formatDateIT(unit.deliveryDate)}`}
                    </span>
                  </p>
                  <ResidentStatusText
                    status={unitResidentStatus({
                      deliveryDate: unit.deliveryDate,
                      members: unit.rawMembers,
                      hasActiveInvite: activeInvites.length > 0,
                      residentName: unit.members[0]?.profiles?.full_name ?? null,
                    })}
                  />
                </div>
                <span className="ml-3 shrink-0 text-text-secondary text-xs">{isExpanded ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* Contenuto espanso */}
            {isExpanded && (
              <div className="border-t border-border px-4 py-3 space-y-4">
                {/* Residenti */}
                {unit.members.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-text-secondary mb-2">Residenti</p>
                    <div className="space-y-1">
                      {unit.members.map(m => (
                        <div key={m.profile_id} className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-brand-light rounded-full flex items-center justify-center text-brand-dark text-xs font-medium">
                            {(m.profiles?.full_name ?? '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm text-text-primary">{m.profiles?.full_name ?? 'Utente'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Inviti attivi. Un'unità non consegnata non ha inviti attivi:
                    la sezione non si mostra nemmeno se il DB ne ha di residui. */}
                {!notDelivered && activeInvites.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-text-secondary mb-2">Inviti attivi</p>
                    <div className="space-y-3">
                      {activeInvites.map(inv => (
                        <InviteLinkCard
                          key={inv.id}
                          url={`${appUrl}/welcome/${inv.token}`}
                          expiresAt={inv.expires_at}
                          onRevoke={() => handleRevokeInvite(inv.id)}
                          revokeDisabled={pending}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Azioni */}
                <div className="flex flex-wrap gap-2">
                  {/* Consegna prima dell'invito: da non consegnata, registrare la
                      consegna è l'azione principale e viene per prima. */}
                  {notDelivered && (
                    <button
                      onClick={() => setDeliveryUnitId(unit.id)}
                      disabled={pending}
                      className="flex items-center gap-1.5 px-3 py-2 bg-brand-dark text-white rounded-lg text-xs font-medium disabled:opacity-40"
                    >
                      <CalendarCheck className="w-3.5 h-3.5" /> Registra consegna
                    </button>
                  )}
                  {/* Un invito attivo si mostra (sopra), mai un secondo: il bottone
                      esiste solo senza inviti attivi. */}
                  {(notDelivered || activeInvites.length === 0) && (
                    <button
                      onClick={() => handleGenerateInvite(unit.id)}
                      disabled={pending || notDelivered}
                      className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs text-text-primary bg-surface disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {pending ? '…' : <><UserPlus className="w-3.5 h-3.5" /> Genera invito</>}
                    </button>
                  )}
                  {!notDelivered && (
                    <button
                      onClick={() => setDeliveryUnitId(unit.id)}
                      disabled={pending}
                      className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs text-text-primary bg-surface"
                    >
                      <CalendarCheck className="w-3.5 h-3.5" /> Modifica data di consegna
                    </button>
                  )}
                  {notDelivered && (
                    <p className="self-center text-xs text-text-secondary">Registra prima la consegna</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {deliveryUnit && (
        <RegistraConsegnaModal
          key={deliveryUnit.id}
          unit={deliveryUnit}
          residenceId={residenceId}
          appUrl={appUrl}
          hasNoActiveAccount={unitHasNoActiveAccount(deliveryUnit.rawMembers)}
          activeInviteCount={activeInvitesOf(deliveryUnit).length}
          onClose={() => setDeliveryUnitId(null)}
        />
      )}

      {bulkDeliveryUnits && (
        <RegistraConsegnaMultiplaModal
          units={bulkDeliveryUnits}
          residenceId={residenceId}
          onClose={() => { setBulkDeliveryUnits(null); setSelected(new Set()) }}
        />
      )}
    </div>
  )
}
