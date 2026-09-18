import { NextRequest, NextResponse } from 'next/server'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import writeXlsxFile from 'write-excel-file/node'
import type { Cell, SheetData } from 'write-excel-file/node'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { authorizeResidenceActor } from '@/lib/document-access'
import { loadResidenceDocumentRows } from '@/lib/document-rows.server'
import { DOCUMENT_EXPORT_HEADERS, documentExportRows, type ExportCell } from '@/lib/document-export'

// Runtime Node.js: write-excel-file/node produce un Buffer con node:stream.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Larghezze in caratteri, nell'ordine di DOCUMENT_EXPORT_HEADERS.
const COLUMN_WIDTHS = [40, 34, 22, 14, 15, 40, 30, 16, 26, 20, 11, 32]

// Cella del modulo puro → cella di write-excel-file. La data è costruita in
// UTC: la libreria converte con getTime(), quindi il giorno resta quello
// scritto, a qualunque fuso del server.
function toSheetCell(cell: ExportCell): Cell {
  if (cell === null) return null
  if (cell.type === 'date') {
    const [y, m, d] = cell.value.split('-').map(Number)
    return { type: Date, value: new Date(Date.UTC(y, m - 1, d)), format: 'dd/mm/yyyy' }
  }
  return { type: String, value: cell.value }
}

// Nome file solo ASCII: un carattere accentato nel nome della residenza
// renderebbe invalido l'header Content-Disposition.
function fileSlug(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'residenza'
}

// GET /api/documenti-xlsx?residenceId=UUID — super_admin del builder proprietario, o admin assegnato alla residenza
export async function GET(req: NextRequest) {
  const residenceId = req.nextUrl.searchParams.get('residenceId')
  if (!residenceId) {
    return NextResponse.json({ error: 'Parametro residenceId mancante' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user) {
    // Sessione assente o non valida: esito di dominio. Un guasto del server
    // di autenticazione è tecnico e non va confuso con "non autenticato".
    if (authError && isAuthRetryableFetchError(authError)) {
      console.error('[documenti-xlsx] verifica sessione fallita:', authError.message)
      return NextResponse.json({ error: 'Errore tecnico, riprova' }, { status: 500 })
    }
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  const auth = await authorizeResidenceActor(createServiceClient(), user.id, residenceId, '[documenti-xlsx]')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // Dati letti con il client di SESSIONE, dallo stesso loader della pagina
  // Documenti: stesse righe, stesso perimetro RLS. Il service role serve
  // solo al gate.
  const { docs, units, error } = await loadResidenceDocumentRows(supabase, residenceId)
  if (error) return NextResponse.json({ error: 'Errore tecnico, riprova' }, { status: 500 })

  const header: Cell[] = DOCUMENT_EXPORT_HEADERS.map(value => ({ value, fontWeight: 'bold' }))
  const sheet: SheetData = [header, ...documentExportRows(docs, units).map(row => row.map(toSheetCell))]

  const xlsx = await writeXlsxFile(sheet, {
    sheet: 'Documenti',
    stickyRowsCount: 1,
    columns: COLUMN_WIDTHS.map(width => ({ width })),
  }).toBuffer()

  const filename = `documenti-${fileSlug(auth.residence.name)}.xlsx`

  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
