'use client'

import { useRouter } from 'next/navigation'
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table'
import { PILL_BASE } from '@/components/ui/Badge'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import { cn } from '@/lib/cn'

export type UnitSummaryRow = {
  id: string
  label: string
  floor: number | null
  residentName: string | null
  active: boolean
}

export function UnitsSummaryTable({ residenceId, rows }: { residenceId: string; rows: UnitSummaryRow[] }) {
  const router = useRouter()

  return (
    <Table>
      <TableHeader>
        <TableHead>Unità</TableHead>
        <TableHead>Residente</TableHead>
      </TableHeader>
      <TableBody>
        {rows.map(r => (
          <TableRow
            key={r.id}
            clickable
            onClick={() => router.push(`/admin/residences/${residenceId}/units`)}
          >
            <TableCell emphasis>{formatUnitLabel(r.label, r.floor)}</TableCell>
            <TableCell>
              {r.active ? (
                <span className="inline-flex items-center gap-2">
                  <span className={cn(PILL_BASE, 'bg-brand-dark/8 text-brand-dark')}>Attivo</span>
                  {r.residentName && <span className="text-neutral-900">{r.residentName}</span>}
                </span>
              ) : (
                <span className={cn(PILL_BASE, 'bg-neutral-600/7 text-neutral-600')}>In attesa</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
