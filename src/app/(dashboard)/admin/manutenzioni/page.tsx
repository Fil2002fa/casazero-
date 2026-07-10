import type { Metadata } from 'next'
import Link from 'next/link'
import { Phone, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { ManutenzioniTable, type ManutenzioneRow } from './ManutenzioniTable'
import type { MaintenanceStatus, CompletionMode, ItemActivation, ObligationType } from '@/types/database'
import { isOverdueLive, isInCorso, resolveCompletionMode, resolveObligationType } from '@/lib/maintenance-status'

export const metadata: Metadata = { title: 'Manutenzioni — Amministratore' }

type SearchParams = Promise<{ filter?: string }>

type StatFilter = 'scadute' | 'in_corso' | 'pianificate'

type FollowedResidence = {
  id: string
  name: string
  address: string | null
  photo_url: string | null
  energy_class: string | null
  builder_id: string
  unitCount: number
}

type BuilderContact = {
  id: string
  name: string
  logo_url: string | null
  contact_email: string | null
  contact_phone: string | null
}

type ItemRow = {
  id: string
  status: MaintenanceStatus
  next_due_date: string | null
  unit_id: string | null
  residence_id: string
  completion_mode: CompletionMode | null
  obligation_type: ObligationType | null
  activation_status: ItemActivation
  maintenance_templates: {
    title: string
    category: string
    scope: string
    completion_mode: CompletionMode | null
    obligation_type: ObligationType | null
    is_active: boolean
  } | null
  residences: { name: string } | null
}

/** Riga tabella dallo stesso ItemRow letto per contatori e sezioni — nessuna query separata. */
function toRow(item: ItemRow): ManutenzioneRow {
  const overdueNow = isOverdueLive(item)
  return {
    id: item.id,
    title: item.maintenance_templates?.title ?? '—',
    // Pagina cross-residenza (un admin può seguirne più di una): la colonna
    // mostra la residenza, non "Condominio"/unità — unit_id è sempre null qui
    // (query filtrata), quindi quel dato sarebbe costante su ogni riga.
    residenceName: item.residences?.name ?? '—',
    obligationType: resolveObligationType(item),
    status: overdueNow ? 'scaduta' : item.status,
    nextDueDate: item.next_due_date,
    canTakeCharge: overdueNow,
  }
}

export default async function AdminManutenzioniPage({ searchParams }: { searchParams: SearchParams }) {
  const { filter } = await searchParams
  const activeFilter: StatFilter | null =
    filter === 'scadute' || filter === 'in_corso' || filter === 'pianificate' ? filter : null

  const profile = await requireRole(['admin'])
  const supabase = await createClient()

  // Residenze assegnate all'admin (un admin può averne più di una: niente .single()).
  // Ordine esplicito per determinismo, stesso pattern del fix su (app)/fascicolo/page.tsx.
  const { data: assignmentRows } = await supabase
    .from('admin_assignments')
    .select('residences(id, name, address, photo_url, energy_class, builder_id)')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: true })

  type AssignmentResidence = Omit<FollowedResidence, 'unitCount'>
  const assignedResidences = (assignmentRows ?? [])
    .map(a => a.residences as unknown as AssignmentResidence | null)
    .filter((r): r is AssignmentResidence => r !== null)

  // Numero unità: stessa query/join usata in admin/residences/page.tsx per lo stesso conteggio.
  const followedResidences: FollowedResidence[] = await Promise.all(
    assignedResidences.map(async (r) => {
      const { count } = await supabase
        .from('units')
        .select('id', { count: 'exact', head: true })
        .eq('residence_id', r.id)
      return { ...r, unitCount: count ?? 0 }
    })
  )

  // Costruttore della residenza primaria (prima per created_at, stesso criterio
  // di "residenza principale" già usato in (app)/fascicolo/page.tsx). Richiede la
  // policy SELECT admin su builders via admin_assignments (migrazione 016).
  const primaryBuilderId = followedResidences[0]?.builder_id ?? null
  let builder: BuilderContact | null = null
  if (primaryBuilderId) {
    const { data } = await supabase
      .from('builders')
      .select('id, name, logo_url, contact_email, contact_phone')
      .eq('id', primaryBuilderId)
      .maybeSingle()
    builder = data
  }

  // Tutti gli item di ambito condominio accessibili (RLS filtra per residenze assegnate)
  const { data: rawItems } = await supabase
    .from('maintenance_items')
    .select(`
      id, status, next_due_date, unit_id, residence_id,
      completion_mode, obligation_type, activation_status,
      maintenance_templates(title, category, scope, completion_mode, obligation_type, is_active),
      residences(name)
    `)
    .is('unit_id', null)
    .in('status', ['scaduta', 'in_corso', 'in_attesa'])
    .eq('activation_status', 'inclusa')
    .order('next_due_date', { ascending: true, nullsFirst: false })

  const items = (rawItems ?? []) as unknown as ItemRow[]

  // Filtra per modalità amministratore (asse canonico, non più priorità legacy)
  const adminItems = items.filter(i => resolveCompletionMode(i) === 'amministratore')

  // Stato live: il cron non gira in locale, quindi 'scaduta' va calcolato da
  // next_due_date (helper condiviso), non letto dal campo status salvato —
  // altrimenti gli item scaduti da tempo restano bloccati in "Pianificate".
  const scadute  = adminItems.filter(i => isOverdueLive(i))
  const inCorso  = adminItems.filter(i => isInCorso(i))
  const upcoming = adminItems.filter(i => !isOverdueLive(i) && !isInCorso(i))

  // Righe tabella: stesso array dei contatori sopra, solo filtrato per il tab attivo.
  // adminItems è già ordinato per next_due_date dalla query (nullsFirst: false).
  const filteredItems =
    activeFilter === 'scadute' ? scadute :
    activeFilter === 'in_corso' ? inCorso :
    activeFilter === 'pianificate' ? upcoming :
    adminItems
  const visibleRows = filteredItems.map(toRow)

  return (
    <div className="p-6 space-y-6 pb-safe">
      <header>
        <p className="text-xs text-text-secondary uppercase tracking-wide">Amministratore</p>
        <h1 className="text-xl font-medium text-text-primary mt-1">Manutenzioni condominiali</h1>
      </header>

      {followedResidences.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-text-primary">
            {followedResidences.length === 1 ? 'Residenza che segui' : 'Residenze che segui'}
          </h2>
          <div className="space-y-3">
            {followedResidences.map(r => (
              <div key={r.id} className="bg-surface rounded-xl border border-border overflow-hidden">
                {r.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.photo_url} alt={r.name} className="w-full h-32 object-cover" />
                )}
                <div className="p-4">
                  <p className="text-sm font-medium text-text-primary">{r.name}</p>
                  {r.address && <p className="text-xs text-text-secondary mt-0.5">{r.address}</p>}
                  <p className="text-xs text-text-secondary mt-2">{r.unitCount} unità</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {builder && (
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            {builder.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={builder.logo_url} alt={builder.name} className="w-10 h-10 rounded-lg object-contain flex-shrink-0" />
            )}
            <p className="text-sm font-medium text-text-primary">{builder.name}</p>
          </div>
          {(builder.contact_phone || builder.contact_email) && (
            <div className="mt-2 space-y-1">
              {builder.contact_phone && (
                <a href={`tel:${builder.contact_phone}`} className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <Phone className="w-3 h-3" strokeWidth={1.6} />
                  {builder.contact_phone}
                </a>
              )}
              {builder.contact_email && (
                <a href={`mailto:${builder.contact_email}`} className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <Mail className="w-3 h-3" strokeWidth={1.6} />
                  {builder.contact_email}
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Contatori — cliccabili per filtrare la lista sotto; toggle se già attivi */}
      <div className="grid grid-cols-3 gap-3">
        <Link href={statHref('scadute', activeFilter)} className="block">
          <Stat label="Scadute" value={scadute.length} color="text-semantic-red" bg="bg-semantic-red-bg" active={activeFilter === 'scadute'} />
        </Link>
        <Link href={statHref('in_corso', activeFilter)} className="block">
          <Stat label="In corso" value={inCorso.length} color="text-semantic-amber" bg="bg-semantic-amber-bg" active={activeFilter === 'in_corso'} />
        </Link>
        <Link href={statHref('pianificate', activeFilter)} className="block">
          <Stat label="Pianificate" value={upcoming.length} color="text-text-secondary" bg="bg-background" active={activeFilter === 'pianificate'} />
        </Link>
      </div>

      {/* Tabella — stesso array (adminItems/scadute/inCorso/upcoming) dei contatori sopra, nessuna query separata */}
      {visibleRows.length > 0 && (
        <ManutenzioniTable rows={visibleRows} />
      )}

      {adminItems.length === 0 && (
        <div className="bg-brand-light rounded-xl p-6 text-center">
          <p className="text-sm text-brand-dark font-medium">Nessuna manutenzione attiva</p>
          <p className="text-xs text-brand-medium mt-1">Tutte le residenze sono in regola.</p>
        </div>
      )}
    </div>
  )
}

function statHref(filterValue: StatFilter, activeFilter: StatFilter | null): string {
  return activeFilter === filterValue ? '/admin/manutenzioni' : `/admin/manutenzioni?filter=${filterValue}`
}

function Stat({
  label, value, color, bg, active,
}: {
  label: string; value: number; color: string; bg: string; active: boolean
}) {
  return (
    <div className={`${bg} rounded-xl p-3 text-center ${active ? 'ring-2 ring-brand-dark' : ''}`}>
      <p className={`text-2xl font-medium ${color}`}>{value}</p>
      <p className="text-xs text-text-secondary mt-0.5">{label}</p>
    </div>
  )
}
