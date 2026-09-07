import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { ManutenzioniTable, type ManutenzioneRow } from './ManutenzioniTable'
import type { MaintenanceStatus, CompletionMode, ItemActivation, ObligationType } from '@/types/database'
import { isOverdueLive, isInCorso, resolveCompletionMode, resolveObligationType } from '@/lib/maintenance-status'

export const metadata: Metadata = { title: 'Attività — Amministratore' }

type SearchParams = Promise<{ filter?: string }>

type StatFilter = 'scadute' | 'in_corso' | 'pianificate'

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

  await requireRole(['admin'])
  const supabase = await createClient()

  // Pagina "Attività": lista trasversale delle voci a carico dell'amministratore
  // su tutte le residenze che segue. L'elenco delle residenze sta in
  // /admin/residences; il contatto del costruttore non è più qui.
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
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl font-semibold text-text-primary">Attività</h1>
        <p className="text-sm text-text-secondary mt-2">
          Interventi a tuo carico su tutte le residenze che segui.
        </p>
      </header>

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
