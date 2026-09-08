import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ChevronLeft, Wrench, Users, Settings, FileText, BookOpen, AlertTriangle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import {
  overdueLive, isCountable, resolveCompletionMode, formatRelativeDue, todayISO,
  LIVE_STATUS_FIELDS, LIVE_STATUS_TEMPLATE_FIELDS,
} from '@/lib/maintenance-status'
import { unitHasNoActiveAccount } from '@/lib/unit-utils'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import { pluralize } from '@/lib/pluralize'
import type { CompletionMode, ItemActivation } from '@/types/database'
import { AdminBlock, type AdminProfile } from './AdminBlock'
import ResidencePhotoUpload from './ResidencePhotoUpload'
import { UnitsSummaryTable, type UnitSummaryRow } from './UnitsSummaryTable'

export const metadata: Metadata = { title: 'Residenza' }

type Params = Promise<{ id: string }>

type ResidenceHeader = {
  id: string
  name: string
  address: string | null
  photo_url: string | null
}

type UnitRow = {
  id: string
  label: string
  floor: number | null
  unit_members: { ended_at: string | null; is_primary: boolean; profiles: { full_name: string | null } | null }[] | null
}

type PlanItemRow = {
  id: string
  unit_id: string | null
  status: string
  next_due_date: string | null
  completion_mode: CompletionMode | null
  activation_status: ItemActivation
  units: { label: string } | null
  maintenance_templates: {
    title: string
    completion_mode: CompletionMode | null
    is_active: boolean
  } | null
}

type AdminRow = { profiles: AdminProfile | null } | null

// Riepilogo piano (ritardi + prossime scadenze): stessa logica per il ramo
// super_admin e per il ramo admin, estratta qui per non ricalcolarla due
// volte in due superfici (bug class ricorrente, vedi CLAUDE.md). Risultato
// invariato rispetto al calcolo che stava inline nella pagina.
function summarizePlan(itemsRaw: unknown[] | null, today: string) {
  // Piano attivo: solo item a catalogo attivo e inclusi nella residenza.
  const planItems = ((itemsRaw ?? []) as unknown as PlanItemRow[]).filter(isCountable)
  // Unica chiamata a overdueLive: chi chiama legge lo stesso array per stat
  // card e riepilogo. La query a monte ordina già per next_due_date ascendente.
  const overdueItems = overdueLive(planItems, today)
  const overdueIds = new Set(overdueItems.map(i => i.id))
  // Prossime scadenze: escluse le promemoria per costruzione (solo mode
  // residente/amministratore, mai "scaduta" su quelle voci) e le voci già
  // mostrate nel blocco ritardi (niente doppioni).
  const upcomingItems = planItems
    .filter(item => {
      const mode = resolveCompletionMode(item)
      return (mode === 'residente' || mode === 'amministratore')
        && !overdueIds.has(item.id)
        && item.next_due_date !== null
    })
    .slice(0, 5)
  return { overdueItems, upcomingItems }
}

// Riepilogo unità (conteggio, gap account, righe per la tabella): stessa
// logica per entrambi i rami di ruolo, stesso trattamento di summarizePlan.
function buildUnitSummary(unitsRaw: unknown[] | null) {
  const units = (unitsRaw ?? []) as unknown as UnitRow[]
  const unitCount = units.length
  const unitsSenzaAccount = units.filter(u =>
    unitHasNoActiveAccount((u.unit_members ?? []) as { ended_at: string | null }[])
  ).length

  const unitRows: UnitSummaryRow[] = units.map(u => {
    const activeMembers = (u.unit_members ?? []).filter(m => m.ended_at === null)
    const primary = [...activeMembers].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))[0] ?? null
    return {
      id: u.id,
      label: u.label,
      floor: u.floor,
      residentName: primary?.profiles?.full_name ?? null,
      active: activeMembers.length > 0,
    }
  })

  return { unitCount, unitsSenzaAccount, unitRows }
}

type Porta = {
  href: string
  icon: LucideIcon
  label: string
  sub: string | null
  // Tono del sottotitolo: 'overdue' usa lo stesso token di PlanSummarySection.
  subTone?: 'overdue'
}

