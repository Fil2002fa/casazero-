import type { Metadata } from 'next'
import { FileDown } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/admin'
import { requireProfile } from '@/lib/auth'
import type { MaintenancePriority } from '@/types/database'
import { buttonVariants } from '@/components/ui/Button'
import {
  isCountable, overdueLive, resolveCompletionMode, todayISO,
  LIVE_STATUS_FIELDS, LIVE_STATUS_TEMPLATE_FIELDS,
  type LiveStatusItem,
} from '@/lib/maintenance-status'
import { FascicoloList, type FascicoloEntry } from './FascicoloList'

export const metadata: Metadata = { title: 'Fascicolo' }

type CompletionRow = {
  id: string
  completed_at: string
  performed_by_name: string | null
  notes: string | null
  unit_id: string | null
  residence_id: string
  maintenance_items: {
    priority: MaintenancePriority | null
    maintenance_templates: { title: string; category: string; priority: MaintenancePriority; scope: string } | null
  } | null
  attachments: { id: string; file_name: string; storage_path: string; mime_type: string | null }[]
}

export default async function FascicoloPage() {
  const profile = await requireProfile()
  const adminClient = createServiceClient()

  // ── Determina scope primario: usato sia per reportHref sia per conformità ──
  // Scopo: schermo e PDF mostrano ESATTAMENTE lo stesso perimetro e gli stessi numeri.
  // Definizione uniforme: scaduta live da next_due_date via helper maintenance-status
  // (la stessa di /api/report), mai dal campo status salvato.
  let reportHref: string | null = null
  let primaryResidenceId: string | null = null
  let primaryUnitId: string | null = null

  if (profile.role === 'client') {
    const { data: mem } = await adminClient
      .from('unit_members')
      .select('unit_id, units(id, residence_id)')
      .eq('profile_id', profile.id)
      .is('ended_at', null)
      .limit(1)
      .single()
    const unitRow = mem?.units as unknown as { id: string; residence_id: string } | null
    if (unitRow) {
      primaryUnitId      = unitRow.id
      primaryResidenceId = unitRow.residence_id
      reportHref = `/api/report?scope=unit&id=${primaryUnitId}`
    }
  } else if (profile.role === 'admin') {
    // Un admin può avere più residenze assegnate: ordine esplicito, altrimenti
    // Postgres non garantisce quale riga torna .limit(1) senza ORDER BY.
    const { data: assignment } = await adminClient
      .from('admin_assignments')
      .select('residence_id')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    if (assignment) {
      primaryResidenceId = assignment.residence_id
      reportHref = `/api/report?scope=residence&id=${primaryResidenceId}`
    }
  } else if (profile.role === 'super_admin' && profile.builder_id) {
    // Un builder può avere più residenze: ordine esplicito, altrimenti Postgres
    // non garantisce quale riga torna .limit(1) senza ORDER BY.
    const { data: residence } = await adminClient
      .from('residences')
      .select('id')
      .eq('builder_id', profile.builder_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    if (residence) {
      primaryResidenceId = residence.id
      reportHref = `/api/report?scope=residence&id=${primaryResidenceId}`
    }
  }

  // ── Conformità: stesso scope e stessa definizione live del PDF ───────────
  let itemsQuery = adminClient
    .from('maintenance_items')
    .select(`${LIVE_STATUS_FIELDS}, maintenance_templates!inner(${LIVE_STATUS_TEMPLATE_FIELDS})`)
    .neq('status', 'completata')

  if (primaryResidenceId) {
    itemsQuery = itemsQuery.eq('residence_id', primaryResidenceId)
    if (primaryUnitId) {
      itemsQuery = itemsQuery.or(`unit_id.eq.${primaryUnitId},unit_id.is.null`)
    }
  }

  // ── Completions ──────────────────────────────────────────────────────────
  // Usa adminClient per evitare dipendenza da RLS e applicare esplicitamente
  // lo stesso perimetro usato per conformità e PDF (residence_id + unit_id).
  // Si carica sempre lo scope "Tutti": Unità e Condominio sono una partizione
  // su unit_id e li filtra FascicoloList in memoria, senza tornare al server.
  let completionsQuery = adminClient
    .from('completions')
    .select(`
      id, completed_at, performed_by_name, notes, unit_id, residence_id,
      maintenance_items(
        priority,
        maintenance_templates(title, category, priority, scope)
      ),
      attachments(id, file_name, storage_path, mime_type)
    `)
    .order('completed_at', { ascending: false })

  if (primaryResidenceId) {
    completionsQuery = completionsQuery.eq('residence_id', primaryResidenceId)
  }

  if (primaryUnitId) {
    // Client: la propria unità + parti condominiali
    completionsQuery = completionsQuery.or(`unit_id.eq.${primaryUnitId},unit_id.is.null`)
  }
  // Admin/super_admin: nessun filtro ulteriore (tutte le completions della residenza)

  // In parallelo: conformità e completions dipendono solo dal perimetro già
  // risolto sopra, non l'una dall'altra.
  const [{ data: rawItems }, { data: rawCompletions }] = await Promise.all([
    itemsQuery,
    completionsQuery,
  ])

  const allItems = (rawItems ?? []) as unknown as LiveStatusItem[]
  const counted = allItems.filter(i => isCountable(i) && resolveCompletionMode(i) !== 'promemoria')
  const scaduteCount = overdueLive(counted, todayISO()).length
  const conformita = counted.length > 0
    ? Math.round(((counted.length - scaduteCount) / counted.length) * 100)
    : 100

  const completions = (rawCompletions ?? []) as unknown as CompletionRow[]

  const thisYear = new Date().getFullYear()

  // Date, anno e colore del punto calcolati qui sul server e passati come
  // valori già pronti: calcolarli nel client darebbe testo diverso fra Node e
  // Safari e un mismatch di hydration.
  const entries: FascicoloEntry[] = completions.map(c => {
    const tpl = c.maintenance_items?.maintenance_templates
    const effectivePriority = c.maintenance_items?.priority ?? tpl?.priority ?? 'N2'
    return {
      id: c.id,
      title: tpl?.title ?? 'Intervento',
      category: tpl?.category ?? null,
      isCondominium: c.unit_id === null,
      dotClass: effectivePriority === 'N3' ? 'bg-brand-medium'
        : effectivePriority === 'N2' ? 'bg-semantic-blue'
        : 'bg-text-secondary',
      dateStr: new Date(c.completed_at).toLocaleDateString('it-IT', {
        day: 'numeric', month: 'long', year: 'numeric',
      }),
      year: new Date(c.completed_at).getFullYear(),
      performedByName: c.performed_by_name,
      notes: c.notes,
      attachments: c.attachments.map(att => ({
        id: att.id,
        file_name: att.file_name,
        storage_path: att.storage_path,
      })),
    }
  })

  return (
    <div className="p-4 space-y-6 pb-safe">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-[22px] font-semibold text-text-primary">Fascicolo</h1>
          <p className="text-sm text-text-secondary mt-0.5">Registro permanente degli interventi</p>
        </div>
        {reportHref && (
          <a href={reportHref} download className={buttonVariants('secondary', 'default', 'flex-shrink-0 gap-1.5')}>
            <FileDown className="w-3.5 h-3.5" strokeWidth={1.8} />
            Report PDF
          </a>
        )}
      </header>

      {/* Conformità */}
      <div className="bg-surface rounded-xl border border-border p-4">
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">Conformità</p>
        <div className="flex items-end gap-4">
          <div>
            <span className={`text-4xl font-medium ${
              conformita >= 80 ? 'text-brand-dark' : conformita >= 60 ? 'text-semantic-amber' : 'text-semantic-red'
            }`}>{conformita}%</span>
            <p className="text-sm text-text-secondary mt-1">manutenzioni in regola</p>
          </div>
          <div className="flex-1 bg-background rounded-full h-2 mb-1">
            <div
              className={`h-2 rounded-full transition-all ${
                conformita >= 80 ? 'bg-brand-medium' : conformita >= 60 ? 'bg-semantic-amber' : 'bg-semantic-red'
              }`}
              style={{ width: `${conformita}%` }}
            />
          </div>
        </div>
      </div>

      <FascicoloList entries={entries} thisYear={thisYear} scaduteCount={scaduteCount} />

      {/* Footer nota immutabilità */}
      <p className="text-xs text-text-secondary text-center pb-2">
        Il fascicolo è un registro permanente e non modificabile.
      </p>
    </div>
  )
}
