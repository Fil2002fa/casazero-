'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import IdentityTab from './IdentityTab'
import NotificationsTab from './NotificationsTab'
import AccountTab from './AccountTab'
import type { AdminNotificationPrefs } from '@/types/database'

interface Props {
  builderName: string
  builderLogoUrl: string | null
  accountName: string
  accountEmail: string
  notifPrefs: AdminNotificationPrefs
}

const TABS = [
  { id: 'identity',      label: 'Identità costruttore' },
  { id: 'notifications', label: 'Notifiche ricevute'   },
  { id: 'account',       label: 'Profilo account'      },
] as const

type TabId = (typeof TABS)[number]['id']

export default function SettingsShell(props: Props) {
  const [active, setActive] = useState<TabId>('identity')

  return (
    <>
      <PageHeader title="Impostazioni" className="mb-6" />

      {/* Tab bar */}
      <div className="border-b border-border">
        <div className="flex gap-1 overflow-x-auto -mb-px">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`whitespace-nowrap px-3 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                active === tab.id
                  ? 'border-brand-dark text-brand-dark'
                  : 'border-transparent text-neutral-500'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {active === 'identity' && (
          <IdentityTab initialName={props.builderName} initialLogoUrl={props.builderLogoUrl} />
        )}
        {active === 'notifications' && <NotificationsTab initialPrefs={props.notifPrefs} />}
        {active === 'account' && <AccountTab initialName={props.accountName} email={props.accountEmail} />}
      </div>
    </>
  )
}
