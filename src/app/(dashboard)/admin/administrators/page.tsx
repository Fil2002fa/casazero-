import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { requireRole } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/admin'
import type { MaintenancePriority } from '@/types/database'

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
  const today = new Date().toISOString().split('T')[0]

  // Residences for this builder
  const { data: residences } = await svc
    .from('residences')
    .select('id, name')
    .eq('builder_id', builderId)
  const residenceIds = (residences ?? []).map(r => r.id)
  if (residenceIds.length === 0) return []

  // Admin assignments — scoped to these residences (not builder-wide via profile lookup)
  const { data: assignments } = await svc
    .from('admin_assignments')
    .select('profile_id, residence_id')
    .in('residence_id', residenceIds)

  const adminIds = [...new Set((assignments ?? []).map(a => a.profile_id))]
  if (adminIds.length === 0) return []

  // Admin profiles
  const { data: adminProfiles } = await svc
    .from('profiles')
    .select('id, full_name, phone')
    .in('id', adminIds)

  // Overdue N2/N3 items — LIVE from next_due_date (NOT from status field)
  // Scoped per-residence via residenceIds, filtered to N2/N3 in JS after join
  type OverdueRaw = {
    residence_id: string
    priority: MaintenancePriority | null
    maintenance_templates: { priority: MaintenancePriority } | null
  }
  const { data: overdueRaw } = await svc
    .from('maintenance_items')
    .select('residence_id, priority, maintenance_templates(priority)')
    .in('residence_id', residenceIds)
    .neq('status', 'completata')
    .lt('next_due_date', today)
    .not('next_due_date', 'is', null)
  const overdueItems = (overdueRaw ?? []) as unknown as OverdueRaw[]

  // Count overdue per residence (N2/N3 only — N1 non contano come problemi)
  const overdueByResidence: Record<string, number> = {}
  for (const item of overdueItems) {
    const eff = item.priority ?? item.maintenance_templates?.priority
    if (eff === 'N2' || eff === 'N3') {
      overdueByResidence[item.residence_id] = (overdueByResidence[item.residence_id] ?? 0) + 1
    }
  }

  // Supplier counts per residence
  const { data: suppliers } = await svc
    .from('suppliers')
    .select('residence_id')
    .in('residence_id', residenceIds)
  const suppliersByResidence: Record<string, number> = {}
  for (const s of suppliers ?? []) {
    suppliersByResidence[s.residence_id] = (suppliersByResidence[s.residence_id] ?? 0) + 1
  }

  // Unit counts per residence
  const { data: units } = await svc
    .from('units')
    .select('residence_id')
    .in('residence_id', residenceIds)
  const unitsByResidence: Record<string, number> = {}
  for (const u of units ?? []) {
    unitsByResidence[u.residence_id] = (unitsByResidence[u.residence_id] ?? 0) + 1
  }

  // Emails from auth.users — serviceClient bypasses RLS
  const emailMap: Record<string, string | null> = {}
  await Promise.all(
    adminIds.map(async id => {
      const { data } = await svc.auth.admin.getUserById(id)
      emailMap[id] = data.user?.email ?? null
    })
  )

  // Aggregate per-admin summary
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
        return {
          id: a.residence_id,
          name: residence?.name ?? '—',
          overdueCount,
          supplierCount,
          unitCount,
          status,
        }
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

// ─── Page (data layer step — minimal rendering) ───────────────────────────────

export default async function AdministratorsPage() {
  const profile = await requireRole(['super_admin'])
  const admins = await loadAdmins(profile.builder_id!)

  const sortOrder = { red: 0, amber: 1, green: 2 } as const
  const sorted = [...admins].sort(
    (a, b) => sortOrder[a.worstStatus] - sortOrder[b.worstStatus]
  )

  return (
    <div className="p-6 space-y-6 pb-safe">
      <header>
        <p className="text-xs text-text-secondary uppercase tracking-wide">Super Admin</p>
        <h1 className="text-xl font-medium text-text-primary mt-1">Amministratori</h1>
      </header>

      <div className="bg-surface rounded-xl border border-[#E4E6E2] divide-y divide-[#E4E6E2] overflow-hidden">
        {sorted.map(admin => (
          <Link
            key={admin.profileId}
            href={`/admin/administrators/${admin.profileId}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-[#F4F3EF] transition-colors"
          >
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
              admin.worstStatus === 'red' ? 'bg-[#A32D2D]' :
              admin.worstStatus === 'amber' ? 'bg-[#854F0B]' : 'bg-[#0F6E56]'
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#20302A]">{admin.fullName ?? 'Amministratore'}</p>
              <p className="text-xs text-[#20302A]/50">
                {admin.residences.length} residenz{admin.residences.length === 1 ? 'a' : 'e'}
                {admin.totalOverdue > 0 ? ` · ${admin.totalOverdue} scadute` : ''}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#20302A]/30 flex-shrink-0" strokeWidth={1.6} />
          </Link>
        ))}
        {sorted.length === 0 && (
          <p className="px-4 py-6 text-sm text-text-secondary text-center">
            Nessun amministratore assegnato.
          </p>
        )}
      </div>
    </div>
  )
}
