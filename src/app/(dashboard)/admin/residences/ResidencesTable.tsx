'use client'

import { useRouter } from 'next/navigation'
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table'

export type ResidenceRow = {
  id: string
  name: string
  address: string | null
  unitCount: number
  adminName: string | null
}

export function ResidencesTable({ rows }: { rows: ResidenceRow[] }) {
  const router = useRouter()

  return (
    <Table>
      <TableHeader>
        <TableHead>Nome</TableHead>
        <TableHead>Indirizzo</TableHead>
        <TableHead className="text-right">Unità</TableHead>
        <TableHead>Amministratore</TableHead>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id} clickable onClick={() => router.push(`/admin/residences/${r.id}`)}>
            <TableCell emphasis>{r.name}</TableCell>
            <TableCell>{r.address ?? '—'}</TableCell>
            <TableCell numeric>{r.unitCount}</TableCell>
            <TableCell>
              {r.adminName ?? <span className="text-neutral-500">Non assegnato</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
