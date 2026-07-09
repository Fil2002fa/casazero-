'use client'

import { useRouter } from 'next/navigation'
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table'
import { StatusBadge, PromemoriaBadge, TypeBadge } from '@/components/ui/Badge'
import type { CompletionMode, MaintenanceStatus, ObligationType } from '@/types/database'

export type PlanRow = {
  id: string
  title: string
  mode: CompletionMode | null
  obligationType: ObligationType | null
  status: MaintenanceStatus
  frequencyMonths: number | null
  nextDueDate: string | null
}

const MODE_LABELS: Record<CompletionMode, string> = {
  residente: 'Residente',
  amministratore: 'Amministratore',
  promemoria: 'Promemoria',
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function MaintenancePlanTable({ residenceId, rows }: { residenceId: string; rows: PlanRow[] }) {
  const router = useRouter()

  return (
    <Table>
      <TableHeader>
        <TableHead>Voce</TableHead>
        <TableHead>Modalità</TableHead>
        <TableHead>Tipo</TableHead>
        <TableHead>Stato</TableHead>
        <TableHead className="text-right">Prossima scadenza</TableHead>
      </TableHeader>
      <TableBody>
        {rows.map(r => {
          const isReminder = r.mode === 'promemoria'
          return (
            <TableRow
              key={r.id}
              clickable
              onClick={() => router.push(`/admin/residences/${residenceId}/manutenzioni`)}
            >
              <TableCell emphasis>{r.title}</TableCell>
              <TableCell>{r.mode ? MODE_LABELS[r.mode] : '—'}</TableCell>
              <TableCell>{r.obligationType ? <TypeBadge obligationType={r.obligationType} /> : '—'}</TableCell>
              <TableCell>
                {isReminder
                  ? <PromemoriaBadge frequencyMonths={r.frequencyMonths} />
                  : <StatusBadge status={r.status} />}
              </TableCell>
              <TableCell numeric>
                {!isReminder && r.nextDueDate ? formatDate(r.nextDueDate) : '—'}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
