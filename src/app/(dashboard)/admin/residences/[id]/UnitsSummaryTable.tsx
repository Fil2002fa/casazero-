'use client'

import { useRouter } from 'next/navigation'
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import type { UnitLifecycle } from '@/lib/unit-utils'
import { UnitLifecycleBadge } from '@/components/UnitLifecycleBadge'

export type UnitSummaryRow = {
  id: string
  label: string
  floor: number | null
  lifecycle: UnitLifecycle
}

// readOnly: vista amministratore (residenza sola lettura, porta Unità
// esclusa) — niente riga cliccabile verso una pagina che non può aprire.
export function UnitsSummaryTable({ residenceId, rows, readOnly = false }: { residenceId: string; rows: UnitSummaryRow[]; readOnly?: boolean }) {
  const router = useRouter()

  // Card sotto lg (mai tabella compressa): a 320px etichetta unità e pill
  // non stanno su una riga di tabella. Il nome del residente vive nella
  // pagina Unità: qui basta l'etichetta di stato.
  return (
    <Table stack="lg">
      <TableHeader>
        <TableHead>Unità</TableHead>
        <TableHead>Stato</TableHead>
      </TableHeader>
      <TableBody>
        {rows.map(r => (
          <TableRow
            key={r.id}
            clickable={!readOnly}
            onClick={readOnly ? undefined : () => router.push(`/admin/residences/${residenceId}/units`)}
          >
            <TableCell emphasis>{formatUnitLabel(r.label, r.floor)}</TableCell>
            <TableCell label="Stato">
              <UnitLifecycleBadge lifecycle={r.lifecycle} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
