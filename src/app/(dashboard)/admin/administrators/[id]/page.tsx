import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronRight, UserCheck,
  Mail, Phone, AlertTriangle, CheckCircle2,
} from 'lucide-react'
import { requireRole } from '@/lib/auth'
import { PageHeader } from '@/components/PageHeader'
import { createServiceClient } from '@/lib/supabase/admin'
import {
  overdueLive, todayISO,
  LIVE_STATUS_FIELDS, LIVE_STATUS_TEMPLATE_FIELDS,
  type LiveStatusItem,
} from '@/lib/maintenance-status'

export const metadata: Metadata = { title: 'Scheda amministratore — CasaZero' }

type Params = Promise<{ id: string }>

type OverdueItem = {
  id: string
  title: string
  nextDueDate: string
}

type ResidenceDetail = {
  id: string
  name: string
  overdueCount: number
  unitCount: number
  status: 'red' | 'amber' | 'green'
  overdueItems: OverdueItem[]
}

export default async function AdminDetailPage({ params }: { params: Params }) {
  const { id: profileId } = await params
  // Super_admin SEMPRE read-only: nessun form di completamento raggiungibile da qui
  await requireRole(['super_admin'])

  const svc = createServiceClient()
  const today = todayISO()

  // Profilo admin
  const { data: adminProfile } = await svc
    .from('profiles')
    .select('id, full_name, phone')
    .eq('id', profileId)
    .eq('role', 'admin')
    .single()

  if (!adminProfile) notFound()

  // Email da auth.users (MAI da profiles)
  const { data: authData } = await svc.auth.admin.getUserById(profileId)
  const email = authData.user?.email ?? null

  // Residenze assegnate a questo admin
  const { data: assignments } = await svc
    .from('admin_assignments')
    .select('residence_id')
    .eq('profile_id', profileId)

  const residenceIds = (assignments ?? []).map(a => a.residence_id)

  if (residenceIds.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          back={{ href: '/admin/administrators', label: 'Amministratori' }}
          title={adminProfile.full_name ?? 'Amministratore'}
        />
        <div className="bg-background rounded-xl p-6 text-center">
          <p className="text-sm text-text-primary/50">Nessuna residenza assegnata.</p>
        </div>
      </div>
    )
  }

  // Nomi residenze
  const { data: residences } = await svc
    .from('residences')
    .select('id, name')
    .in('id', residenceIds)

  // Item scaduti LIVE per queste residenze (scope esplicito = NON builder-wide)
  type OverdueRaw = LiveStatusItem & {
    id: string
    residence_id: string
    maintenance_templates: LiveStatusItem['maintenance_templates'] & { title: string }
  }
  // .lt è solo un pushdown del predicato dell'helper: la definizione resta in overdueLive
  const { data: overdueRaw } = await svc
    .from('maintenance_items')
    .select(`id, residence_id, ${LIVE_STATUS_FIELDS}, maintenance_templates!inner(title, ${LIVE_STATUS_TEMPLATE_FIELDS})`)
    .in('residence_id', residenceIds)
    .neq('status', 'completata')
    .lt('next_due_date', today)
    .order('next_due_date', { ascending: true })
  const allOverdue = overdueLive((overdueRaw ?? []) as unknown as OverdueRaw[], today)

  // Unità per residenza
  const { data: units } = await svc
    .from('units')
    .select('residence_id')
    .in('residence_id', residenceIds)
  const unitsByRes: Record<string, number> = {}
  for (const u of units ?? []) {
    unitsByRes[u.residence_id] = (unitsByRes[u.residence_id] ?? 0) + 1
  }

  // Aggrega per residenza
  const residenceDetails: ResidenceDetail[] = residenceIds.map(rid => {
    const residence = (residences ?? []).find(r => r.id === rid)
    const resOverdue = allOverdue.filter(item => item.residence_id === rid)
    const overdueCount = resOverdue.length
    const unitCount = unitsByRes[rid] ?? 0
    const status: ResidenceDetail['status'] =
      overdueCount > 0 ? 'red' :
      unitCount === 0 ? 'amber' : 'green'

    return {
      id: rid,
      name: residence?.name ?? '—',
      overdueCount,
      unitCount,
      status,
      overdueItems: resOverdue.map(item => ({
        id: item.id,
        title: item.maintenance_templates?.title ?? '—',
        // dopo overdueLive next_due_date è garantito non-null
        nextDueDate: item.next_due_date as string,
      })),
    }
  }).sort((a, b) => {
    const order = { red: 0, amber: 1, green: 2 }
    return order[a.status] - order[b.status]
  })

  const worstStatus: 'red' | 'amber' | 'green' = residenceDetails.reduce(
    (w, r) =>
      w === 'red' ? 'red' :
      r.status === 'red' ? 'red' :
      r.status === 'amber' ? 'amber' : w,
    'green' as 'red' | 'amber' | 'green'
  )

  const badge =
    worstStatus === 'red'
      ? { bg: 'bg-semantic-red-bg', text: 'text-semantic-red', label: 'Ritardo' }
      : worstStatus === 'amber'
      ? { bg: 'bg-semantic-amber-bg', text: 'text-semantic-amber', label: 'Da configurare' }
      : { bg: 'bg-brand-light', text: 'text-brand-medium', label: 'In regola' }

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: '/admin/administrators', label: 'Amministratori' }}
        title={adminProfile.full_name ?? 'Amministratore'}
      />

      {/* Identity block — pattern AdminBlock, sola lettura */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-light flex items-center justify-center flex-shrink-0">
            <UserCheck className="w-5 h-5 text-brand-medium" strokeWidth={1.6} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">
              {adminProfile.full_name ?? 'Amministratore'}
            </p>
            <p className="text-xs text-text-primary/50">Amministratore di condominio</p>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badge.bg} ${badge.text}`}>
            {badge.label}
          </span>
        </div>
        {(email || adminProfile.phone) && (
          <div className="px-4 pb-4 pt-3 space-y-1.5 border-t border-border">
            {email && (
              // Email a capo anche a metà parola, mai troncata: su telefono non c'è il
              // passaggio del mouse per leggerla intera. Icona allineata alla prima riga.
              <div className="flex items-start gap-2">
                <Mail className="w-3.5 h-3.5 text-text-primary/40 flex-shrink-0 mt-0.5" strokeWidth={1.6} />
                <span className="text-sm text-text-primary min-w-0 break-all">{email}</span>
              </div>
            )}
            {adminProfile.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-text-primary/40 flex-shrink-0" strokeWidth={1.6} />
                <span className="text-sm text-text-primary">{adminProfile.phone}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Residenze gestite */}
      <section className="space-y-3">
        <h2 className="text-[10px] font-medium text-text-primary/50 uppercase tracking-wide">
          Residenze gestite
        </h2>
        {residenceDetails.map(res => (
          <ResidenceCard key={res.id} residence={res} />
        ))}
      </section>
    </div>
  )
}

function ResidenceCard({ residence }: { residence: ResidenceDetail }) {
  const isRed = residence.status === 'red'
  const isAmber = residence.status === 'amber'
  const isGreen = residence.status === 'green'

  const accentBorder = isRed
    ? 'border-l-4 border-l-[#A32D2D]'
    : isAmber
    ? 'border-l-4 border-l-[#854F0B]'
    : ''

  return (
    <div className={`bg-white rounded-xl border border-border overflow-hidden ${accentBorder}`}>
      {/* Header riga */}
      <div className="px-4 py-3 flex items-center gap-3">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
          isRed ? 'bg-semantic-red' : isAmber ? 'bg-semantic-amber' : 'bg-brand-medium'
        }`} />
        {/* min-w-0 + break-words: un nome residenza senza spazi va a capo dentro la
            card invece di far scorrere la pagina di lato. */}
        <p className="flex-1 min-w-0 text-sm font-medium text-text-primary break-words">{residence.name}</p>
        {isGreen && (
          <CheckCircle2 className="w-4 h-4 text-brand-medium flex-shrink-0" strokeWidth={1.6} />
        )}
      </div>

      {/* Dettaglio scadute */}
      {isRed && residence.overdueItems.length > 0 && (
        <div className="px-4 pb-3 border-t border-border">
          <p className="text-xs font-medium text-semantic-red mt-2 mb-1.5">
            {residence.overdueCount} scadut{residence.overdueCount === 1 ? 'a' : 'e'}
          </p>
          <div className="space-y-1">
            {residence.overdueItems.slice(0, 4).map(item => (
              <div key={item.id} className="flex items-baseline gap-2">
                <span className="text-xs text-text-primary/30">·</span>
                <span className="text-xs text-text-primary flex-1 min-w-0 truncate">{item.title}</span>
                <span className="text-xs text-semantic-red flex-shrink-0">
                  {new Date(item.nextDueDate).toLocaleDateString('it-IT', {
                    day: 'numeric', month: 'short',
                  })}
                </span>
              </div>
            ))}
            {residence.overdueItems.length > 4 && (
              <p className="text-xs text-text-primary/40 mt-0.5">
                +{residence.overdueItems.length - 4} altre
              </p>
            )}
          </div>
        </div>
      )}

      {/* Dettaglio gap config */}
      {isAmber && (
        <div className="px-4 pb-3 border-t border-border">
          <div className="flex items-start gap-2 mt-2">
            <AlertTriangle className="w-3.5 h-3.5 text-semantic-amber flex-shrink-0 mt-0.5" strokeWidth={1.6} />
            <p className="text-xs text-semantic-amber">Nessuna unità configurata</p>
          </div>
        </div>
      )}

      {/* Footer azioni */}
      <div className={`flex items-center gap-3 px-4 py-3 ${isRed || isAmber ? 'border-t border-border' : ''}`}>
        <Link
          href={`/admin/residences/${residence.id}`}
          className="flex items-center gap-1 text-sm font-medium text-brand-dark hover:underline"
        >
          Vai alla residenza
          <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.6} />
        </Link>
      </div>
    </div>
  )
}
