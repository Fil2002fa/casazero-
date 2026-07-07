import type { Metadata } from 'next'
import Link from 'next/link'
import { Download, Paperclip, FileDown } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/admin'
import { requireProfile } from '@/lib/auth'
import type { MaintenancePriority } from '@/types/database'
import {
  isCountable, overdueLive, resolveCompletionMode, todayISO,
  LIVE_STATUS_FIELDS, LIVE_STATUS_TEMPLATE_FIELDS,
  type LiveStatusItem,
} from '@/lib/maintenance-status'

export const metadata: Metadata = { title: 'Fascicolo' }

type SearchParams = Promise<{ scope?: string }>

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

export default async function FascicoloPage({ searchParams }: { searchParams: SearchParams }) {
  const { scope = 'all' } = await searchParams
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

  const { data: rawItems } = await itemsQuery
  const allItems = (rawItems ?? []) as unknown as LiveStatusItem[]
  const counted = allItems.filter(i => isCountable(i) && resolveCompletionMode(i) !== 'promemoria')
  const scaduteCount = overdueLive(counted, todayISO()).length
  const conformita = counted.length > 0
    ? Math.round(((counted.length - scaduteCount) / counted.length) * 100)
    : 100

  // ── Completions ──────────────────────────────────────────────────────────
  // Usa adminClient per evitare dipendenza da RLS e applicare esplicitamente
  // lo stesso perimetro usato per conformità e PDF (residence_id + unit_id).
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

  if (scope === 'unit') {
    // Tab "Unità": solo completions della propria unità (o di qualsiasi unità per admin)
    completionsQuery = primaryUnitId
      ? completionsQuery.eq('unit_id', primaryUnitId)
      : completionsQuery.not('unit_id', 'is', null)
  } else if (scope === 'condominium') {
    completionsQuery = completionsQuery.is('unit_id', null)
  } else if (primaryUnitId) {
    // Tab "Tutti" per un client: la propria unità + parti condominiali
    completionsQuery = completionsQuery.or(`unit_id.eq.${primaryUnitId},unit_id.is.null`)
  }
  // Tab "Tutti" per admin/super_admin: nessun filtro ulteriore (tutte le completions della residenza)

  const { data: rawCompletions } = await completionsQuery
  const completions = (rawCompletions ?? []) as unknown as CompletionRow[]

  // Contatori
  const thisYear = new Date().getFullYear()
  const yearCount = completions.filter(
    c => new Date(c.completed_at).getFullYear() === thisYear
  ).length

  return (
    <div className="p-6 space-y-6 pb-safe">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-text-primary">Fascicolo</h1>
          <p className="text-xs text-text-secondary mt-0.5">Registro permanente degli interventi</p>
        </div>
        {reportHref && (
          <a
            href={reportHref}
            download
            className="flex items-center gap-1.5 px-3 py-2 border border-brand-medium rounded-lg text-xs font-medium text-brand-dark flex-shrink-0"
          >
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
            <p className="text-xs text-text-secondary mt-1">manutenzioni in regola</p>
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

      {/* Contatori */}
      <div className="grid grid-cols-3 gap-3">
        <StatBox label="Totali" value={completions.length} />
        <StatBox label={`Anno ${thisYear}`} value={yearCount} />
        <StatBox label="Scadute" value={scaduteCount} alert={scaduteCount > 0} />
      </div>

      {/* Filtro scope */}
      <div className="flex gap-2">
        {(['all', 'unit', 'condominium'] as const).map(s => (
          <Link
            key={s}
            href={`/fascicolo${s !== 'all' ? `?scope=${s}` : ''}`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              scope === s || (s === 'all' && scope !== 'unit' && scope !== 'condominium')
                ? 'bg-brand-dark text-white'
                : 'bg-surface border border-border text-text-secondary'
            }`}
          >
            {s === 'all' ? 'Tutti' : s === 'unit' ? 'Unità' : 'Condominio'}
          </Link>
        ))}
      </div>

      {/* Timeline */}
      {completions.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-text-secondary">Nessun intervento registrato.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {completions.map((c, idx) => {
            const tpl = c.maintenance_items?.maintenance_templates
            const effectivePriority = c.maintenance_items?.priority ?? tpl?.priority ?? 'N2'
            const isCondominium = c.unit_id === null
            const dateStr = new Date(c.completed_at).toLocaleDateString('it-IT', {
              day: 'numeric', month: 'long', year: 'numeric',
            })
            const prevDate = idx > 0
              ? new Date(completions[idx - 1].completed_at).getFullYear()
              : null
            const thisDateYear = new Date(c.completed_at).getFullYear()
            const showYearSep = prevDate !== null && prevDate !== thisDateYear

            return (
              <div key={c.id}>
                {(idx === 0 || showYearSep) && (
                  <div className="flex items-center gap-3 py-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-text-secondary font-medium">{thisDateYear}</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}

                <div className="flex gap-3">
                  {/* Timeline line */}
                  <div className="flex flex-col items-center">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${
                      effectivePriority === 'N3' ? 'bg-brand-medium'
                      : effectivePriority === 'N2' ? 'bg-semantic-blue'
                      : 'bg-text-secondary'
                    }`} />
                    {idx < completions.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-1" />
                    )}
                  </div>

                  {/* Card */}
                  <div className="flex-1 bg-surface rounded-xl border border-border p-3 mb-2">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {tpl?.title ?? 'Intervento'}
                        </p>
                        <p className="text-xs text-text-secondary">{tpl?.category}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          isCondominium
                            ? 'bg-brand-light text-brand-dark'
                            : 'bg-semantic-blue-bg text-semantic-blue'
                        }`}>
                          {isCondominium ? 'Condominio' : 'Unità'}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-text-secondary">{dateStr}</p>

                    {c.performed_by_name && (
                      <p className="text-xs text-text-secondary mt-0.5">
                        Eseguito da: <span className="text-text-primary">{c.performed_by_name}</span>
                      </p>
                    )}

                    {c.notes && (
                      <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">{c.notes}</p>
                    )}

                    {c.attachments.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {c.attachments.map(att => (
                          <a
                            key={att.id}
                            href={`/api/download?bucket=attachments&path=${encodeURIComponent(att.storage_path)}`}
                            className="flex items-center gap-1.5 text-xs text-brand-medium"
                          >
                            <Paperclip className="w-3 h-3" strokeWidth={1.6} />
                            {att.file_name}
                            <Download className="w-3 h-3 ml-auto" strokeWidth={1.6} />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer nota immutabilità */}
      <p className="text-xs text-text-secondary text-center pb-2">
        Il fascicolo è un registro permanente e non modificabile.
      </p>
    </div>
  )
}

function StatBox({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className={`rounded-xl p-3 text-center border ${
      alert ? 'bg-semantic-red-bg border-semantic-red/20' : 'bg-surface border-border'
    }`}>
      <p className={`text-2xl font-medium ${alert ? 'text-semantic-red' : 'text-text-primary'}`}>
        {value}
      </p>
      <p className="text-xs text-text-secondary mt-0.5">{label}</p>
    </div>
  )
}
