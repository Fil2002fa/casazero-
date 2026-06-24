'use client'

import { useState, useTransition } from 'react'
import { Plus, QrCode, Trash2, UserPlus, Copy, Check } from 'lucide-react'
import { createUnit, createInvite, revokeInvite } from './actions'
import Image from 'next/image'
import { formatUnitLabel } from '@/lib/formatUnitLabel'

type MemberRow = { profile_id: string; profiles: { full_name: string | null } | null }
type InviteRow = { id: string; token: string; expires_at: string; used_at: string | null }
type UnitRow = { id: string; label: string; floor: number | null; members: MemberRow[]; invites: InviteRow[]; qrCodes: Record<string, string> }

export function UnitsManager({
  residenceId, units, appUrl,
}: {
  residenceId: string
  units: UnitRow[]
  appUrl: string
}) {
  const [pending, startTransition] = useTransition()
  const [newUnitLabel, setNewUnitLabel] = useState('')
  const [newUnitFloor, setNewUnitFloor] = useState('')
  const [showNewUnitForm, setShowNewUnitForm] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null)

  function handleAddUnit() {
    if (!newUnitLabel.trim()) return
    setLocalError(null)
    startTransition(async () => {
      const res = await createUnit(residenceId, newUnitLabel, newUnitFloor ? parseInt(newUnitFloor) : null)
      if (res.error) {
        setLocalError(res.error)
      } else {
        setNewUnitLabel('')
        setNewUnitFloor('')
        setShowNewUnitForm(false)
        // Trigger page refresh via router.refresh would be ideal, but page will revalidate
        window.location.reload()
      }
    })
  }

  function handleGenerateInvite(unitId: string) {
    setLocalError(null)
    startTransition(async () => {
      const res = await createInvite(unitId, residenceId)
      if (res.error) {
        setLocalError(res.error)
      } else {
        window.location.reload()
      }
    })
  }

  function handleRevokeInvite(inviteId: string) {
    startTransition(async () => {
      await revokeInvite(inviteId, residenceId)
      window.location.reload()
    })
  }

  function copyInviteUrl(token: string, inviteId: string) {
    const url = `${appUrl}/welcome/${token}`
    navigator.clipboard.writeText(url)
    setCopiedId(inviteId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="space-y-4">
      {/* Aggiungi unità */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-primary">{units.length} unità</p>
        <button
          onClick={() => setShowNewUnitForm(!showNewUnitForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-dark text-white rounded-lg text-xs font-medium"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2} />
          Aggiungi
        </button>
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

      {/* Lista unità */}
      {units.map(unit => {
        const activeInvites = unit.invites.filter(i => !i.used_at && new Date(i.expires_at) > new Date())
        const usedInvites = unit.invites.filter(i => i.used_at)
        const isExpanded = expandedUnit === unit.id

        return (
          <div key={unit.id} className="bg-surface rounded-xl border border-border overflow-hidden">
            {/* Header unità */}
            <button
              onClick={() => setExpandedUnit(isExpanded ? null : unit.id)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <div>
                <p className="text-sm font-medium text-text-primary">{formatUnitLabel(unit.label, unit.floor)}</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {unit.floor ? `Piano ${unit.floor} · ` : ''}
                  {unit.members.length > 0
                    ? unit.members.map(m => m.profiles?.full_name ?? 'Utente').join(', ')
                    : 'Nessun residente'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {activeInvites.length > 0 && (
                  <span className="text-[10px] bg-semantic-amber-bg text-semantic-amber px-2 py-0.5 rounded-full">
                    {activeInvites.length} invito/i attivo/i
                  </span>
                )}
                <span className="text-text-secondary text-xs">{isExpanded ? '▲' : '▼'}</span>
              </div>
            </button>

            {/* Contenuto espanso */}
            {isExpanded && (
              <div className="border-t border-border px-4 py-3 space-y-4">
                {/* Residenti */}
                {unit.members.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Residenti</p>
                    <div className="space-y-1">
                      {unit.members.map(m => (
                        <div key={m.profile_id} className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-brand-light rounded-full flex items-center justify-center text-brand-dark text-[10px] font-medium">
                            {(m.profiles?.full_name ?? '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm text-text-primary">{m.profiles?.full_name ?? 'Utente'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Inviti attivi */}
                {activeInvites.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Inviti attivi</p>
                    <div className="space-y-3">
                      {activeInvites.map(inv => {
                        const url = `${appUrl}/welcome/${inv.token}`
                        const qrSrc = unit.qrCodes[inv.id]
                        return (
                          <div key={inv.id} className="bg-background rounded-lg p-3 space-y-2">
                            {qrSrc && (
                              <div className="flex justify-center">
                                <Image src={qrSrc} alt="QR invito" width={120} height={120} className="rounded" />
                              </div>
                            )}
                            <p className="text-xs text-text-secondary break-all">{url}</p>
                            <p className="text-[10px] text-text-secondary">
                              Scade il {new Date(inv.expires_at).toLocaleDateString('it-IT')}
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => copyInviteUrl(inv.token, inv.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-dark text-white rounded-lg text-xs"
                              >
                                {copiedId === inv.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                {copiedId === inv.id ? 'Copiato' : 'Copia URL'}
                              </button>
                              <button
                                onClick={() => handleRevokeInvite(inv.id)}
                                disabled={pending}
                                className="flex items-center gap-1.5 px-3 py-1.5 border border-semantic-red/30 text-semantic-red rounded-lg text-xs"
                              >
                                <Trash2 className="w-3 h-3" />
                                Revoca
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Azioni */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleGenerateInvite(unit.id)}
                    disabled={pending}
                    className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs text-text-primary bg-surface"
                  >
                    {pending ? '…' : <><UserPlus className="w-3.5 h-3.5" /> Genera invito QR</>}
                  </button>
                  {activeInvites.length === 0 && usedInvites.length === 0 && unit.members.length === 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-2 bg-background rounded-lg text-xs text-text-secondary">
                      <QrCode className="w-3.5 h-3.5" />
                      Nessun invito — generane uno
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
