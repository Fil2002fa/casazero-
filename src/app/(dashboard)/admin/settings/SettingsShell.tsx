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

      {/* Schede: sotto sm impilate a tutta larghezza, la selezionata a tinta piena come
          la voce attiva della sidebar. In riga non stanno, e lo scorrimento orizzontale
          nascondeva la terza scheda senza segnali. Da sm in su in riga, sottolineate. */}
      <div className="sm:border-b sm:border-border">
        <div className="flex flex-col gap-1 sm:flex-row sm:-mb-px">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`flex items-center h-11 px-3 rounded-lg text-left text-sm font-medium transition-colors cursor-pointer sm:h-auto sm:py-3 sm:rounded-none sm:border-b-2 sm:whitespace-nowrap ${
                active === tab.id
                  ? 'bg-brand-dark text-white sm:bg-transparent sm:border-brand-dark sm:text-brand-dark'
                  : 'text-neutral-500 hover:bg-brand-dark/6 sm:border-transparent sm:hover:bg-transparent'
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
