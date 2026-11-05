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
import {
  SUPPLIER_EXPORT_HEADERS,
  mergeSupplierSources,
  supplierExportRows,
  type RawSupplierInstallation,
} from '@/lib/supplier-export'
import { toUnitExportUnit, unitExportHeaders, unitExportRows, type RawUnitExportUnit } from '@/lib/unit-export'
import { buildSheet, fileSlug } from '@/lib/xlsx-helpers'

// Runtime Node.js: write-excel-file/node produce un Buffer con node:stream.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Larghezze in caratteri, nell'ordine delle intestazioni di ogni scheda.
const UNIT_WIDTHS = [16, 8, 16, 28, 12, 12, 10, 10, 16, 22, 40, 22, 40, 22, 40]
const SUPPLIER_SHEET_WIDTHS = [32, 16, 18, 30, 34, 24, 50]
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

  // Anagrafica e membri delle unità (stessa select della pagina residenza).
  const unitsRes = await fetchAllRows<RawUnitExportUnit>((from, to) =>
    supabase
      .from('units')
      .select('id, label, floor, delivery_date, unit_members!left(ended_at, is_primary, profiles(full_name))')
      .eq('residence_id', residenceId)
      .order('id')
      .range(from, to) as unknown as PromiseLike<{ data: RawUnitExportUnit[] | null; error: { message: string; code?: string } | null }>
  )
  if (unitsRes.error) {
    console.error('[documenti-xlsx] lettura unità fallita:', unitsRes.error.message)
    return NextResponse.json({ error: 'Errore tecnico, riprova' }, { status: 500 })
  }

  // Fornitori (solo super_admin): due fonti unite, come la pagina Fornitori.
  // Per l'admin non si legge nulla: la scheda non esiste, non è vuota.
  let supplierSheet: ReturnType<typeof buildSheet> | null = null
  if (includeSupplier) {
    const [byResidence, installed] = await Promise.all([
      supabase
        .from('suppliers')
        .select('id, name, phone, email, vat_number')
        .eq('residence_id', residenceId),
      supabase
        .from('supplier_installations')
        .select('sistema, source, source_document_id, suppliers(id, name, phone, email, vat_number)')
        .eq('residence_id', residenceId),
    ])
    const supplierError = byResidence.error ?? installed.error
    if (supplierError) {
      console.error('[documenti-xlsx] lettura fornitori fallita:', supplierError.message)
      return NextResponse.json({ error: 'Errore tecnico, riprova' }, { status: 500 })
    }
    const merged = mergeSupplierSources(byResidence.data ?? [], (installed.data ?? []) as unknown as RawSupplierInstallation[])
    const documentTitles = new Map(docs.map(d => [d.id, d.title]))
    supplierSheet = buildSheet(
      'Fornitori',
      SUPPLIER_EXPORT_HEADERS,
      supplierExportRows(merged.suppliers, merged.installations, documentTitles),
      SUPPLIER_SHEET_WIDTHS,
    )
  }

  const today = todayISO()
  const deadlineItems = itemsRes.data.map(toDeadlineItem)
  const deadlineHeaders = deadlineExportHeaders(includeSupplier)
  const deadlineWidths = includeSupplier ? [...DEADLINE_WIDTHS, SUPPLIER_WIDTH] : DEADLINE_WIDTHS

  const sheets = [
    buildSheet(
      'Riepilogo unità',
      unitExportHeaders(),
      unitExportRows(unitsRes.data.map(toUnitExportUnit), deadlineItems, docs, { today }),
      UNIT_WIDTHS,
    ),
    buildSheet(
      'Scadenze',
      deadlineHeaders,
      deadlineExportRows(deadlineItems, { today, includeSupplier }),
      deadlineWidths,
    ),
    ...(supplierSheet ? [supplierSheet] : []),
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
