'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { Edit2, Check, X, Copy, Trash2, UserPlus, Users, Bell, LogOut, Smartphone, Mail, Lock } from 'lucide-react'
import { updateProfile, createFamilyInvite, revokeFamilyInvite, signOut, updateNotificationPrefs } from './actions'
import type { NotificationPrefs } from '@/types/database'

type InviteRow = { id: string; token: string; expires_at: string; qrCode: string }
type MemberRow = { profile_id: string; full_name: string | null }

// ── Configurazione eventi/canali ────────────────────────────────────────────
type PrefRow = {
  label: string
  pushKey: keyof NotificationPrefs
  emailKey: keyof NotificationPrefs | null
  emailLocked: boolean // email sempre attiva, non disattivabile
}

const PREF_ROWS: PrefRow[] = [
  { label: 'Manutenzioni scadute',    pushKey: 'push_maintenance_due', emailKey: null,              emailLocked: true  },
  { label: 'Promemoria periodici',    pushKey: 'push_reminders',       emailKey: 'email_reminders', emailLocked: false },
  { label: 'Cambio stato lavori (N3)',pushKey: 'push_n3_status',       emailKey: 'email_n3_status', emailLocked: false },
  { label: 'Nuovi documenti',         pushKey: 'push_new_document',    emailKey: null,              emailLocked: false },
  { label: 'Nuovi commenti',          pushKey: 'push_new_comment',     emailKey: null,              emailLocked: false },
]

