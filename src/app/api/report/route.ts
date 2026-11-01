import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { ReportDocument } from '@/lib/pdf/ReportDocument'
import type { ReportData, CompletionEntry, OverdueEntry } from '@/lib/pdf/ReportDocument'
import type { CompletionMode, ObligationType } from '@/types/database'
import { authorizeResidenceActor, PG_INVALID_TEXT_REPRESENTATION } from '@/lib/document-access'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import {
  isCountable, overdueLive, resolveCompletionMode, resolveObligationType, todayISO,
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

  // ── Dati residenza / unità + autorizzazione ───────────────────────────────
  // Admin e super_admin: authorizeResidenceActor (document-access.ts), stesso
  // perimetro di fascicolo-pdf. Residente: solo scope=unit e solo se membro
  // attivo dell'unità. Nessun altro ruolo. Ogni lettura destruttura `error`:
  // un guasto è un 500 tecnico, mai "Accesso negato" o "non trovata".
  type ResidenceInfo = {
    id: string; name: string; address: string | null; energy_class: string | null
    delivery_date: string | null; builder_id: string
    builders: { name: string } | null
  }
  type UnitInfo = {
    id: string; label: string; residence_id: string
    residences: ResidenceInfo | null
  }
  const RESIDENCE_FIELDS = 'id, name, address, energy_class, delivery_date, builder_id, builders(name)'
  const technicalError = () =>
    NextResponse.json({ error: 'Errore tecnico nella generazione del report, riprova' }, { status: 500 })

  let residence: ResidenceInfo
  let unitId: string | null = null
  let unitLabel: string | null = null

  if (scope === 'unit') {
    const { data: unit, error: unitError } = await admin
      .from('units')
      .select(`id, label, residence_id, residences(${RESIDENCE_FIELDS})`)
      .eq('id', id)
      .maybeSingle()

    if (unitError) {
      if (unitError.code === PG_INVALID_TEXT_REPRESENTATION) {
        return NextResponse.json({ error: 'Unità non trovata' }, { status: 404 })
      }
      console.error(`[report] lettura units fallita (unitId=${id}):`, unitError.message)
      return technicalError()
    }
    if (!unit) return NextResponse.json({ error: 'Unità non trovata' }, { status: 404 })

    const u = unit as unknown as UnitInfo
    if (!u.residences) return NextResponse.json({ error: 'Dati residenza mancanti' }, { status: 404 })
    unitId = u.id
    unitLabel = u.label
    residence = u.residences

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      console.error(`[report] lettura profiles fallita (userId=${user.id}):`, profileError.message)
      return technicalError()
    }

    if (profile?.role === 'client') {
      // Residente: deve essere membro attivo dell'unità
      const { count, error: memberError } = await admin
        .from('unit_members')
        .select('unit_id', { count: 'exact', head: true })
        .eq('unit_id', unitId)
        .eq('profile_id', user.id)
        .is('ended_at', null)

      if (memberError) {
        console.error(`[report] lettura unit_members fallita (unitId=${unitId}, userId=${user.id}):`, memberError.message)
        return technicalError()
      }
      if (!count || count === 0) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    } else {
      // Ogni ruolo diverso da client passa dall'helper, che accetta solo
      // super_admin del builder e admin assegnato.
      const auth = await authorizeResidenceActor(admin, user.id, residence.id, '[report]')
      if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

  } else {
    // scope = 'residence': solo admin/super_admin, il residente riceve 403 dall'helper
    const auth = await authorizeResidenceActor(admin, user.id, id, '[report]')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { data: res, error: resError } = await admin
      .from('residences')
      .select(RESIDENCE_FIELDS)
      .eq('id', auth.residence.id)
      .maybeSingle()

    if (resError) {
      console.error(`[report] lettura residences fallita (residenceId=${auth.residence.id}):`, resError.message)
      return technicalError()
    }
    if (!res) return NextResponse.json({ error: 'Residenza non trovata' }, { status: 404 })
    residence = res as unknown as ResidenceInfo
  }

  const residenceId      = residence.id
  const residenceName    = residence.name
  const residenceAddress = residence.address
  const energyClass      = residence.energy_class
  const deliveryDate     = residence.delivery_date
  const builderName      = residence.builders?.name ?? 'CasaZero'
  const builderColor     = '#04342C' // Colore brand fisso CasaZero (coerente con whitelabel.ts)

  // ── Calcolo conformità (live, stesso helper dei contatori dashboard) ──────
  // Denominatore: voci conteggiabili non-promemoria; scadute calcolate da
  // next_due_date via overdueLive, mai dal campo status salvato.
  type ItemRaw = LiveStatusItem & {
    obligation_type: ObligationType | null
    maintenance_templates: LiveStatusItem['maintenance_templates'] & { title: string; obligation_type: ObligationType | null }
  }

  const today = todayISO()
  const itemsQuery = admin
    .from('maintenance_items')
    .select(`obligation_type, ${LIVE_STATUS_FIELDS}, maintenance_templates!inner(title, obligation_type, ${LIVE_STATUS_TEMPLATE_FIELDS})`)
    .eq('residence_id', residenceId)
    .neq('status', 'completata')

  const { data: rawItems, error: itemsError } = unitId
    ? await itemsQuery.or(`unit_id.eq.${unitId},unit_id.is.null`)
    : await itemsQuery

  // Senza le voci la conformita uscirebbe al 100%: nessun PDF, errore tecnico.
  if (itemsError) {
    console.error(`[report] lettura maintenance_items fallita (residenceId=${residenceId}, unitId=${unitId}):`, itemsError.message)
    return NextResponse.json({ error: 'Errore tecnico nella generazione del report, riprova' }, { status: 500 })
  }

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
      completion_mode: CompletionMode | null
      maintenance_templates: { title: string; category: string; completion_mode: CompletionMode | null; scope: string } | null
    } | null
    attachments: { id: string }[]
  }

  const completionsQuery = admin
    .from('completions')
    .select(`
      id, completed_at, performed_by_name, notes, unit_id,
      maintenance_items(completion_mode, maintenance_templates(title, category, completion_mode, scope)),
      attachments(id)
    `)
    .eq('residence_id', residenceId)
    .order('completed_at', { ascending: false })

  const { data: rawCompletions, error: completionsError } = unitId
    ? await completionsQuery.or(`unit_id.eq.${unitId},unit_id.is.null`)
    : await completionsQuery

  // Senza i completamenti lo storico uscirebbe vuoto: nessun PDF, errore tecnico.
  if (completionsError) {
    console.error(`[report] lettura completions fallita (residenceId=${residenceId}, unitId=${unitId}):`, completionsError.message)
    return NextResponse.json({ error: 'Errore tecnico nella generazione del report, riprova' }, { status: 500 })
  }

  const completions: CompletionEntry[] = ((rawCompletions ?? []) as unknown as CompletionRaw[]).map(c => {
    const tpl = c.maintenance_items?.maintenance_templates
    return {
      completed_at:      c.completed_at,
      title:             tpl?.title ?? 'Intervento',
      category:          tpl?.category ?? '',
      completion_mode:   c.maintenance_items?.completion_mode ?? tpl?.completion_mode ?? null,
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
      // Tipo per il badge nel PDF: voce ?? template, come nelle altre superfici.
      obligation_type: resolveObligationType(i),
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
    countedTotal: counted.length,
    countedOk:    counted.length - scaduteCount,
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
