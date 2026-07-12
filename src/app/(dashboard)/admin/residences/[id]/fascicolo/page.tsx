import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Paperclip, FileDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatUnitLabel } from '@/lib/formatUnitLabel'

export const metadata: Metadata = { title: 'Fascicolo residenza' }

type Params = Promise<{ id: string }>

type CompletionRow = {
  id: string
  completed_at: string
  unit_id: string | null
  performed_by_name: string | null
  maintenance_items: { maintenance_templates: { title: string } | null } | null
  units: { label: string } | null
  attachments: { id: string; storage_path: string; file_name: string }[]
}

export default async function ResidenceFascicoloPage({ params }: { params: Params }) {
  const { id: residenceId } = await params
  await requireRole(['super_admin'], '/admin/manutenzioni')
  const supabase = await createClient()

  const { data: residence } = await supabase
    .from('residences')
    .select('id, name')
    .eq('id', residenceId)
    .single()

  if (!residence) notFound()

  // Fascicolo = fonte legale, non il piano: nessun filtro su activation_status.
  // I completamenti di voci oggi archiviate restano visibili qui (piano ≠ fascicolo).
  const { data: rawCompletions } = await supabase
    .from('completions')
    .select(`
      id, completed_at, unit_id, performed_by_name,
      maintenance_items(maintenance_templates(title)),
      units(label),
      attachments(id, storage_path, file_name)
    `)
    .eq('residence_id', residenceId)
    .order('completed_at', { ascending: false })

  const completions = (rawCompletions ?? []) as unknown as CompletionRow[]

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="bg-surface border-b border-border px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link
          href={`/admin/residences/${residenceId}`}
          className="text-text-secondary p-1 -ml-1 rounded-lg"
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={1.6} />
        </Link>
        <div className="flex-1">
          <h1 className="text-base font-medium text-text-primary">Fascicolo</h1>
          <p className="text-xs text-text-secondary">{residence.name}</p>
        </div>
        <a
          href={`/api/fascicolo-pdf?residenceId=${residenceId}`}
          download
          className="flex items-center gap-1.5 px-3 py-2 border border-brand-medium rounded-lg text-xs font-medium text-brand-dark flex-shrink-0"
        >
          <FileDown className="w-3.5 h-3.5" strokeWidth={1.8} />
          Scarica fascicolo (PDF)
        </a>
      </div>

      <div className="p-4">
        {completions.length === 0 ? (
          <div className="bg-surface rounded-xl border border-border p-8 text-center">
            <p className="text-sm font-medium text-text-primary">Nessun completamento registrato</p>
            <p className="text-xs text-text-secondary mt-1">
              Quando l&apos;amministratore o i residenti completano una manutenzione, il fascicolo si costruisce qui.
            </p>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-right font-medium text-xs text-text-secondary px-4 py-2.5 whitespace-nowrap">Data</th>
                    <th className="text-left font-medium text-xs text-text-secondary px-4 py-2.5">Voce</th>
                    <th className="text-left font-medium text-xs text-text-secondary px-4 py-2.5">Unità</th>
                    <th className="text-left font-medium text-xs text-text-secondary px-4 py-2.5">Registrato da</th>
                    <th className="text-left font-medium text-xs text-text-secondary px-4 py-2.5 w-8" aria-label="Allegato" />
                  </tr>
                </thead>
                <tbody>
                  {completions.map(c => {
                    const dateStr = new Date(c.completed_at).toLocaleDateString('it-IT', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })
                    const title = c.maintenance_items?.maintenance_templates?.title ?? '—'
                    const unitLabel = c.unit_id === null
                      ? 'Condominio'
                      : (c.units ? formatUnitLabel(c.units.label) : '—')

                    return (
                      <tr key={c.id} className="border-b border-border last:border-b-0">
                        <td className="text-right tabular-nums text-text-secondary px-4 py-2.5 whitespace-nowrap">{dateStr}</td>
                        <td className="text-text-primary font-medium px-4 py-2.5">{title}</td>
                        <td className="text-text-secondary px-4 py-2.5">{unitLabel}</td>
                        <td className="text-text-secondary px-4 py-2.5">{c.performed_by_name ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          {c.attachments.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              {c.attachments.map(att => (
                                <a
                                  key={att.id}
                                  href={`/api/download?bucket=attachments&path=${encodeURIComponent(att.storage_path)}`}
                                  aria-label={`Apri allegato: ${att.file_name}`}
                                  title={att.file_name}
                                  className="text-text-secondary hover:text-brand-dark transition-colors rounded focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-offset-2"
                                >
                                  <Paperclip className="w-3.5 h-3.5" strokeWidth={1.6} />
                                </a>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
