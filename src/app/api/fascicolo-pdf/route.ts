import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { FascicoloDocument } from '@/lib/pdf/FascicoloDocument'
import type { FascicoloData, FascicoloRow } from '@/lib/pdf/FascicoloDocument'
import { formatRegisteredBy } from '@/lib/formatRegisteredBy'
import type { CompletionMode } from '@/types/database'

// Forza runtime Node.js — @react-pdf/renderer non è compatibile con Edge
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/fascicolo-pdf?residenceId=UUID — solo super_admin del builder proprietario
export async function GET(req: NextRequest) {
  const residenceId = req.nextUrl.searchParams.get('residenceId')
  if (!residenceId) {
    return NextResponse.json({ error: 'Parametro residenceId mancante' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const admin = createServiceClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('role, builder_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'super_admin') {
    return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
  }

  const { data: residence } = await admin
    .from('residences')
    .select('id, name, builder_id')
    .eq('id', residenceId)
    .single()

  if (!residence) return NextResponse.json({ error: 'Residenza non trovata' }, { status: 404 })
  if (residence.builder_id !== profile.builder_id) {
    return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
  }

  // Fascicolo = fonte legale, non il piano: nessun filtro su activation_status.
  type CompletionRaw = {
    completed_at: string
    unit_id: string | null
    performed_by_name: string | null
    maintenance_items: {
      completion_mode: CompletionMode | null
      maintenance_templates: { title: string; completion_mode: CompletionMode | null } | null
    } | null
    units: { label: string } | null
    attachments: { id: string }[]
  }

  const { data: rawCompletions } = await admin
    .from('completions')
    .select(`
      completed_at, unit_id, performed_by_name,
      maintenance_items(completion_mode, maintenance_templates(title, completion_mode)),
      units(label),
      attachments(id)
    `)
    .eq('residence_id', residenceId)
    .order('completed_at', { ascending: false })

  const rows: FascicoloRow[] = ((rawCompletions ?? []) as unknown as CompletionRaw[]).map(c => ({
    completed_at:   c.completed_at,
    title:          c.maintenance_items?.maintenance_templates?.title ?? '—',
    unit_label:     c.unit_id === null ? null : (c.units?.label ?? null),
    registered_by:  formatRegisteredBy(
      c.performed_by_name,
      c.maintenance_items?.completion_mode ?? null,
      c.maintenance_items?.maintenance_templates?.completion_mode ?? null,
    ),
    has_attachment: (c.attachments ?? []).length > 0,
  }))

  const fascicoloData: FascicoloData = {
    residenceName: residence.name,
    generatedAt: new Date().toLocaleDateString('it-IT', {
      day: 'numeric', month: 'long', year: 'numeric',
    }),
    rows,
  }

  const pdfBuffer = await renderToBuffer(
    React.createElement(FascicoloDocument, fascicoloData) as unknown as React.ReactElement<DocumentProps>
  )
  const buffer = new Uint8Array(pdfBuffer)

  const filename = `fascicolo-${residence.name.replace(/\s+/g, '-').toLowerCase()}.pdf`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
