import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { ReportDocument } from '@/lib/pdf/ReportDocument'
import type { ReportData, CompletionEntry, OverdueEntry } from '@/lib/pdf/ReportDocument'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import {
  isCountable, overdueLive, resolveCompletionMode, todayISO,
  LIVE_STATUS_FIELDS, LIVE_STATUS_TEMPLATE_FIELDS,
  type LiveStatusItem,
} from '@/lib/maintenance-status'

// Forza runtime Node.js — @react-pdf/renderer non è compatibile con Edge
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/report?scope=unit&id=UUID
// GET /api/report?scope=residence&id=UUID
export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get('scope') as 'unit' | 'residence' | null
  const id    = req.nextUrl.searchParams.get('id')

  if (!scope || !id || !['unit', 'residence'].includes(scope)) {
    return NextResponse.json({ error: 'Parametri mancanti o non validi' }, { status: 400 })
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const admin = createServiceClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('role, builder_id')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profilo non trovato' }, { status: 403 })

  // ── Dati residenza / unità ────────────────────────────────────────────────
  type UnitInfo = {
    id: string; label: string; floor: number | null; residence_id: string
    residences: {
      id: string; name: string; address: string | null; energy_class: string | null
      delivery_date: string | null; builder_id: string
      builders: { name: string; primary_color: string; logo_url: string | null } | null
    } | null
  }
  type ResidenceInfo = {
    id: string; name: string; address: string | null; energy_class: string | null
    delivery_date: string | null; builder_id: string
    builders: { name: string; primary_color: string; logo_url: string | null } | null
  }

  let residenceId: string
  let unitId: string | null = null
  let unitLabel: string | null = null
  let residenceName = ''
  let residenceAddress: string | null = null
  let energyClass: string | null = null
  let deliveryDate: string | null = null
  let builderName = 'CasaZero'
  let builderColor = '#04342C'

  if (scope === 'unit') {
    const { data: unit } = await admin
      .from('units')
      .select('id, label, floor, residence_id, residences(id, name, address, energy_class, delivery_date, builder_id, builders(name, primary_color, logo_url))')
      .eq('id', id)
      .single()

    if (!unit) return NextResponse.json({ error: 'Unità non trovata' }, { status: 404 })

    const u = unit as unknown as UnitInfo
    const r = u.residences
    if (!r) return NextResponse.json({ error: 'Dati residenza mancanti' }, { status: 404 })

    unitId = u.id
    unitLabel = u.label
    residenceId = r.id
    residenceName = r.name
    residenceAddress = r.address
    energyClass = r.energy_class
    deliveryDate = r.delivery_date
    builderName = r.builders?.name ?? 'CasaZero'
    builderColor = '#04342C' // Colore brand fisso CasaZero (coerente con whitelabel.ts)

    // Verifica accesso
    const isSuper   = profile.role === 'super_admin' && profile.builder_id === r.builder_id
    const isClient  = profile.role === 'client'

    if (!isSuper && profile.role !== 'admin') {
      if (!isClient) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
      // Client: deve essere membro dell'unità
      const { count } = await admin
        .from('unit_members')
        .select('unit_id', { count: 'exact', head: true })
        .eq('unit_id', unitId)
        .eq('profile_id', user.id)
        .is('ended_at', null)
      if (!count || count === 0) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    if (profile.role === 'admin') {
      const { count } = await admin
        .from('admin_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', user.id)
        .eq('residence_id', residenceId)
      if (!count || count === 0) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

  } else {
    // scope = 'residence'
    const { data: res } = await admin
      .from('residences')
      .select('id, name, address, energy_class, delivery_date, builder_id, builders(name, primary_color, logo_url)')
      .eq('id', id)
      .single()

    if (!res) return NextResponse.json({ error: 'Residenza non trovata' }, { status: 404 })

    const r = res as unknown as ResidenceInfo
    residenceId = r.id
    residenceName = r.name
    residenceAddress = r.address
    energyClass = r.energy_class
    deliveryDate = r.delivery_date
    builderName = r.builders?.name ?? 'CasaZero'
    builderColor = '#04342C' // Colore brand fisso CasaZero (coerente con whitelabel.ts)

    // Solo admin/super_admin per il report residenza
    if (profile.role === 'client') return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    if (profile.role === 'super_admin' && profile.builder_id !== r.builder_id) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }
    if (profile.role === 'admin') {
      const { count } = await admin
        .from('admin_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', user.id)
        .eq('residence_id', residenceId)
      if (!count || count === 0) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }
  }

  // ── Calcolo conformità (live, stesso helper dei contatori dashboard) ──────
  // Denominatore: voci conteggiabili non-promemoria; scadute calcolate da
  // next_due_date via overdueLive, mai dal campo status salvato.
  type ItemRaw = LiveStatusItem & {
    priority: string | null
    maintenance_templates: LiveStatusItem['maintenance_templates'] & { title: string; priority: string }
  }

  const today = todayISO()
  const itemsQuery = admin
    .from('maintenance_items')
    .select(`priority, ${LIVE_STATUS_FIELDS}, maintenance_templates!inner(title, priority, ${LIVE_STATUS_TEMPLATE_FIELDS})`)
    .eq('residence_id', residenceId)
    .neq('status', 'completata')

  const { data: rawItems } = unitId
    ? await itemsQuery.or(`unit_id.eq.${unitId},unit_id.is.null`)
    : await itemsQuery

  const allItems = (rawItems ?? []) as unknown as ItemRaw[]
  const counted = allItems.filter(i => isCountable(i) && resolveCompletionMode(i) !== 'promemoria')
  const overdue = overdueLive(counted, today)
  const scaduteCount = overdue.length
  const conformita = counted.length > 0
    ? Math.round(((counted.length - scaduteCount) / counted.length) * 100)
    : 100

  // ── Completions ───────────────────────────────────────────────────────────
  type CompletionRaw = {
    id: string
    completed_at: string
    performed_by_name: string | null
    notes: string | null
    unit_id: string | null
    maintenance_items: {
      priority: string | null
      maintenance_templates: { title: string; category: string; priority: string; scope: string } | null
    } | null
    attachments: { id: string }[]
  }

  const completionsQuery = admin
    .from('completions')
    .select(`
      id, completed_at, performed_by_name, notes, unit_id,
      maintenance_items(priority, maintenance_templates(title, category, priority, scope)),
      attachments(id)
    `)
    .eq('residence_id', residenceId)
    .order('completed_at', { ascending: false })

  const { data: rawCompletions } = unitId
    ? await completionsQuery.or(`unit_id.eq.${unitId},unit_id.is.null`)
    : await completionsQuery

  const completions: CompletionEntry[] = ((rawCompletions ?? []) as unknown as CompletionRaw[]).map(c => {
    const tpl = c.maintenance_items?.maintenance_templates
    const eff = (c.maintenance_items?.priority ?? tpl?.priority ?? 'N2') as 'N1' | 'N2' | 'N3'
    return {
      completed_at:      c.completed_at,
      title:             tpl?.title ?? 'Intervento',
      category:          tpl?.category ?? '',
      priority:          eff,
      is_condominium:    c.unit_id === null,
      performed_by_name: c.performed_by_name,
      notes:             c.notes,
      attachment_count:  (c.attachments ?? []).length,
    }
  })

  // ── Voci scadute (stesso set live del calcolo conformità) ────────────────
  const overdueItems: OverdueEntry[] = [...overdue]
    .sort((a, b) => ((a.next_due_date ?? '') < (b.next_due_date ?? '') ? -1 : 1))
    .map(i => ({
      title: i.maintenance_templates?.title ?? 'Voce',
      // priorità legacy solo per il badge nel PDF, non per il conteggio
      priority: (i.priority ?? i.maintenance_templates?.priority ?? 'N2') as 'N1' | 'N2' | 'N3',
      next_due_date: i.next_due_date as string,
    }))

  // ── Genera PDF ────────────────────────────────────────────────────────────
  const reportData: ReportData = {
    scope,
    unitLabel,
    residenceName,
    residenceAddress,
    energyClass,
    deliveryDate,
    builderName,
    builderColor,
    generatedAt: new Date().toLocaleDateString('it-IT', {
      day: 'numeric', month: 'long', year: 'numeric',
    }),
    conformita,
    n2n3Total: counted.length,
    n2n3Ok:    counted.length - scaduteCount,
    completions,
    overdueItems,
  }

  const pdfBuffer = await renderToBuffer(React.createElement(ReportDocument, reportData) as unknown as React.ReactElement<DocumentProps>)
  const buffer = new Uint8Array(pdfBuffer)

  const filename = unitLabel
    ? `fascicolo-${formatUnitLabel(unitLabel).replace(/\s+/g, '-').toLowerCase()}.pdf`
    : `fascicolo-${residenceName.replace(/\s+/g, '-').toLowerCase()}.pdf`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
