import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { requireRole } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/admin'
import {
  overdueLive, todayISO,
  LIVE_STATUS_FIELDS, LIVE_STATUS_TEMPLATE_FIELDS,
  type LiveStatusItem,
} from '@/lib/maintenance-status'

export const metadata: Metadata = { title: 'Amministratori — CasaZero' }

// ─── Types ────────────────────────────────────────────────────────────────────

export type ResidenceStatus = {
  id: string
  name: string
  overdueCount: number
  supplierCount: number
  unitCount: number
  status: 'red' | 'amber' | 'green'
}

export type AdminSummary = {
  profileId: string
  fullName: string | null
  email: string | null
  phone: string | null
  residences: ResidenceStatus[]
  worstStatus: 'red' | 'amber' | 'green'
  totalOverdue: number
}

// ─── Data layer ───────────────────────────────────────────────────────────────

async function loadAdmins(builderId: string): Promise<AdminSummary[]> {
  const svc = createServiceClient()
  const today = todayISO()

  const { data: residences } = await svc
    .from('residences')
    .select('id, name')
    .eq('builder_id', builderId)
  const residenceIds = (residences ?? []).map(r => r.id)
  if (residenceIds.length === 0) return []

  const { data: assignments } = await svc
    .from('admin_assignments')
    .select('profile_id, residence_id')
    .in('residence_id', residenceIds)

  const adminIds = [...new Set((assignments ?? []).map(a => a.profile_id))]
  if (adminIds.length === 0) return []

  const { data: adminProfiles } = await svc
    .from('profiles')
    .select('id, full_name, phone')
    .in('id', adminIds)

  type OverdueRaw = LiveStatusItem & { residence_id: string }
  // .lt è solo un pushdown del predicato dell'helper: la definizione resta in overdueLive
  const { data: overdueRaw } = await svc
    .from('maintenance_items')
    .select(`residence_id, ${LIVE_STATUS_FIELDS}, maintenance_templates!inner(${LIVE_STATUS_TEMPLATE_FIELDS})`)
    .in('residence_id', residenceIds)
    .neq('status', 'completata')
    .lt('next_due_date', today)
  const overdueItems = overdueLive((overdueRaw ?? []) as unknown as OverdueRaw[], today)

  const overdueByResidence: Record<string, number> = {}
  for (const item of overdueItems) {
    overdueByResidence[item.residence_id] = (overdueByResidence[item.residence_id] ?? 0) + 1
  }

  const { data: suppliers } = await svc
    .from('suppliers')
    .select('residence_id')
    .in('residence_id', residenceIds)
  const suppliersByResidence: Record<string, number> = {}
  for (const s of suppliers ?? []) {
    suppliersByResidence[s.residence_id] = (suppliersByResidence[s.residence_id] ?? 0) + 1
  }

  const { data: units } = await svc
    .from('units')
    .select('residence_id')
    .in('residence_id', residenceIds)
  const unitsByResidence: Record<string, number> = {}
  for (const u of units ?? []) {
    unitsByResidence[u.residence_id] = (unitsByResidence[u.residence_id] ?? 0) + 1
  }

  const emailMap: Record<string, string | null> = {}
  await Promise.all(
    adminIds.map(async id => {
      const { data } = await svc.auth.admin.getUserById(id)
      emailMap[id] = data.user?.email ?? null
    })
  )

  return adminIds.map(adminId => {
    const profile = (adminProfiles ?? []).find(p => p.id === adminId)

    const residenceStatuses: ResidenceStatus[] = (assignments ?? [])
      .filter(a => a.profile_id === adminId)
      .map(a => {
        const residence = (residences ?? []).find(r => r.id === a.residence_id)
        const overdueCount = overdueByResidence[a.residence_id] ?? 0
        const supplierCount = suppliersByResidence[a.residence_id] ?? 0
        const unitCount = unitsByResidence[a.residence_id] ?? 0
        const status: ResidenceStatus['status'] =
          overdueCount > 0 ? 'red' :
          supplierCount === 0 || unitCount === 0 ? 'amber' : 'green'
        return { id: a.residence_id, name: residence?.name ?? '—', overdueCount, supplierCount, unitCount, status }
      })

    const worstStatus: AdminSummary['worstStatus'] = residenceStatuses.reduce(
      (w, r) =>
        w === 'red' ? 'red' :
        r.status === 'red' ? 'red' :
        r.status === 'amber' ? 'amber' : w,
      'green' as AdminSummary['worstStatus']
    )

    return {
      profileId: adminId,
      fullName: profile?.full_name ?? null,
      email: emailMap[adminId] ?? null,
      phone: profile?.phone ?? null,
      residences: residenceStatuses,
      worstStatus,
      totalOverdue: residenceStatuses.reduce((sum, r) => sum + r.overdueCount, 0),
    }
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdministratorsPage() {
  const profile = await requireRole(['super_admin'])
  const admins = await loadAdmins(profile.builder_id!)

  const sortOrder = { red: 0, amber: 1, green: 2 } as const
  const sorted = [...admins].sort(
    (a, b) => sortOrder[a.worstStatus] - sortOrder[b.worstStatus]
  )
  const needsAttention = sorted.filter(a => a.worstStatus !== 'green')

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-medium text-text-primary">Amministratori</h1>
      </header>

      {/* Zona A — Attenzione */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-[#20302A]">
          {needsAttention.length === 0
            ? 'Tutto in regola'
            : `${needsAttention.length} ${needsAttention.length === 1 ? 'amministratore richiede' : 'amministratori richiedono'} attenzione`}
        </h2>
        {needsAttention.length === 0 ? (
          <div className="bg-[#E1F5EE] rounded-xl p-4 flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0F6E56] flex-shrink-0" />
            <p className="text-sm text-[#04342C]">Nessuna azione richiesta al momento.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {needsAttention.map(admin => (
              <AttentionCard key={admin.profileId} admin={admin} />
            ))}
          </div>
        )}
      </section>

      {/* Zona B — Tutti gli amministratori */}
      <section className="space-y-2">
        <h2 className="text-[10px] font-medium text-[#20302A]/50 uppercase tracking-wide">
          Tutti gli amministratori
        </h2>
        <div className="bg-white rounded-xl border border-[#E4E6E2] divide-y divide-[#E4E6E2] overflow-hidden">
          {sorted.map(admin => (
            <RosterRow key={admin.profileId} admin={admin} />
          ))}
          {sorted.length === 0 && (
            <p className="px-4 py-6 text-sm text-[#20302A]/50 text-center">
              Nessun amministratore assegnato.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

// ─── Componenti ───────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: 'red' | 'amber' | 'green' }) {
  return (
    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
      status === 'red' ? 'bg-[#A32D2D]' :
      status === 'amber' ? 'bg-[#854F0B]' : 'bg-[#0F6E56]'
    }`} />
  )
}

function AttentionCard({ admin }: { admin: AdminSummary }) {
  const isRed = admin.worstStatus === 'red'
  const accentBorder = isRed ? 'border-l-[#A32D2D]' : 'border-l-[#854F0B]'
  const bg = isRed ? 'bg-[#FCEBEB]' : 'bg-[#FAEEDA]'
  const textPrimary = isRed ? 'text-[#A32D2D]' : 'text-[#854F0B]'
  const textSecondary = isRed ? 'text-[#A32D2D]/70' : 'text-[#854F0B]/70'

  const issueLines: string[] = []
  for (const r of admin.residences) {
    if (r.status === 'red') {
      issueLines.push(`${r.overdueCount} scadut${r.overdueCount === 1 ? 'a' : 'e'} · ${r.name}`)
    } else if (r.status === 'amber') {
      const gaps: string[] = []
      if (r.supplierCount === 0) gaps.push('nessun fornitore')
      if (r.unitCount === 0) gaps.push('nessuna unità')
      issueLines.push(`${gaps.join(', ')} · ${r.name}`)
    }
  }

  return (
    <Link
      href={`/admin/administrators/${admin.profileId}`}
      className={`flex items-start gap-3 p-4 ${bg} rounded-xl border border-[#E4E6E2] border-l-4 ${accentBorder} hover:brightness-[0.97] transition-all`}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${textPrimary}`}>
          {admin.fullName ?? 'Amministratore'}
        </p>
        {admin.email && (
          <p className={`text-xs ${textSecondary} mt-0.5 truncate`}>{admin.email}</p>
        )}
        <div className="mt-1.5 space-y-0.5">
          {issueLines.map((line, i) => (
            <p key={i} className={`text-xs ${textSecondary}`}>· {line}</p>
          ))}
        </div>
      </div>
      <ChevronRight className={`w-4 h-4 ${textSecondary} flex-shrink-0 mt-0.5`} strokeWidth={1.6} />
    </Link>
  )
}

function RosterRow({ admin }: { admin: AdminSummary }) {
  const residenceNames = admin.residences.map(r => r.name).join(', ')
  return (
    <Link
      href={`/admin/administrators/${admin.profileId}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-[#F4F3EF] transition-colors"
    >
      <StatusDot status={admin.worstStatus} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#20302A]">{admin.fullName ?? 'Amministratore'}</p>
        <p className="text-xs text-[#20302A]/50 truncate">{residenceNames}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-[#20302A]/30 flex-shrink-0" strokeWidth={1.6} />
    </Link>
  )
}