// Sottotitolo della porta Manutenzioni: lo STATO del piano, non un conteggio
// di righe. Una sola definizione per i due rami di ruolo, come summarizePlan.
// Le promemoria non entrano: overdueCount viene da isOverdueLive, che le esclude.
function manutenzioniSub(overdueCount: number): Pick<Porta, 'sub' | 'subTone'> {
  return overdueCount > 0
    ? { sub: pluralize(overdueCount, 'scaduta', 'scadute'), subTone: 'overdue' }
    : { sub: 'Tutto in regola' }
}

// Navigazione principale della residenza. Scritta UNA volta: i due rami di
// ruolo differiscono solo per quali porte passano e per le colonne della
// griglia, entrambe prop. Duplicare il markup per due classi Tailwind e una
// voce d'array è la stessa bug class del calcolo duplicato (CLAUDE.md).
function PorteNav({ porte, className }: { porte: Porta[]; className: string }) {
  return (
    <nav aria-label="Sezioni residenza" className={className}>
      {porte.map(porta => (
        <Link
          key={porta.href}
          href={porta.href}
          className="flex items-center gap-3 bg-surface rounded-xl border border-border p-4 hover:bg-background transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-offset-2"
        >
          <div className="w-9 h-9 bg-background rounded-lg flex items-center justify-center text-text-secondary flex-shrink-0">
            <porta.icon className="w-4 h-4" strokeWidth={1.6} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">{porta.label}</p>
            {porta.sub && (
              <p className={`text-xs mt-0.5 ${porta.subTone === 'overdue' ? 'text-status-overdue' : 'text-text-secondary'}`}>
                {porta.sub}
              </p>
            )}
          </div>
        </Link>
      ))}
    </nav>
  )
}

// Riepilogo piano manutenzioni — ritardi (max 5) + prossime scadenze, link
// alla pagina Manutenzioni dedicata: stessa resa per entrambi i rami di
// ruolo, stesso trattamento di summarizePlan/buildUnitSummary. Estratto
// perché duplicare la presentazione di un valore già condiviso è la stessa
// bug class applicata al markup invece che al calcolo (CLAUDE.md).
function PlanSummarySection({ residenceId, overdueItems, upcomingItems, today }: {
  residenceId: string
  overdueItems: PlanItemRow[]
  upcomingItems: PlanItemRow[]
  today: string
}) {
  const overdueCount = overdueItems.length
  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-semibold text-text-primary">Piano manutenzioni</h2>
        {overdueCount > 0 && (
          <p className="text-sm font-medium text-status-overdue">
            {pluralize(overdueCount, 'intervento in ritardo', 'interventi in ritardo')}
          </p>
        )}
      </div>
      {overdueCount > 0 ? (
        <div className="bg-surface rounded-xl border border-border divide-y divide-border overflow-hidden">
          {overdueItems.slice(0, 5).map(item => (
            <PlanSummaryRow
              key={item.id}
              href={`/admin/residences/${residenceId}/manutenzioni?filtro=scaduta`}
              title={item.maintenance_templates?.title ?? '—'}
              unitLabel={item.unit_id === null ? 'Condominio' : item.units ? formatUnitLabel(item.units.label) : '—'}
              dateLabel={item.next_due_date ? `scaduta il ${formatDate(item.next_due_date)}` : null}
              dateClassName="text-status-overdue"
            />
          ))}
        </div>
      ) : (
        <div className="bg-brand-light rounded-xl p-4 flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-brand-medium flex-shrink-0" />
          <p className="text-sm text-brand-dark">Nessun intervento in ritardo.</p>
        </div>
      )}
      {overdueCount > 5 && (
        <p className="text-xs text-text-secondary mt-2">
          …e {pluralize(overdueCount - 5, 'altro intervento', 'altri interventi')} in ritardo
        </p>
      )}

      {/* Prossime scadenze: solo mode residente/amministratore, mai promemoria
          (garanzia strutturale "promemoria non è mai scaduta" — nessuna data di
          confronto su quelle voci). Voci già nel blocco ritardi escluse a monte. */}
      {upcomingItems.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-text-primary mb-3">Prossime scadenze</h3>
          <div className="bg-surface rounded-xl border border-border divide-y divide-border overflow-hidden">
            {upcomingItems.map(item => (
              <PlanSummaryRow
                key={item.id}
                href={`/admin/residences/${residenceId}/manutenzioni`}
                title={item.maintenance_templates?.title ?? '—'}
                unitLabel={item.unit_id === null ? 'Condominio' : item.units ? formatUnitLabel(item.units.label) : '—'}
                dateLabel={formatRelativeDue(item.next_due_date!, today)}
                dateClassName="text-text-secondary"
              />
            ))}
          </div>
        </div>
      )}

      <Link
        href={`/admin/residences/${residenceId}/manutenzioni`}
        className="inline-flex items-center justify-center h-11 md:h-9 px-4 mt-3 text-sm font-medium text-neutral-900 bg-surface border border-border rounded-lg hover:bg-background transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-offset-2"
      >
        Vedi tutte le manutenzioni
      </Link>
    </section>
  )
}

