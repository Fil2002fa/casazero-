import { matrixSummary, summaryPills, type SummaryPillKind } from '@/lib/unit-matrix-summary'
import type { UnitDocumentRow } from '@/lib/unit-documents'

// Testata del quadro (E1b-12): contatori per slot, non cliccabili. Regola e
// testi in unit-matrix-summary.ts (verify:matrixsummary). Riceve le righe
// INTERE di unitDocumentRows, le stesse del quadro: toggle e ricerca del
// quadro non la toccano. Un solo componente per admin e super_admin.
const PILL_STYLES: Record<SummaryPillKind, string> = {
  missing: 'border border-dashed border-border bg-surface text-text-secondary',
  all_complete: 'bg-brand-light text-brand-dark',
  to_verify: 'bg-semantic-amber-bg text-semantic-amber',
}

export function UnitMatrixSummary({ rows }: { rows: readonly UnitDocumentRow[] }) {
  const pills = summaryPills(matrixSummary(rows))
  if (pills.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Riepilogo slot documenti">
      {pills.map(p => (
        <li key={p.kind} className={`rounded-full px-3 py-1 text-xs font-medium ${PILL_STYLES[p.kind]}`}>
          {p.text}
        </li>
      ))}
    </ul>
  )
}
