import { NextRequest, NextResponse } from 'next/server'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import writeXlsxFile from 'write-excel-file/node'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { authorizeResidenceActor } from '@/lib/document-access'
import { loadResidenceDocumentRows } from '@/lib/document-rows.server'
import { DOCUMENT_EXPORT_HEADERS, documentExportRows } from '@/lib/document-export'
import { deadlineExportHeaders, deadlineExportRows, toDeadlineItem, type RawDeadlineItem } from '@/lib/deadline-export'
import { todayISO } from '@/lib/maintenance-status'
import { buildSheet, fileSlug } from '@/lib/xlsx-helpers'

// Runtime Node.js: write-excel-file/node produce un Buffer con node:stream.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Larghezze in caratteri, nell'ordine delle intestazioni di ogni scheda.
const DOCUMENT_WIDTHS = [40, 34, 22, 14, 15, 40, 30, 16, 26, 20, 11, 32, 34, 22, 16, 18, 40]
const DEADLINE_WIDTHS = [18, 44, 22, 16, 18, 16, 16, 28]
const SUPPLIER_WIDTH = 28

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

  // Il fornitore è un dato interno del costruttore: solo il super_admin lo
  // vede (decisione per ruolo, non lasciata alla sola RLS, che darebbe una
  // colonna vuota indistinguibile da "nessun fornitore").
  const includeSupplier = auth.role === 'super_admin'

  // Dati letti con il client di SESSIONE, dagli stessi loader delle pagine:
  // stesse righe, stesso perimetro RLS. Il service role serve solo al gate.
  const { docs, units, error } = await loadResidenceDocumentRows(supabase, residenceId)
  if (error) return NextResponse.json({ error: 'Errore tecnico, riprova' }, { status: 500 })

  // Voci del piano: lette a pagine (il tetto di righe per richiesta tronca in
  // silenzio), con ordinamento stabile per id.
  const itemsRes = await fetchAllRows<RawDeadlineItem>((from, to) =>
    supabase
      .from('maintenance_items')
      .select(`
        id, unit_id, status, next_due_date, completion_mode, obligation_type, frequency_months, activation_status,
        maintenance_templates(title, category, frequency_months, completion_mode, obligation_type, is_active),
        units(label)${includeSupplier ? ', suppliers(name)' : ''}
      `)
      .eq('residence_id', residenceId)
      .order('id')
      .range(from, to) as unknown as PromiseLike<{ data: RawDeadlineItem[] | null; error: { message: string; code?: string } | null }>
  )
  if (itemsRes.error) {
    console.error('[documenti-xlsx] lettura voci fallita:', itemsRes.error.message)
    return NextResponse.json({ error: 'Errore tecnico, riprova' }, { status: 500 })
  }

  const today = todayISO()
  const deadlineHeaders = deadlineExportHeaders(includeSupplier)
  const deadlineWidths = includeSupplier ? [...DEADLINE_WIDTHS, SUPPLIER_WIDTH] : DEADLINE_WIDTHS

  const sheets = [
    buildSheet(
      'Scadenze',
      deadlineHeaders,
      deadlineExportRows(itemsRes.data.map(toDeadlineItem), { today, includeSupplier }),
      deadlineWidths,
    ),
    buildSheet('Documenti', DOCUMENT_EXPORT_HEADERS, documentExportRows(docs, units), DOCUMENT_WIDTHS),
  ]

  const xlsx = await writeXlsxFile(sheets).toBuffer()

  const filename = `dati-${fileSlug(auth.residence.name)}-${today}.xlsx`

  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
