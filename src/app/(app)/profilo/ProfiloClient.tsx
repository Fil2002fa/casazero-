'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Check, Copy, Trash2, UserPlus, Users, Bell, LogOut, Lock, UserRound, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createFamilyInvite, revokeFamilyInvite, updateNotificationPrefs } from './actions'
import { signOut } from '@/app/auth/actions'
import type { NotificationPrefs } from '@/types/database'
import { formatUnitLabel } from '@/lib/formatUnitLabel'

type InviteRow = { id: string; token: string; expires_at: string; qrCode: string }
type MemberRow = { profile_id: string; full_name: string | null }

// ── Configurazione eventi/canali ────────────────────────────────────────────
const PREF_ROWS: { label: string; emailKey: 'email_reminders' | 'email_n3_status' }[] = [
{ label: 'Manutenzioni consigliate', emailKey: 'email_reminders' },
{ label: 'Aggiornamenti manutenzioni condominiali', emailKey: 'email_n3_status' },
]

export function ProfiloClient({
  unit,
  members,
  invites,
  appUrl,
  notifPrefs,
}: {
  unit: { id: string; label: string; residence_id: string; residence_name: string; address: string | null } | null
  members: MemberRow[]
  invites: InviteRow[]
  appUrl: string
  notifPrefs: NotificationPrefs
}) {
  const [pending, startTransition] = useTransition()
  const [prefSaved, setPrefSaved] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const [inviteError, setInviteError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [prefs, setPrefs] = useState<NotificationPrefs>(notifPrefs)
  const [prefError, setPrefError] = useState<string | null>(null)

  function handleGenerateInvite() {
    if (!unit) return
    setInviteError(null)
    startTransition(async () => {
      try {
        const res = await createFamilyInvite(unit.id)
        if (res.error) setInviteError(res.error)
        else window.location.reload()
      } catch { setInviteError('Impossibile generare l’invito. Riprova.') }
    })
  }

  function handleRevokeInvite(inviteId: string) {
    if (!unit) return
    setInviteError(null)
    startTransition(async () => {
      try {
        const res = await revokeFamilyInvite(inviteId, unit.id)
        if (res.error) setInviteError(res.error)
        else window.location.reload()
      } catch { setInviteError('Impossibile revocare l’invito. Riprova.') }
    })
  }

  async function copyUrl(token: string, inviteId: string) {
    try {
      await navigator.clipboard.writeText(`${appUrl}/welcome/${token}`)
      setCopiedId(inviteId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch { setInviteError('Impossibile copiare il link. Riprova.') }
  }

  async function handleTogglePref(key: keyof NotificationPrefs) {
    if (savingKey !== null) return  // evita salvataggi concorrenti
    const prev = prefs
    const newPrefs = { ...prev, [key]: !prev[key] }
    setPrefs(newPrefs)
    setPrefError(null)
    setSavingKey(key)
    setPrefSaved(false)
    try {
      const res = await updateNotificationPrefs(newPrefs)
      if (res.error) {
        setPrefs(prev)
        setPrefError(res.error)
      } else setPrefSaved(true)
    } catch {
      setPrefs(prev)
      setPrefError('Impossibile salvare le preferenze. Riprova.')
    } finally { setSavingKey(null) }
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="bg-surface border-b border-border px-4 py-4 sticky top-0 z-10">
        <h1 className="font-serif text-[22px] font-semibold text-text-primary">Profilo</h1>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">

        <Link href="/profilo/dati-personali" className="flex min-h-11 items-center gap-3 bg-surface rounded-xl border border-border p-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20">
          <UserRound className="w-5 h-5 shrink-0 text-brand-medium" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium text-text-primary">Dati personali</h2>
            <p className="mt-1 text-xs text-text-secondary">Nome, telefono ed email del tuo account.</p>
          </div>
          <ChevronRight className="w-5 h-5 shrink-0 text-text-secondary" aria-hidden="true" />
        </Link>

        {/* Residenza e unità */}
        {!unit && <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
          <h2 className="text-sm font-medium text-text-primary">La tua abitazione</h2>
          <p className="text-sm text-text-secondary">Nessuna abitazione associata al tuo account.</p>
        </section>}
        {unit && (
          <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
            <h2 className="text-sm font-medium text-text-primary">La tua abitazione</h2>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-text-secondary">Residenza</p>
                <p className="text-base font-medium text-text-primary">{unit.residence_name}</p>
                {unit.address && <p className="text-sm text-text-secondary mt-0.5">{unit.address}</p>}
              </div>
              <div>
                <p className="text-xs text-text-secondary">Unità</p>
                <p className="text-base font-medium text-text-primary">{formatUnitLabel(unit.label)}</p>
              </div>
            </div>
          </section>
        )}

        {/* Accessi familiari */}
        {!unit && <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
          <h2 className="text-sm font-medium text-text-primary">Accessi familiari</h2>
          <p className="text-sm text-text-secondary">Gli accessi familiari richiedono un’abitazione associata.</p>
        </section>}
        {unit && (
          <section className="bg-surface rounded-xl border border-border p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-medium" strokeWidth={1.8} />
              <h2 className="text-sm font-medium text-text-primary">Accessi familiari</h2>
            </div>

            {members.length > 0 && (
              <div>
                <p className="text-xs text-text-secondary mb-2">Membri dell&apos;unità</p>
                <div className="space-y-1.5">
                  {members.map(m => (
                    <div key={m.profile_id} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-brand-light flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-medium text-brand-dark">
                          {(m.full_name ?? '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-text-primary min-w-0 break-words">{m.full_name ?? 'Utente'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {invites.length > 0 && (
              <div>
                <p className="text-xs text-text-secondary mb-2">Inviti attivi</p>
                <div className="space-y-3">
                  {invites.map(inv => {
                    const expiry = new Date(inv.expires_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
                    return (
                      <div key={inv.id} className="border border-border rounded-lg p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-text-primary">Invito familiare</p>
                            <p className="text-xs text-text-secondary">Scade il {expiry}</p>
                          </div>
                          <button
                            onClick={() => handleRevokeInvite(inv.id)}
                            disabled={pending}
                            className="w-11 h-11 flex items-center justify-center text-semantic-red rounded-lg disabled:opacity-50 -mr-2 -mt-1 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20"
                            aria-label="Revoca invito"
                          >
                            <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                          </button>
                        </div>
                        <div className="flex justify-center">
                          {inv.qrCode ? <Image src={inv.qrCode} alt="QR invito" width={140} height={140} /> : <p className="text-xs text-text-secondary">QR non disponibile. Usa il link.</p>}
                        </div>
                        <button
                          onClick={() => copyUrl(inv.token, inv.id)}
                          className="w-full flex items-center justify-center gap-1.5 h-11 border border-border rounded-lg text-sm text-text-secondary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20"
                        >
                          {copiedId === inv.id ? (
                            <><Check className="w-3.5 h-3.5 text-brand-dark" strokeWidth={2} /> Copiato</>
                          ) : (
                            <><Copy className="w-3.5 h-3.5" strokeWidth={1.8} /> Copia link</>
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {inviteError && <p role="alert" className="text-xs text-semantic-red">{inviteError}</p>}

            <button
              onClick={handleGenerateInvite}
              disabled={pending || invites.length >= 5}
              className="w-full flex items-center justify-center gap-2 h-11 border border-brand-medium rounded-lg text-sm font-medium text-brand-dark disabled:opacity-40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20"
            >
              <UserPlus className="w-4 h-4" strokeWidth={1.8} />
              {pending ? 'Operazione in corso…' : invites.length >= 5 ? 'Limite inviti raggiunto' : 'Genera invito familiare'}
            </button>
            <p className="text-xs text-text-secondary text-center">
              Il link sarà valido 30 giorni. Massimo 5 inviti attivi per unità.
            </p>
          </section>
        )}

        {/* Preferenze notifiche */}
        <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-brand-medium" strokeWidth={1.8} />
            <h2 className="text-sm font-medium text-text-primary">Notifiche email</h2>
          </div>

          <p className="text-xs text-text-secondary">Le preferenze regolano le email opzionali. La consegna dipende dalla configurazione del servizio email.</p>
          <div className="divide-y divide-border">
            <div className="flex items-center gap-3 py-3"><p className="flex-1 text-sm text-text-primary">Avvisi di scadenza e solleciti obbligatori: sempre attivi</p><Lock className="w-4 h-4 text-text-secondary" aria-hidden="true" /></div>
            {PREF_ROWS.map(row => <div key={row.emailKey} className="flex items-center gap-3 py-4">
              <p className="flex-1 text-sm text-text-primary">{row.label}</p>
              <Toggle label={row.label} on={prefs[row.emailKey]} disabled={savingKey !== null} onToggle={() => handleTogglePref(row.emailKey)} />
            </div>)}
          </div>
          {prefError && <p role="alert" className="text-xs text-semantic-red">{prefError}</p>}
          <p role="status" className="text-xs text-text-secondary">{savingKey ? 'Salvataggio...' : prefSaved ? 'Preferenze salvate.' : ''}</p>
        </section>

        {/* Logout */}
        <form action={signOut.bind(null, null)}>
          <Button type="submit" variant="ghost" className="w-full gap-2">
            <LogOut className="w-4 h-4" strokeWidth={1.8} />
            Esci dall&apos;account
          </Button>
        </form>

      </div>
    </div>
  )
}

// ── Toggle switch ────────────────────────────────────────────────────────────
// locked = sempre ON, nessuna interazione, nessun velo (usato per email invariante)
// disabled = preferenza non disponibile o salvataggio in corso
// Il bottone è l'area di tocco 44×44 attorno alla traccia visiva 36×20: i
// margini negativi (-mx-1 -my-3) lasciano invariato l'ingombro nella riga.
function Toggle({
  label,
  on,
  onToggle,
  disabled,
  locked,
}: {
  label: string
  on: boolean
  onToggle?: () => void
  disabled?: boolean
  locked?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={on}
      aria-disabled={locked || disabled}
      disabled={locked || disabled}
      onClick={locked || disabled ? undefined : onToggle}
      className={`group flex items-center justify-center w-11 h-11 -mx-1 -my-3 flex-shrink-0 focus-visible:outline-none ${
        locked    ? 'cursor-default' :
        disabled  ? 'cursor-not-allowed' :
        onToggle  ? 'cursor-pointer' :
                    'cursor-not-allowed'
      }`}
    >
      <span
        className={`relative inline-flex w-9 h-5 rounded-full transition-colors ${
          on ? 'bg-brand-dark' : 'bg-border'
        } ${
          locked    ? '' :
          disabled  ? 'opacity-50' :
          onToggle  ? 'group-focus-visible:ring-2 group-focus-visible:ring-brand-medium' :
                      'opacity-50'
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
            on ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  )
}
