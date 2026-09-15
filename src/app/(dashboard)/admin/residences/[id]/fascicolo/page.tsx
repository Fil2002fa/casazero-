import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Paperclip, FileDown } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import { formatRegisteredBy } from '@/lib/formatRegisteredBy'
import type { CompletionMode } from '@/types/database'

export const metadata: Metadata = { title: 'Fascicolo residenza' }

type Params = Promise<{ id: string }>

type CompletionRow = {
  id: string
  completed_at: string
  unit_id: string | null
  performed_by_name: string | null
  maintenance_items: {
    completion_mode: CompletionMode | null
    maintenance_templates: { title: string; completion_mode: CompletionMode | null } | null
  } | null
  units: { label: string } | null
  attachments: { id: string; storage_path: string; file_name: string }[]
}

export default async function ResidenceFascicoloPage({ params }: { params: Params }) {
  const { id: residenceId } = await params
  await requireRole(['admin', 'super_admin'], '/admin/manutenzioni')
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
      maintenance_items(completion_mode, maintenance_templates(title, completion_mode)),
      units(label),
      attachments(id, storage_path, file_name)
    `)
    .eq('residence_id', residenceId)
    .order('completed_at', { ascending: false })

  const completions = (rawCompletions ?? []) as unknown as CompletionRow[]

  return (
    <>
      <PageHeader
        back={{ href: `/admin/residences/${residenceId}`, label: residence.name }}
        title="Fascicolo"
        actions={
          <a
            href={`/api/fascicolo-pdf?residenceId=${residenceId}`}
            download
            className="flex items-center gap-1.5 px-3 py-2 border border-brand-medium rounded-lg text-xs font-medium text-brand-dark flex-shrink-0"
          >
            <FileDown className="w-3.5 h-3.5" strokeWidth={1.8} />
            Scarica fascicolo (PDF)
          </a>
        }
        className="mb-6"
      />

      {completions.length === 0 ? (
          <div className="bg-surface rounded-xl border border-border p-8 text-center">
            <p className="text-sm font-medium text-text-primary">Nessun completamento registrato</p>
            <p className="text-xs text-text-secondary mt-1">
              Quando l&apos;amministratore o i residenti completano una manutenzione, il fascicolo si costruisce qui.
            </p>
          </div>
        ) : (
          // Card sotto xl: cinque colonne con date e nomi non stanno in 736px di
          // contenuto senza scroll orizzontale. La voce è il titolo della card.
          <Table stack="xl">
            <TableHeader>
              <TableHead className="whitespace-nowrap">Data</TableHead>
              <TableHead>Voce</TableHead>
              <TableHead>Unità</TableHead>
              <TableHead>Registrato da</TableHead>
              <TableHead className="whitespace-nowrap">Allegati</TableHead>
            </TableHeader>
            <TableBody>
              {completions.map(c => {
                const dateStr = new Date(c.completed_at).toLocaleDateString('it-IT', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })
                const title = c.maintenance_items?.maintenance_templates?.title ?? '—'
                const unitLabel = c.unit_id === null
                  ? 'Condominio'
                  : (c.units ? formatUnitLabel(c.units.label) : '—')

                return (
                  <TableRow key={c.id}>
                    <TableCell label="Data" className="tabular-nums text-text-secondary whitespace-nowrap">{dateStr}</TableCell>
                    <TableCell emphasis>{title}</TableCell>
                    <TableCell label="Unità" className="text-text-secondary">{unitLabel}</TableCell>
                    <TableCell label="Registrato da" className="text-text-secondary">
                      {formatRegisteredBy(
                        c.performed_by_name,
                        c.maintenance_items?.completion_mode ?? null,
                        c.maintenance_items?.maintenance_templates?.completion_mode ?? null,
                      )}
                    </TableCell>
                    {/* Senza allegati la cella resta vuota e senza etichetta: nella card sparisce. */}
                    <TableCell label={c.attachments.length > 0 ? 'Allegati' : undefined}>
                      {c.attachments.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          {c.attachments.map(att => (
                            <a
                              key={att.id}
                              href={`/api/download?bucket=attachments&path=${encodeURIComponent(att.storage_path)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Apri allegato: ${att.file_name}`}
                              title={att.file_name}
                              className="text-text-secondary hover:text-brand-dark transition-colors rounded focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-offset-2"
                            >
                              <Paperclip className="w-3.5 h-3.5" strokeWidth={1.6} />
                            </a>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
      )}
    </>
  )
}
