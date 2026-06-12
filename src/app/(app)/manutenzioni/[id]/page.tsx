import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ShieldCheck, Wrench, Phone } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'
import { PriorityBadge } from '@/components/PriorityBadge'
import { CompleteN2Form } from '@/components/CompleteN2Form'
import { N3AdminActions } from '@/components/N3AdminActions'
import type { MaintenancePriority, MaintenanceStatus } from '@/types/database'

export const metadata: Metadata = { title: 'Dettaglio manutenzione' }

type Params = Promise<{ id: string }>

export default async function ItemDetailPage({ params }: { params: Params }) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: item } = await supabase
    .from('maintenance_items')
    .select(`
      id, status, next_due_date, unit_id, residence_id, priority, frequency_months, warranty_info,
      maintenance_templates(title, category, description, priority, frequency_months, scope),
      suppliers(name, phone, email)
    `)
    .eq('id', id)
    .single()

  if (!item) notFound()

  const tpl = item.maintenance_templates as unknown as {
    title: string; category: string; description: string | null
    priority: MaintenancePriority; frequency_months: number; scope: string
  } | null

  const supplier = item.suppliers as unknown as { name: string; phone: string | null; email: string | null } | null
  const effectivePriority = (item.priority ?? tpl?.priority ?? 'N2') as MaintenancePriority
  const status = item.status as MaintenanceStatus

  const formattedDue = item.next_due_date
    ? new Date(item.next_due_date).toLocaleDateString('it-IT', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : null

  // Storico completamenti per questo item
  const { data: completions } = await supabase
    .from('completions')
    .select('id, completed_at, performed_by_name, notes, attachments(id, file_name)')
    .eq('item_id', id)
    .order('completed_at', { ascending: false })
    .limit(10)

  // Unità attiva del client per il form N2
  const { data: membership } = await supabase
    .from('unit_members')
    .select('unit_id')
    .eq('profile_id', profile.id)
    .is('ended_at', null)
    .maybeSingle()

  const canCompleteN2 =
    effectivePriority === 'N2' &&
    status === 'scaduta' &&
    profile.role === 'client' &&
    membership?.unit_id === item.unit_id

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin'
  const isN3 = effectivePriority === 'N3'

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="bg-surface border-b border-border px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/manutenzioni" className="text-text-secondary p-1 -ml-1 rounded-lg active:bg-background">
          <ChevronLeft className="w-5 h-5" strokeWidth={1.6} />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-text-secondary">{tpl?.category}</p>
          <h1 className="text-base font-medium text-text-primary truncate">{tpl?.title}</h1>
        </div>
        <PriorityBadge priority={effectivePriority} status={status} />
      </div>

      <div className="p-4 space-y-4">
        {/* Scadenza */}
        {formattedDue && (
          <div className={`rounded-xl p-3 flex items-center gap-3 ${
            status === 'scaduta'
              ? 'bg-semantic-red-bg text-semantic-red'
              : status === 'in_corso'
              ? 'bg-semantic-amber-bg text-semantic-amber'
              : 'bg-background text-text-secondary'
          }`}>
            <span className="text-sm">
              {status === 'scaduta' ? 'Scaduta il ' : status === 'in_corso' ? 'Presa in carico · scaduta il ' : 'Prossima scadenza: '}
              <strong>{formattedDue}</strong>
            </span>
          </div>
        )}

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
                <a href={`tel:${supplier.phone}`} className="flex items-center gap-1 text-sm text-brand-medium mt-1">
                  <Phone className="w-3.5 h-3.5" strokeWidth={1.6} />
                  {supplier.phone}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Azione N2 — client */}
        {canCompleteN2 && (
          <div className="bg-surface rounded-xl border border-border p-4 space-y-3">
            <p className="text-sm font-medium text-text-primary">Registra completamento</p>
            <CompleteN2Form
              itemId={item.id}
              unitId={item.unit_id!}
              residenceId={item.residence_id}
            />
          </div>
        )}

        {/* Azioni N3 — admin */}
        {isN3 && isAdmin && (status === 'scaduta' || status === 'in_corso') && (
          <div className="bg-surface rounded-xl border border-border p-4 space-y-3">
            <p className="text-sm font-medium text-text-primary">Gestione amministratore</p>
            <N3AdminActions itemId={item.id} residenceId={item.residence_id} status={status} />
          </div>
        )}

        {/* Info N3 — client (read-only) */}
        {isN3 && profile.role === 'client' && (
          <div className="bg-background rounded-xl p-3 border border-border">
            <p className="text-xs text-text-secondary">
              Questa manutenzione è a carico dell&apos;amministratore di condominio.
              {status === 'in_corso' && ' È attualmente in corso.'}
            </p>
          </div>
        )}

        {/* Storico */}
        {(completions?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-text-primary">Storico interventi</h2>
            <div className="space-y-2">
              {completions?.map(c => {
                const comp = c as {
                  id: string; completed_at: string
                  performed_by_name: string | null; notes: string | null
                  attachments: { id: string; file_name: string }[]
                }
                return (
                  <div key={comp.id} className="bg-surface rounded-xl border border-border p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-text-primary">
                        {new Date(comp.completed_at).toLocaleDateString('it-IT', {
                          day: 'numeric', month: 'long', year: 'numeric',
                        })}
                      </span>
                      {comp.attachments?.length > 0 && (
                        <span className="text-xs text-text-secondary">
                          {comp.attachments.length} allegat{comp.attachments.length === 1 ? 'o' : 'i'}
                        </span>
                      )}
                    </div>
                    {comp.performed_by_name && (
                      <p className="text-xs text-text-secondary">Eseguito da: {comp.performed_by_name}</p>
                    )}
                    {comp.notes && (
                      <p className="text-sm text-text-secondary mt-1 leading-relaxed">{comp.notes}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
