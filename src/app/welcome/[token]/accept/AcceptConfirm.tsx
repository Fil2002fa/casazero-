'use client'

import { useState, useTransition } from 'react'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import { confirmInvite, signOutForInvite } from './actions'

export function AcceptConfirm({
  token,
  email,
  role,
  residenceName,
  unitLabel,
}: {
  token: string
  email: string | null
  role: string
  residenceName: string | null
  unitLabel: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const isAdminInvite = role === 'admin' || role === 'super_admin'
  const place = [residenceName, unitLabel ? formatUnitLabel(unitLabel) : null].filter(Boolean).join(' · ') || 'questa residenza'

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      try {
        const res = await confirmInvite(token)
        if (res?.error) setError(res.error)
      } catch {
        setError('Errore imprevisto, ricarica la pagina')
      }
    })
  }

  return (
    <div className="min-h-svh bg-[#F4F3EF] flex items-center justify-center p-6">
      <div className="max-w-sm w-full space-y-5">
        <div className="bg-white rounded-xl border border-[#E4E6E2] p-5 space-y-4">
          <h1 className="text-lg font-medium text-[#20302A]">
            {isAdminInvite ? 'Conferma la nomina' : 'Conferma il collegamento'}
          </h1>
          <p className="text-sm text-[#20302A]/70 leading-relaxed">
            {isAdminInvite
              ? `Stai per diventare amministratore di ${place}.`
              : `Stai per collegare questo account a ${place}.`}
          </p>
          <div className="rounded-lg bg-[#F4F3EF] px-3 py-2.5">
            <p className="text-xs text-[#20302A]/50">Account in uso</p>
            <p className="text-sm font-medium text-[#20302A] break-all">{email ?? 'Account senza indirizzo email'}</p>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-[#A32D2D] text-center">{error}</p>
        )}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending}
          className="block w-full px-6 py-4 rounded-xl font-medium text-white text-sm disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#04342C]"
          style={{ backgroundColor: '#04342C' }}
        >
          {pending ? 'Attivazione in corso…' : 'Conferma'}
        </button>

        <form action={signOutForInvite.bind(null, token)} className="text-center">
          <button
            type="submit"
            disabled={pending}
            className="text-xs text-[#20302A]/60 underline underline-offset-2 cursor-pointer disabled:cursor-not-allowed"
          >
            Non sei tu? Esci e accedi con un altro account
          </button>
        </form>
      </div>
    </div>
  )
}
