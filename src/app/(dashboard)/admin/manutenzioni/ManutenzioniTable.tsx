'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type MouseEvent } from 'react'
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table'
import { StatusBadge, TypeBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { MaintenanceStatus, ObligationType } from '@/types/database'
import { takeChargeN3 } from './actions'

export type ManutenzioneRow = {
  id: string
  title: string
  residenceName: string
  obligationType: ObligationType | null
  status: MaintenanceStatus
  nextDueDate: string | null
  canTakeCharge: boolean
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function ManutenzioniTable({ rows }: { rows: ManutenzioneRow[] }) {
  const router = useRouter()

  return (
    <Table>
      <TableHeader>
        <TableHead>Voce</TableHead>
        <TableHead>Residenza</TableHead>
        <TableHead>Tipo</TableHead>
        <TableHead>Stato</TableHead>
        <TableHead className="text-right">Prossima scadenza</TableHead>
        <TableHead className="text-right">Azione</TableHead>
      </TableHeader>
      <TableBody>
        {rows.map(r => (
          <TableRow key={r.id} clickable onClick={() => router.push(`/admin/manutenzioni/${r.id}`)}>
            <TableCell emphasis>{r.title}</TableCell>
            <TableCell>{r.residenceName}</TableCell>
            <TableCell>{r.obligationType ? <TypeBadge obligationType={r.obligationType} /> : '—'}</TableCell>
            <TableCell><StatusBadge status={r.status} /></TableCell>
            <TableCell numeric>{r.nextDueDate ? formatDate(r.nextDueDate) : '—'}</TableCell>
            <TableCell className="text-right">
              {r.canTakeCharge && <TakeChargeAction itemId={r.id} />}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/**
 * Azione di riga: stessa mutazione (takeChargeN3) usata da N3AdminActions nel
 * dettaglio, ma bottone di sistema (secondary/table) invece del pill full-width
 * di N3AdminActions, che non si adatta a una cella di tabella. Non è una
 * duplicazione della logica di completamento: qui si copre solo il primo step
 * (presa in carico), l'unico rappresentabile come singolo bottone; il secondo
 * step (form "Segna completata") resta esclusivo del dettaglio via N3AdminActions.
 */
function TakeChargeAction({ itemId }: { itemId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    setError(null)
    startTransition(async () => {
      const result = await takeChargeN3(itemId)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div
      className="inline-flex flex-col items-end gap-1"
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      <Button variant="secondary" size="table" onClick={handleClick} disabled={isPending}>
        {isPending ? 'Caricamento…' : 'Prendi in carico'}
      </Button>
      {error && <p className="text-xs text-status-overdue">{error}</p>}
    </div>
  )
}
