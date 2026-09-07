'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type MouseEvent } from 'react'
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table'
import { StatusBadge, TypeBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { MaintenanceStatus, ObligationType } from '@/types/database'
import type { ActivityBucket } from '@/lib/maintenance-status'
import { takeChargeN3 } from './actions'

/**
 * Riga della lista Attività. L'unico stato è il bucket di urgenza, calcolato
 * dal server con activityBucket: nessun campo `status` libero, quindi una
 * promemoria "scaduta" è irrappresentabile qui per tipo, non per filtro.
 */
export type ActivityRow = {
  id: string
  residenceName: string
  title: string
  obligationType: ObligationType | null
  bucket: ActivityBucket
  /** Testo già formattato dal server ("scaduta il …", "tra 6 giorni · …"); null se senza data. */
  dueLabel: string | null
}

const BUCKET_BADGE: Record<ActivityBucket, MaintenanceStatus> = {
  in_ritardo: 'scaduta',
  in_corso:   'in_corso',
  in_arrivo:  'in_attesa',
}

const BUCKET_DUE_CLASS: Record<ActivityBucket, string> = {
  in_ritardo: 'text-status-overdue',
  in_corso:   'text-status-inprogress',
  in_arrivo:  'text-text-secondary',
}

export function ManutenzioniTable({ rows }: { rows: ActivityRow[] }) {
  const router = useRouter()

  return (
    <Table>
      <TableHeader>
        <TableHead>Residenza</TableHead>
        <TableHead>Voce</TableHead>
        <TableHead>Tipo</TableHead>
        <TableHead>Stato</TableHead>
        <TableHead className="text-right">Scadenza</TableHead>
        <TableHead className="text-right">Azione</TableHead>
      </TableHeader>
      <TableBody>
        {rows.map(r => (
          <TableRow key={r.id} clickable onClick={() => router.push(`/admin/manutenzioni/${r.id}`)}>
            <TableCell emphasis>{r.residenceName}</TableCell>
            <TableCell>{r.title}</TableCell>
            <TableCell>{r.obligationType ? <TypeBadge obligationType={r.obligationType} /> : '—'}</TableCell>
            <TableCell><StatusBadge status={BUCKET_BADGE[r.bucket]} /></TableCell>
            <TableCell numeric className={`text-xs ${BUCKET_DUE_CLASS[r.bucket]}`}>
              {r.dueLabel ?? '—'}
            </TableCell>
            <TableCell className="text-right">
              {r.bucket === 'in_ritardo' && <TakeChargeAction itemId={r.id} />}
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
