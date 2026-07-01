'use client'

import { useState } from 'react'
import { Bell, Smartphone, Mail } from 'lucide-react'
import type { AdminNotificationPrefs } from '@/types/database'
import { updateAdminNotificationPrefs } from './actions'

// Eventi rilevanti per il super_admin (costruttore) — diversi da quelli del residente.
type PrefRow = {
  label: string
  pushKey: keyof AdminNotificationPrefs | null
  emailKey: keyof AdminNotificationPrefs | null
}

const PREF_ROWS: PrefRow[] = [
  { label: 'Manutenzione a carico amministratore completata', pushKey: 'push_n3_completed',      emailKey: 'email_n3_completed'     },
  { label: 'Nuovo residente registrato via QR',               pushKey: 'push_new_resident',       emailKey: 'email_new_resident'     },
  { label: 'Manutenzione a carico residente scaduta da oltre 30 giorni', pushKey: null,           emailKey: 'email_n2_overdue_30'    },
  { label: 'Report annuale generato',                         pushKey: 'push_report_generated',   emailKey: 'email_report_generated' },
]

export default function NotificationsTab({ initialPrefs }: { initialPrefs: AdminNotificationPrefs }) {
  const [prefs, setPrefs] = useState<AdminNotificationPrefs>(initialPrefs)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleToggle(key: keyof AdminNotificationPrefs) {
    if (savingKey !== null) return // evita salvataggi concorrenti
    const prev = prefs
    const next = { ...prev, [key]: !prev[key] }
    setPrefs(next)
    setError(null)
    setSavingKey(key)
    const res = await updateAdminNotificationPrefs(next)
    setSavingKey(null)
    if (res.error) {
      setPrefs(prev)
      setError(res.error)
    }
  }

  return (
    <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4 text-brand-medium" strokeWidth={1.8} />
        <h2 className="text-sm font-medium text-text-primary">Notifiche ricevute</h2>
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
          <div key={row.label} className="flex items-center gap-2 py-2.5 first:pt-0">
            <p className="flex-1 text-sm text-text-primary leading-tight">{row.label}</p>

            {/* Push */}
            <div className="w-12 flex justify-center">
              {row.pushKey ? (
                <Toggle
                  on={prefs[row.pushKey]}
                  disabled={savingKey === row.pushKey}
                  onToggle={() => handleToggle(row.pushKey!)}
                />
              ) : (
                <span className="text-xs text-border select-none">—</span>
              )}
            </div>

            {/* Email */}
            <div className="w-16 flex justify-center">
              {row.emailKey ? (
                <Toggle
                  on={prefs[row.emailKey]}
                  disabled={savingKey === row.emailKey}
                  onToggle={() => handleToggle(row.emailKey!)}
                />
              ) : (
                <span className="text-xs text-border select-none">—</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-semantic-red">{error}</p>}

      <p className="text-xs text-text-secondary pt-1">
        Le notifiche push richiedono l&apos;installazione dell&apos;app sul dispositivo.
      </p>
    </section>
  )
}

// ── Toggle switch (stesso pattern del profilo residente) ─────────────────────
function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onToggle}
      className={`relative inline-flex w-9 h-5 rounded-full transition-colors flex-shrink-0 focus-visible:outline-none ${
        on ? 'bg-brand-dark' : 'bg-border'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer focus-visible:ring-2 focus-visible:ring-brand-medium'}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
          on ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
