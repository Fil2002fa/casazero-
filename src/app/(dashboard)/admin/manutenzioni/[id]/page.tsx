import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ShieldCheck, Wrench, Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { PriorityBadge } from '@/components/PriorityBadge'
import { N3AdminActions } from '@/components/N3AdminActions'
import type { MaintenancePriority, MaintenanceStatus } from '@/types/database'
import { formatUnitLabel } from '@/lib/formatUnitLabel'

export const metadata: Metadata = { title: 'Dettaglio manutenzione' }

type Params = Promise<{ id: string }>

type TplRow = {
  title: string; category: string; description: string | null
  priority: MaintenancePriority; frequency_months: number; scope: string
}
type SupplierRow = { name: string; phone: string | null; email: string | null }
type CompletionRow = {
  id: string; completed_at: string
  performed_by_name: string | null; notes: string | null
  attachments: { id: string; file_name: string }[]
}

export default async function AdminItemDetailPage({ params }: { params: Params }) {
  const { id } = await params
  const profile = await requireRole(['admin', 'super_admin'])
  const supabase = await createClient()

  const { data: rawItem } = await supabase
    .from('maintenance_items')
    .select(`
      id, status, next_due_date, unit_id, residence_id, priority, warranty_info,
      maintenance_templates(title, category, description, priority, frequency_months, scope),
      suppliers(name, phone, email),
      residences(name),
      units(label)
    `)
    .eq('id', id)
    .single()

  if (!rawItem) notFound()

  const item = rawItem as unknown as {
    id: string; status: string; next_due_date: string | null
    unit_id: string | null; residence_id: string; priority: string | null
    warranty_info: string | null
    maintenance_templates: TplRow | null
    suppliers: SupplierRow | null
    residences: { name: string } | null
    units: { label: string } | null
  }

  const tpl = item.maintenance_templates
  const supplier = item.suppliers
  const effectivePriority = (item.priority ?? tpl?.priority ?? 'N2') as MaintenancePriority
  const status = item.status as MaintenanceStatus

  const { data: rawCompletions } = await supabase
    .from('completions')
    .select('id, completed_at, performed_by_name, notes, attachments(id, file_name)')
    .eq('item_id', id)
    .order('completed_at', { ascending: false })
    .limit(20)

  const completions = (rawCompletions ?? []) as unknown as CompletionRow[]

  const isN3 = effectivePriority === 'N3'
  const canAct = profile.role === 'admin' && isN3 && (status === 'scaduta' || status === 'in_corso')

  const formattedDue = item.next_due_date
    ? new Date(item.next_due_date).toLocaleDateString('it-IT', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : null

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="bg-surface border-b border-border px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/admin/manutenzioni" className="text-text-secondary p-1 -ml-1 rounded-lg active:bg-background">
          <ChevronLeft className="w-5 h-5" strokeWidth={1.6} />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-text-secondary">{tpl?.category}</p>
          <h1 className="text-base font-medium text-text-primary truncate">{tpl?.title ?? '—'}</h1>
        </div>
        <PriorityBadge priority={effectivePriority} status={status} />
      </div>

      <div className="p-4 space-y-4">
        {/* Scadenza */}
        {formattedDue && (
          <div className={`rounded-xl p-3 ${
            status === 'scaduta'
              ? 'bg-semantic-red-bg text-semantic-red'
              : status === 'in_corso'
              ? 'bg-semantic-amber-bg text-semantic-amber'
              : 'bg-background text-text-secondary'
          }`}>
            <span className="text-sm">
              {status === 'scaduta'
                ? 'Scaduta il '
                : status === 'in_corso'
                ? 'Presa in carico · scaduta il '
                : 'Prossima scadenza: '}
              <strong>{formattedDue}</strong>
            </span>
          </div>
        )}

        {/* Residenza / unità */}
        <div className="bg-surface rounded-xl border border-border p-4">
          {item.residences?.name && (
            <p className="text-sm font-medium text-text-primary">{item.residences.name}</p>
          )}
          <p className="text-xs text-text-secondary mt-0.5">
            {item.units?.label ? `Unità: ${formatUnitLabel(item.units.label)}` : 'Ambito condominiale'}
          </p>
        </div>

        {/* Descrizione */}
        {tpl?.description && (
          <div className="bg-surface rounded-xl border border-border p-4">
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">Descrizione</p>
            <p className="text-sm text-text-primary leading-relaxed">{tpl.description}</p>
          </div>
        )}

        {/* Garanzia */}
        {item.warranty_info && (
          <div className="bg-brand-light rounded-xl p-4 flex gap-3">
            <ShieldCheck className="w-5 h-5 text-brand-medium flex-shrink-0 mt-0.5" strokeWidth={1.6} />
            <div>
              <p className="text-xs font-medium text-brand-dark uppercase tracking-wide mb-1">Garanzia collegata</p>
              <p className="text-sm text-brand-dark leading-relaxed">{item.warranty_info}</p>
            </div>
          </div>
        )}

        {/* Fornitore */}
        {supplier && (
          <div className="bg-surface rounded-xl border border-border p-4 flex gap-3">
            <Wrench className="w-5 h-5 text-text-secondary flex-shrink-0 mt-0.5" strokeWidth={1.6} />
            <div className="flex-1">
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">Fornitore</p>
              <p className="text-sm font-medium text-text-primary">{supplier.name}</p>
              {supplier.phone && (
                <a href={`tel:${supplier.phone}`} className="text-sm text-brand-medium mt-1 block">
                  {supplier.phone}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Azioni N3 — admin assegnato */}
        {canAct && (
          <div className="bg-surface rounded-xl border border-border p-4 space-y-3">
            <p className="text-sm font-medium text-text-primary">Gestione amministratore</p>
            <N3AdminActions itemId={item.id} residenceId={item.residence_id} status={status} />
          </div>
        )}

        {/* Sola lettura — super_admin */}
        {profile.role === 'super_admin' && (
          <div className="bg-background rounded-xl p-3 border border-border flex items-start gap-2">
            <Eye className="w-4 h-4 text-text-secondary flex-shrink-0 mt-0.5" strokeWidth={1.6} />
            <p className="text-xs text-text-secondary">
              Visualizzazione in sola lettura. Le azioni sono riservate all&apos;amministratore di condominio assegnato alla residenza.
            </p>
          </div>
        )}

        {/* Storico interventi */}
        {completions.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-text-primary">Storico interventi</h2>
            <div className="space-y-2">
              {completions.map(c => (
                <div key={c.id} className="bg-surface rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-text-primary">
                      {new Date(c.completed_at).toLocaleDateString('it-IT', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      })}
                    </span>
                    {c.attachments?.length > 0 && (
                      <span className="text-xs text-text-secondary">
                        {c.attachments.length} allegat{c.attachments.length === 1 ? 'o' : 'i'}
                      </span>
                    )}
                  </div>
                  {c.performed_by_name && (
                    <p className="text-xs text-text-secondary">Eseguito da: {c.performed_by_name}</p>
                  )}
                  {c.notes && (
                    <p className="text-sm text-text-secondary mt-1 leading-relaxed">{c.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
