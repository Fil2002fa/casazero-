'use client'

import { useRouter } from 'next/navigation'
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table'

export type ResidenceRow = {
  id: string
  name: string
  address: string | null
  unitCount: number
  // Solo per la vista costruttore: la vista amministratore non mostra la
  // colonna (sarebbe il suo stesso nome su ogni riga) e non interroga
  // affatto admin_assignments.
  adminName?: string | null
}

export function ResidencesTable({ rows, showAdminColumn }: {
  rows: ResidenceRow[]
  // Obbligatoria, senza default: un chiamante che la dimentica fallisce in
  // build invece di far sparire in silenzio la colonna al costruttore.
  showAdminColumn: boolean
}) {
  const router = useRouter()

  return (
    <Table>
      <TableHeader>
        <TableHead>Nome</TableHead>
        <TableHead>Indirizzo</TableHead>
        <TableHead className="text-right">Unità</TableHead>
        {showAdminColumn && <TableHead>Amministratore</TableHead>}
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id} clickable onClick={() => router.push(`/admin/residences/${r.id}`)}>
            <TableCell emphasis>{r.name}</TableCell>
            <TableCell>{r.address ?? '—'}</TableCell>
            <TableCell numeric>{r.unitCount}</TableCell>
            {showAdminColumn && (
              <TableCell>
                {r.adminName ?? <span className="text-neutral-500">Non assegnato</span>}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
