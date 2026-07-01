'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import IdentityTab from './IdentityTab'
import NotificationsTab from './NotificationsTab'
import AccountTab from './AccountTab'
import SecurityTab from './SecurityTab'
import type { AdminNotificationPrefs } from '@/types/database'

interface Props {
  builderName: string
  builderEmail: string
  builderPhone: string
  accountName: string
  accountEmail: string
  notifPrefs: AdminNotificationPrefs
}

const TABS = [
  { id: 'identity',      label: 'Identità costruttore' },
  { id: 'notifications', label: 'Notifiche ricevute'   },
  { id: 'account',       label: 'Profilo account'      },
  { id: 'security',      label: 'Sicurezza'            },
] as const

type TabId = (typeof TABS)[number]['id']

export default function SettingsShell(props: Props) {
  const [active, setActive] = useState<TabId>('identity')

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="bg-surface border-b border-border px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/admin/residences" className="text-text-secondary p-1 -ml-1 rounded-lg">
          <ChevronLeft className="w-5 h-5" strokeWidth={1.6} />
        </Link>
        <h1 className="text-base font-medium text-text-primary">Impostazioni</h1>
      </div>

      {/* Tab bar */}
      <div className="bg-surface border-b border-border px-4">
        <div className="flex gap-1 overflow-x-auto -mb-px">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`whitespace-nowrap px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                active === tab.id
                  ? 'border-brand-dark text-brand-dark'
                  : 'border-transparent text-text-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {active === 'identity' && (
          <IdentityTab
            initialName={props.builderName}
            initialEmail={props.builderEmail}
            initialPhone={props.builderPhone}
          />
        )}
        {active === 'notifications' && <NotificationsTab initialPrefs={props.notifPrefs} />}
        {active === 'account' && <AccountTab initialName={props.accountName} email={props.accountEmail} />}
        {active === 'security' && <SecurityTab />}
      </div>
    </div>
  )
}