export function ProfiloClient({
  email,
  fullName,
  phone,
  role,
  unit,
  members,
  invites,
  appUrl,
  notifPrefs,
}: {
  email: string
  fullName: string | null
  phone: string | null
  role: string
  unit: { id: string; label: string; residence_id: string; residence_name: string; address: string | null } | null
  members: MemberRow[]
  invites: InviteRow[]
  appUrl: string
  notifPrefs: NotificationPrefs
}) {
  const [pending, startTransition] = useTransition()
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [nameVal, setNameVal] = useState(fullName ?? '')
  const [phoneVal, setPhoneVal] = useState(phone ?? '')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [prefs, setPrefs] = useState<NotificationPrefs>(notifPrefs)
  const [prefError, setPrefError] = useState<string | null>(null)

  function handleSaveProfile() {
    setProfileError(null)
    const fd = new FormData()
    fd.set('full_name', nameVal)
    fd.set('phone', phoneVal)
    startTransition(async () => {
      const res = await updateProfile(fd)
      if (res.error) setProfileError(res.error)
      else setEditing(false)
    })
  }

  function handleGenerateInvite() {
    if (!unit) return
    setInviteError(null)
    startTransition(async () => {
      const res = await createFamilyInvite(unit.id, unit.residence_id)
      if (res.error) setInviteError(res.error)
      else window.location.reload()
    })
  }

  function handleRevokeInvite(inviteId: string) {
    if (!unit) return
    setInviteError(null)
    startTransition(async () => {
      const res = await revokeFamilyInvite(inviteId, unit.id)
      if (res.error) setInviteError(res.error)
      else window.location.reload()
    })
  }

  function copyUrl(token: string, inviteId: string) {
    navigator.clipboard.writeText(`${appUrl}/welcome/${token}`)
    setCopiedId(inviteId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function handleTogglePref(key: keyof NotificationPrefs) {
    if (savingKey !== null) return  // evita salvataggi concorrenti
    const prev = prefs
    const newPrefs = { ...prev, [key]: !prev[key] }
    setPrefs(newPrefs)
    setPrefError(null)
    setSavingKey(key)
    const res = await updateNotificationPrefs(newPrefs)
    setSavingKey(null)
    if (res.error) {
      setPrefs(prev)
      setPrefError(res.error)
    }
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="bg-surface border-b border-border px-4 py-4 sticky top-0 z-10">
        <h1 className="text-base font-medium text-text-primary">Profilo</h1>
      </div>

      <div className="p-4 space-y-4">

        {/* Dati personali */}
        <section className="bg-surface rounded-xl border border-border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-primary">Dati personali</h2>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 text-xs text-brand-medium font-medium"
              >
                <Edit2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                Modifica
              </button>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-text-secondary mb-1">Nome</p>
              {editing ? (
                <input
                  type="text"
                  value={nameVal}
                  onChange={e => setNameVal(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                  placeholder="Il tuo nome"
                />
              ) : (
                <p className="text-sm font-medium text-text-primary">{fullName || '—'}</p>
              )}
            </div>

            <div>
              <p className="text-xs text-text-secondary mb-1">Email</p>
              <p className="text-sm text-text-primary">{email}</p>
            </div>

            <div>
              <p className="text-xs text-text-secondary mb-1">Telefono</p>
              {editing ? (
                <input
                  type="tel"
                  value={phoneVal}
                  onChange={e => setPhoneVal(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium"
                  placeholder="+39 000 000 0000"
                />
              ) : (
                <p className="text-sm text-text-primary">{phone || '—'}</p>
              )}
            </div>
          </div>

          {profileError && (
            <p className="text-xs text-semantic-red">{profileError}</p>
          )}

          {editing && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSaveProfile}
                disabled={pending}
                className="flex items-center gap-1.5 px-4 py-2 bg-brand-dark text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                <Check className="w-4 h-4" strokeWidth={2} />
                Salva
              </button>
              <button
                onClick={() => { setEditing(false); setNameVal(fullName ?? ''); setPhoneVal(phone ?? '') }}
                className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-lg text-sm text-text-secondary"
              >
                <X className="w-4 h-4" strokeWidth={1.8} />
                Annulla
              </button>
            </div>
          )}
        </section>

        {/* Residenza e unità */}
        {unit && (
          <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
            <h2 className="text-sm font-medium text-text-primary">Residenza</h2>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-text-secondary">Residenza</p>
                <p className="text-sm font-medium text-text-primary">{unit.residence_name}</p>
                {unit.address && <p className="text-xs text-text-secondary mt-0.5">{unit.address}</p>}
              </div>
              <div>
                <p className="text-xs text-text-secondary">Unità</p>
                <p className="text-sm font-medium text-text-primary">{unit.label}</p>
              </div>
            </div>
          </section>
        )}

        {/* Accessi familiari */}
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
                      <div className="w-6 h-6 rounded-full bg-brand-light flex items-center justify-center">
                        <span className="text-xs font-medium text-brand-dark">
                          {(m.full_name ?? '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-text-primary">{m.full_name ?? 'Utente'}</p>
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
                            <p className="text-xs font-medium text-text-primary">Invito familiare</p>
                            <p className="text-xs text-text-secondary">Scade il {expiry}</p>
                          </div>
                          <button
                            onClick={() => handleRevokeInvite(inv.id)}
                            disabled={pending}
                            className="text-semantic-red p-1 rounded disabled:opacity-50"
                            aria-label="Revoca invito"
                          >
                            <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                          </button>
                        </div>
                        <div className="flex justify-center">
                          <Image src={inv.qrCode} alt="QR invito" width={140} height={140} />
                        </div>
                        <button
                          onClick={() => copyUrl(inv.token, inv.id)}
                          className="w-full flex items-center justify-center gap-1.5 py-1.5 border border-border rounded-lg text-xs text-text-secondary"
                        >
                          {copiedId === inv.id ? (
                            <><Check className="w-3.5 h-3.5 text-green-600" strokeWidth={2} /> Copiato</>
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

            {inviteError && <p className="text-xs text-semantic-red">{inviteError}</p>}

            <button
              onClick={handleGenerateInvite}
              disabled={pending || invites.length >= 5}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-brand-medium rounded-lg text-sm font-medium text-brand-dark disabled:opacity-40"
            >
              <UserPlus className="w-4 h-4" strokeWidth={1.8} />
              {invites.length >= 5 ? 'Limite inviti raggiunto' : 'Genera invito familiare'}
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
            <h2 className="text-sm font-medium text-text-primary">Notifiche</h2>
          </div>

          {/* Intestazioni colonne */}
          <div className="flex items-center gap-2 pb-1">
            <div className="flex-1" />
            <div className="w-12 flex items-center justify-center gap-1">
              <Smartphone className="w-3.5 h-3.5 text-text-secondary" strokeWidth={1.6} />
              <span className="text-[10px] text-text-secondary">Push</span>
            </div>
            <div className="w-16 flex items-center justify-center gap-1">
              <Mail className="w-3.5 h-3.5 text-text-secondary" strokeWidth={1.6} />
              <span className="text-[10px] text-text-secondary">Email</span>
            </div>
          </div>

          {/* Righe eventi */}
          <div className="divide-y divide-border">
            {PREF_ROWS.map(row => (
              <div key={row.pushKey} className="flex items-center gap-2 py-2.5 first:pt-0">
                <p className="flex-1 text-sm text-text-primary leading-tight">{row.label}</p>

                {/* Push */}
                <div className="w-12 flex justify-center">
                  <Toggle
                    on={prefs[row.pushKey]}
                    disabled={savingKey === row.pushKey}
                    onToggle={() => handleTogglePref(row.pushKey)}
                  />
                </div>

                {/* Email */}
                <div className="w-16 flex justify-center">
                  {row.emailLocked ? (
                    <div className="flex items-center gap-1.5" title="Sempre attiva">
                      <Toggle on locked />
                      <Lock className="w-3.5 h-3.5 text-text-secondary/40" strokeWidth={1.6} />
                    </div>
                  ) : row.emailKey ? (
                    <Toggle
                      on={prefs[row.emailKey]}
                      disabled={savingKey === row.emailKey}
                      onToggle={() => handleTogglePref(row.emailKey!)}
                    />
                  ) : (
                    <span className="text-xs text-border select-none">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {prefError && <p className="text-xs text-semantic-red">{prefError}</p>}

          <p className="text-xs text-text-secondary pt-1">
            Le notifiche push richiedono l&apos;installazione dell&apos;app sul dispositivo.
          </p>
        </section>

        {/* Logout */}
        <form action={signOut}>
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-semantic-red text-semantic-red text-sm font-medium"
          >
            <LogOut className="w-4 h-4" strokeWidth={1.8} />
            Esci dall&apos;account
          </button>
        </form>

        <p className="text-xs text-text-secondary text-center pb-2">
          Ruolo: <span className="font-medium">{role}</span>
        </p>
      </div>
    </div>
  )
}

// ── Toggle switch ────────────────────────────────────────────────────────────
// locked = sempre ON, nessuna interazione, nessun velo (usato per email invariante)
// disabled = salvataggio in corso su questa chiave specifica
function Toggle({
  on,
  onToggle,
  disabled,
  locked,
}: {
  on: boolean
  onToggle?: () => void
  disabled?: boolean
  locked?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-disabled={locked || disabled}
      disabled={disabled}
      onClick={locked ? undefined : onToggle}
      className={`relative inline-flex w-9 h-5 rounded-full transition-colors flex-shrink-0 focus-visible:outline-none ${
        on ? 'bg-brand-dark' : 'bg-border'
      } ${
        locked    ? 'cursor-default' :
        disabled  ? 'opacity-50 cursor-not-allowed' :
        onToggle  ? 'cursor-pointer focus-visible:ring-2 focus-visible:ring-brand-medium' :
                    'cursor-not-allowed opacity-50'
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
          on ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
