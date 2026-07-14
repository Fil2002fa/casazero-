import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ShieldCheck, Wrench, Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { N3AdminActions } from '@/components/N3AdminActions'
import { StatusBadge, PromemoriaBadge, TypeBadge } from '@/components/ui/Badge'
import type { MaintenanceStatus, CompletionMode, ItemActivation, ObligationType } from '@/types/database'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import {
  isOverdueLive, isInCorso, resolveCompletionMode, resolveObligationType, resolveFrequencyMonths,
  type LiveStatusItem,
} from '@/lib/maintenance-status'

export const metadata: Metadata = { title: 'Dettaglio manutenzione' }

type Params = Promise<{ id: string }>

type TplRow = {
  title: string; category: string; description: string | null
  frequency_months: number; scope: string
  completion_mode: CompletionMode | null; obligation_type: ObligationType | null; is_active: boolean
}
type SupplierRow = { name: string; phone: string | null; email: string | null }
type CompletionRow = {
  id: string; completed_at: string
  performed_by_name: string | null; notes: string | null
  attachments: { id: string; file_name: string }[]
}

export default async function AdminItemDetailPage({ params }: { params: Params }) {
  const { id } = await params
  const profile = await requireRole(['admin'])
  const supabase = await createClient()

  const { data: rawItem } = await supabase
    .from('maintenance_items')
    .select(`
      id, status, next_due_date, unit_id, residence_id, warranty_info,
      completion_mode, obligation_type, frequency_months, activation_status,
      maintenance_templates(title, category, description, frequency_months, scope, completion_mode, obligation_type, is_active),
      suppliers(name, phone, email),
      residences(name),
      units(label)
    `)
    .eq('id', id)
    .single()

  if (!rawItem) notFound()

  const item = rawItem as unknown as {
    id: string; status: string; next_due_date: string | null
    unit_id: string | null; residence_id: string
    warranty_info: string | null
    completion_mode: CompletionMode | null
    obligation_type: ObligationType | null
    frequency_months: number | null
    activation_status: ItemActivation
    maintenance_templates: TplRow | null
    suppliers: SupplierRow | null
    residences: { name: string } | null
    units: { label: string } | null
  }

  const tpl = item.maintenance_templates
  const supplier = item.suppliers
  const status = item.status as MaintenanceStatus

  // Stato live: il cron non gira in locale, quindi 'scaduta' va calcolato da
  // next_due_date (helper condiviso), non letto dal campo status salvato —
  // altrimenti gli item scaduti da tempo restano "invisibili" all'azione admin.
  const liveItem: LiveStatusItem = {
    status: item.status,
    next_due_date: item.next_due_date,
    completion_mode: item.completion_mode,
    activation_status: item.activation_status,
    maintenance_templates: tpl
      ? { completion_mode: tpl.completion_mode, is_active: tpl.is_active }
      : null,
  }
  const overdueNow = isOverdueLive(liveItem)
  const effectiveStatus: MaintenanceStatus = overdueNow ? 'scaduta' : status
  const isReminder = resolveCompletionMode(liveItem) === 'promemoria'
  const obligationType = resolveObligationType({
    obligation_type: item.obligation_type,
    maintenance_templates: tpl ? { obligation_type: tpl.obligation_type } : null,
  })
  const frequencyMonths = resolveFrequencyMonths({
    frequency_months: item.frequency_months,
    maintenance_templates: tpl ? { frequency_months: tpl.frequency_months } : null,
  })

  const { data: rawCompletions } = await supabase
    .from('completions')
    .select('id, completed_at, performed_by_name, notes, attachments(id, file_name)')
    .eq('item_id', id)
    .order('completed_at', { ascending: false })
    .limit(20)

  const completions = (rawCompletions ?? []) as unknown as CompletionRow[]

  const canAct =
    profile.role === 'admin' &&
    resolveCompletionMode(liveItem) === 'amministratore' &&
    (overdueNow || isInCorso(liveItem))

  const formattedDue = item.next_due_date
    ? new Date(item.next_due_date).toLocaleDateString('it-IT', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : null

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/manutenzioni" className="text-text-secondary p-1 -ml-1 rounded-lg active:bg-background">
          <ChevronLeft className="w-5 h-5" strokeWidth={1.6} />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-text-secondary">{tpl?.category}</p>
          <h1 className="text-lg font-semibold text-text-primary truncate">{tpl?.title ?? '—'}</h1>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {isReminder
            ? <PromemoriaBadge frequencyMonths={frequencyMonths} />
            : <StatusBadge status={effectiveStatus} />}
          {obligationType && <TypeBadge obligationType={obligationType} />}
        </div>
      </div>

      <div className="space-y-4">
        {/* Scadenza — mai per le voci promemoria: non confrontano mai date (invariante di prodotto) */}
        {!isReminder && formattedDue && (
          <div className={`rounded-xl p-3 ${
            effectiveStatus === 'scaduta'
              ? 'bg-status-overdue/8 text-status-overdue'
              : effectiveStatus === 'in_corso'
              ? 'bg-status-inprogress/8 text-status-inprogress'
              : 'bg-neutral-600/7 text-neutral-600'
          }`}>
            <span className="text-sm">
              {effectiveStatus === 'scaduta'
                ? 'Scaduta il '
                : effectiveStatus === 'in_corso'
                ? 'Presa in carico · scaduta il '
                : 'Prossima scadenza: '}
              <strong>{formattedDue}</strong>
            </span>
          </div>
        )}

        {/* Residenza / ambito */}
        <div className="bg-surface rounded-xl border border-border p-6">
          <p className="text-[13px] font-medium text-neutral-500 mb-1">Residenza</p>
          <p className="text-sm text-neutral-900">{item.residences?.name ?? '—'}</p>
          <p className="text-[13px] font-medium text-neutral-500 mt-3 mb-1">Ambito</p>
          <p className="text-sm text-neutral-900">
            {item.units?.label ? `Unità ${formatUnitLabel(item.units.label)}` : 'Condominiale'}
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
          <div className="bg-surface rounded-xl border border-border p-6 flex gap-3">
            <Wrench className="w-5 h-5 text-text-secondary flex-shrink-0 mt-0.5" strokeWidth={1.6} />
            <div className="flex-1">
              <p className="text-[13px] font-medium text-neutral-500 mb-1">Fornitore</p>
              <p className="text-sm font-medium text-neutral-900">{supplier.name}</p>
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
            <N3AdminActions itemId={item.id} residenceId={item.residence_id} status={effectiveStatus} />
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
    </>
  )
}
