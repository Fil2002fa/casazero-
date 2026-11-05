/**
 * Helper condivisi dagli export Excel (route api/documenti-xlsx e schede
 * future): celle tipizzate prive di dipendenze dalla libreria xlsx, la
 * conversione nel formato di write-excel-file e il nome file ASCII.
 * Il solo import dalla libreria è `import type`, cancellato a runtime: il
 * modulo si carica anche dagli script scripts/verify-*.mjs.
 *
 * Import relativi tra moduli di lib: vedi document-rows.ts.
 */
import type { Cell, SheetData } from 'write-excel-file/node'
import { normalizeIsoDate } from './document-extraction'

// Una data resta una data (ordinabile e filtrabile in Excel), mai una
// stringa formattata. La partita IVA e il numero di polizza restano testo:
// come numero Excel perderebbero gli zeri iniziali.
export type ExportCell =
  | { type: 'text'; value: string }
  | { type: 'date'; value: string }   // ISO yyyy-mm-dd
  | { type: 'number'; value: number } // conteggi e piano: ordinabili e sommabili in Excel
  | null

export function textCell(value: string | null): ExportCell {
  return value ? { type: 'text', value } : null
}

// Primi 10 caratteri, come formatDateIT: la data in riga può essere il
// created_at (TIMESTAMPTZ) quando il documento non ha altre date.
export function dateCell(value: string | null): ExportCell {
  const iso = value ? normalizeIsoDate(value.slice(0, 10)) : null
  return iso ? { type: 'date', value: iso } : null
}

export function numberCell(value: number | null | undefined): ExportCell {
  return typeof value === 'number' && Number.isFinite(value) ? { type: 'number', value } : null
}

// Cella del modulo puro → cella di write-excel-file. La data è costruita in
// UTC: la libreria converte con getTime(), quindi il giorno resta quello
// scritto, a qualunque fuso del server.
export function toSheetCell(cell: ExportCell): Cell {
  if (cell === null) return null
  if (cell.type === 'date') {
    const [y, m, d] = cell.value.split('-').map(Number)
    return { type: Date, value: new Date(Date.UTC(y, m - 1, d)), format: 'dd/mm/yyyy' }
  }
  if (cell.type === 'number') return { type: Number, value: cell.value }
  return { type: String, value: cell.value }
}

// Una scheda del file: intestazione in grassetto e bloccata, larghezze in
// caratteri nell'ordine delle colonne. `rows` sono celle del modulo puro.
export function buildSheet(name: string, headers: readonly string[], rows: ExportCell[][], widths: number[]) {
  const header: Cell[] = headers.map(value => ({ value, fontWeight: 'bold' }))
  const data: SheetData = [header, ...rows.map(row => row.map(toSheetCell))]
  return { sheet: name, data, stickyRowsCount: 1, columns: widths.map(width => ({ width })) }
}

// Nome file solo ASCII: un carattere accentato nel nome della residenza
// renderebbe invalido l'header Content-Disposition.
export function fileSlug(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'residenza'
}
