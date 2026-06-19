import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { PriorityBadge } from '@/components/PriorityBadge'
import { ItemConfigForm } from './ItemConfigForm'
import type { MaintenancePriority, MaintenanceStatus } from '@/types/database'

export const metadata: Metadata = { title: 'Panoramica manutenzioni' }

type Params = Promise<{ id: string }>

type ItemRow = {
  id: string
  status: MaintenanceStatus
  next_due_date: string | null
  unit_id: string | null
  priority: MaintenancePriority | null
  frequency_months: number | null
  warranty_info: string | null
  supplier_id: string | null
  maintenance_templates: { title: string; category: string; priority: MaintenancePriority; frequency_months: number; scope: string } | null
  units: { label: string } | null
  suppliers: { id: string; name: string } | null
}

export default async function ResidenceManutenzioniPage({ params }: { params: Params }) {
  const { id: residenceId } = await params
  await requireRole(['super_admin'])
  const supabase = await createClient()

  const { data: residence } = await supabase
    .from('residences')
    .select('id, name')
    .eq('id', residenceId)
    .single()

  if (!residence) notFound()

  const { data: rawItems } = await supabase
    .from('maintenance_items')
    .select(`
      id, status, next_due_date, unit_id, priority, frequency_months, warranty_info, supplier_id,
      maintenance_templates(title, category, priority, frequency_months, scope),
      units(label),
      suppliers(id, name)
    `)
    .eq('residence_id', residenceId)
    .order('next_due_date', { ascending: true, nullsFirst: false })

  const items = (rawItems ?? []) as unknown as ItemRow[]

  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id, name')
    .eq('residence_id', residenceId)
    .order('name')

  // Raggruppa per categoria
  const byCategory = new Map<string, ItemRow[]>()
  for (const item of items) {
    const cat = item.maintenance_templates?.category ?? 'Altro'
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat)!.push(item)
  }

  const scaduteCount = items.filter(i => i.status === 'scaduta').length
  const inCorsoCount = items.filter(i => i.status === 'in_corso').length

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="bg-surface border-b border-border px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href={`/admin/residences/${residenceId}`} className="text-text-secondary p-1 -ml-1 rounded-lg">
          <ChevronLeft className="w-5 h-5" strokeWidth={1.6} />
        </Link>
        <div className="flex-1">
          <h1 className="text-base font-medium text-text-primary">Manutenzioni</h1>
          <p className="text-xs text-text-secondary">{residence.name}</p>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Contatori */}
        <div className="grid grid-cols-3 gap-3">
          <div className={`rounded-xl p-3 text-center border ${scaduteCount > 0 ? 'bg-semantic-red-bg border-semantic-red/20' : 'bg-surface border-border'}`}>
            <p className={`text-xl font-medium ${scaduteCount > 0 ? 'text-semantic-red' : 'text-text-primary'}`}>{scaduteCount}</p>
            <p className="text-[10px] text-text-secondary">Scadute</p>
          </div>
          <div className={`rounded-xl p-3 text-center border ${inCorsoCount > 0 ? 'bg-semantic-amber-bg border-semantic-amber/20' : 'bg-surface border-border'}`}>
            <p className={`text-xl font-medium ${inCorsoCount > 0 ? 'text-semantic-amber' : 'text-text-primary'}`}>{inCorsoCount}</p>
            <p className="text-[10px] text-text-secondary">In corso</p>
          </div>
          <div className="bg-surface rounded-xl p-3 text-center border border-border">
            <p className="text-xl font-medium text-text-primary">{items.length}</p>
            <p className="text-[10px] text-text-secondary">Totali</p>
          </div>
        </div>

        {/* Per categoria */}
        {Array.from(byCategory.entries()).map(([cat, catItems]) => (
          <section key={cat} className="space-y-2">
            <h2 className="text-sm font-medium text-text-primary">{cat}</h2>
            <div className="space-y-2">
              {catItems.map(item => {
                const tpl = item.maintenance_templates
                const effPriority = (item.priority ?? tpl?.priority ?? 'N2') as MaintenancePriority
                const formattedDue = item.next_due_date
                  ? new Date(item.next_due_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
                  : null

                return (
                  <div key={item.id} className="bg-surface rounded-xl border border-border overflow-hidden">
                    <div className="p-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-text-primary truncate">{tpl?.title}</p>
                          <PriorityBadge priority={effPriority} status={item.status} />
                        </div>
                        <div className="flex gap-3 mt-1 flex-wrap">
                          {item.units && (
                            <span className="text-xs text-text-secondary">{item.units.label}</span>
                          )}
                          {formattedDue && (
                            <span className={`text-xs ${item.status === 'scaduta' ? 'text-semantic-red' : 'text-text-secondary'}`}>
                              {item.status === 'scaduta' ? 'Scaduta ' : 'Scade '}{formattedDue}
                            </span>
                          )}
                          {item.suppliers && (
                            <span className="text-xs text-brand-medium">{item.suppliers.name}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <ItemConfigForm
                      itemId={item.id}
                      residenceId={residenceId}
                      currentPriority={effPriority}
                      currentFrequency={item.frequency_months ?? tpl?.frequency_months ?? null}
                      currentWarranty={item.warranty_info}
                      currentSupplierId={item.supplier_id}
                      suppliers={(suppliers ?? []) as { id: string; name: string }[]}
                    />
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