export default async function ResidenceDetailPage({ params }: { params: Params }) {
  const { id } = await params
  const profile = await requireRole(['admin', 'super_admin'], '/admin/manutenzioni')
  const supabase = await createClient()

  const { data: residence } = await supabase
    .from('residences')
    .select('id, name, address, energy_class, photo_url')
    .eq('id', id)
    .single()

  if (!residence) notFound()

  // Ramo admin: vista ridotta, sola lettura, senza le azioni del costruttore
  // (foto, assegnazione amministratore, censimento/inviti unità — porta
  // Unità esclusa di proposito). Le altre porte restano chiuse dai loro
  // stessi requireRole finché non si apre il commit 4: link non morti perché
  // puntano a pagine che si apriranno insieme a questa, non a caso.
  if (profile.role === 'admin') {
    return <AdminResidenceView id={id} residence={residence as ResidenceHeader} />
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const [
    { data: unitsRaw },
    { data: itemsRaw },
    { count: docCount },
    { count: supplierCount },
    { count: completionCount },
    { data: adminRaw },
    { data: adminListRaw },
  ] = await Promise.all([
    supabase.from('units')
      .select('id, label, floor, unit_members!left(ended_at, is_primary, profiles(full_name))')
      .eq('residence_id', id)
      .order('floor', { ascending: true, nullsFirst: false })
      .order('label', { ascending: true }),
    supabase.from('maintenance_items')
      .select(`
        id, unit_id, ${LIVE_STATUS_FIELDS}, units(label),
        maintenance_templates!inner(title, ${LIVE_STATUS_TEMPLATE_FIELDS})
      `)
      .eq('residence_id', id)
      .neq('status', 'completata')
      .order('next_due_date', { ascending: true, nullsFirst: false }),
    supabase.from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('residence_id', id),
    supabase.from('suppliers')
      .select('id', { count: 'exact', head: true })
      .eq('residence_id', id),
    // Fascicolo: conteggio senza filtro su activation_status (piano ≠ fascicolo).
    supabase.from('completions')
      .select('id', { count: 'exact', head: true })
      .eq('residence_id', id),
    supabase.from('admin_assignments')
      .select('profiles(id, full_name, phone)')
      .eq('residence_id', id)
      .maybeSingle(),
    supabase.from('profiles')
      .select('id, full_name, phone')
      .eq('role', 'admin'),
  ])

  const { unitCount, unitsSenzaAccount, unitRows } = buildUnitSummary(unitsRaw)

  const today = todayISO()
  const { overdueItems, upcomingItems } = summarizePlan(itemsRaw, today)
  const overdueCount = overdueItems.length

  const adminProfile = (adminRaw as unknown as AdminRow)?.profiles ?? null
  const adminList = (adminListRaw ?? []) as AdminProfile[]

  const porte: Porta[] = [
    { href: `/admin/residences/${id}/units`,        icon: Users,     label: 'Unità e inviti', sub: `${unitCount} unità` },
    { href: `/admin/residences/${id}/manutenzioni`, icon: Wrench,    label: 'Manutenzioni',   ...manutenzioniSub(overdueCount) },
    { href: `/admin/residences/${id}/fascicolo`,    icon: BookOpen,  label: 'Fascicolo',      sub: completionCount ? `${completionCount} completamenti` : null },
    { href: `/admin/residences/${id}/documenti`,    icon: FileText,  label: 'Documenti',      sub: docCount ? `${docCount} file` : null },
    { href: `/admin/residences/${id}/fornitori`,    icon: Settings,  label: 'Fornitori',      sub: supplierCount ? `${supplierCount} fornitori` : null },
  ]

  return (
    <>
      <Link href="/admin/residences" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-offset-2">
        <ChevronLeft className="w-4 h-4" strokeWidth={1.6} />
        Residenze
      </Link>

      {/* Testata */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <ResidencePhotoUpload
          residenceId={id}
          initialPhotoUrl={residence.photo_url}
          title={residence.name}
          subtitle={residence.address}
        />
      </div>

      {/* Gestione — navigazione principale, subito sotto la testata */}
      <PorteNav porte={porte} className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mt-4" />

      {/* Amministratore */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden mt-8">
        <AdminBlock
          residenceId={id}
          adminProfile={adminProfile}
          availableAdmins={adminList}
          appUrl={appUrl}
        />
      </div>

      {/* Zona attenzione — solo gap di configurazione senza elemento dedicato */}
      {unitsSenzaAccount > 0 && (
        <Link
          href={`/admin/residences/${id}/units?filter=senza_account`}
          className="flex items-center gap-3 bg-semantic-amber-bg border border-semantic-amber/20 rounded-xl p-4 hover:brightness-[0.98] transition-all mt-8 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-offset-2"
        >
          <div className="w-8 h-8 rounded-full bg-semantic-amber/10 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-semantic-amber" strokeWidth={1.6} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-semantic-amber">
              Unità senza account cliente · {unitsSenzaAccount}
            </p>
            <p className="text-xs text-semantic-amber">Inviti non ancora inviati</p>
          </div>
        </Link>
      )}

      {/* Tabella unità */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-text-primary mb-3">Unità</h2>
        {unitRows.length > 0 ? (
          <UnitsSummaryTable residenceId={id} rows={unitRows} />
        ) : (
          <p className="text-sm text-neutral-500 py-6 text-center bg-surface rounded-xl border border-border">
            Nessuna unità configurata.
          </p>
        )}
      </section>

      <PlanSummarySection residenceId={id} overdueItems={overdueItems} upcomingItems={upcomingItems} today={today} />
    </>
  )
}

// Vista amministratore: stessa URL del costruttore, contenuto ridotto e sola
// lettura. Niente foto (ResidencePhotoUpload), niente AdminBlock (assegnazione
// amministratore è decisione del costruttore su se stesso), niente zona
// attenzione (punta a .../units?filter=senza_account, porta esclusa qui di
// proposito). La tabella unità resta: di quante e quali unità è fatta la
// residenza è informazione di base — ma in variante readOnly, nessuna riga
// naviga verso .../units.
async function AdminResidenceView({ id, residence }: { id: string; residence: ResidenceHeader }) {
  const supabase = await createClient()
  const today = todayISO()

  const [
    { data: unitsRaw },
    { data: itemsRaw },
    { count: docCount },
    { count: supplierCount },
    { count: completionCount },
  ] = await Promise.all([
    supabase.from('units')
      .select('id, label, floor, unit_members!left(ended_at, is_primary, profiles(full_name))')
      .eq('residence_id', id)
      .order('floor', { ascending: true, nullsFirst: false })
      .order('label', { ascending: true }),
    supabase.from('maintenance_items')
      .select(`
        id, unit_id, ${LIVE_STATUS_FIELDS}, units(label),
        maintenance_templates!inner(title, ${LIVE_STATUS_TEMPLATE_FIELDS})
      `)
      .eq('residence_id', id)
      .neq('status', 'completata')
      .order('next_due_date', { ascending: true, nullsFirst: false }),
    supabase.from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('residence_id', id),
    supabase.from('suppliers')
      .select('id', { count: 'exact', head: true })
      .eq('residence_id', id),
    supabase.from('completions')
      .select('id', { count: 'exact', head: true })
      .eq('residence_id', id),
  ])

  const { unitRows } = buildUnitSummary(unitsRaw)
  const { overdueItems, upcomingItems } = summarizePlan(itemsRaw, today)
  const overdueCount = overdueItems.length

  // NON Unità: censimento e inviti restano al costruttore (decisione presa).
  const porte: Porta[] = [
    { href: `/admin/residences/${id}/manutenzioni`, icon: Wrench,   label: 'Manutenzioni', ...manutenzioniSub(overdueCount) },
    { href: `/admin/residences/${id}/fascicolo`,    icon: BookOpen, label: 'Fascicolo',    sub: completionCount ? `${completionCount} completamenti` : null },
    { href: `/admin/residences/${id}/documenti`,    icon: FileText, label: 'Documenti',    sub: docCount ? `${docCount} file` : null },
    { href: `/admin/residences/${id}/fornitori`,    icon: Settings, label: 'Fornitori',    sub: supplierCount ? `${supplierCount} fornitori` : null },
  ]

  return (
    <>
      <Link href="/admin/manutenzioni" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-offset-2">
        <ChevronLeft className="w-4 h-4" strokeWidth={1.6} />
        Manutenzioni
      </Link>

      {/* Testata sola lettura: stesso layout di ResidencePhotoUpload (thumbnail
          96×72 + identità), senza input file né bottone salva. */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-start gap-4">
          {residence.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={residence.photo_url}
              alt=""
              className="w-24 h-[72px] rounded-xl object-cover flex-shrink-0 bg-background"
            />
          ) : (
            <div className="w-24 h-[72px] rounded-xl bg-background flex-shrink-0" aria-hidden="true" />
          )}
          <div className="flex-1 min-w-0 pt-1">
            <h1 className="font-serif text-3xl font-semibold text-text-primary text-balance">{residence.name}</h1>
            {residence.address && <p className="text-sm text-neutral-500 mt-1">{residence.address}</p>}
          </div>
        </div>
      </div>

      {/* Gestione — stesse porte del costruttore, meno Unità */}
      <PorteNav porte={porte} className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4" />

      {/* Tabella unità — sola lettura: di quante e quali unità è fatta la
          residenza è informazione di base, ma nessuna riga naviga verso
          .../units (porta esclusa per questo ruolo). */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-text-primary mb-3">Unità</h2>
        {unitRows.length > 0 ? (
          <UnitsSummaryTable residenceId={id} rows={unitRows} readOnly />
        ) : (
          <p className="text-sm text-neutral-500 py-6 text-center bg-surface rounded-xl border border-border">
            Nessuna unità configurata.
          </p>
        )}
      </section>

      <PlanSummarySection residenceId={id} overdueItems={overdueItems} upcomingItems={upcomingItems} today={today} />
    </>
  )
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// Riga del riepilogo piano. È un Link, non un div: la voce si apre dove la si
// gestisce (lamentela cliente: la riga non si poteva cliccare). Nessun elemento
// interattivo al suo interno e nessun Link antenato — il bottone "Vedi tutte le
// manutenzioni" è fratello dei contenitori di riga: niente annidamento.
function PlanSummaryRow({ href, title, unitLabel, dateLabel, dateClassName }: {
  href: string
  title: string
  unitLabel: string
  dateLabel: string | null
  dateClassName: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 p-4 hover:bg-background transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20 focus-visible:ring-inset"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{title}</p>
        <p className="text-xs text-text-secondary mt-0.5">{unitLabel}</p>
      </div>
      {dateLabel && (
        <p className={`text-xs flex-shrink-0 tabular-nums ${dateClassName}`}>{dateLabel}</p>
      )}
    </Link>
  )
}
