import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { UnitsManager } from './UnitsManager'

export const metadata: Metadata = { title: 'Unità e inviti' }

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ filter?: string }>

type UnitRow = {
  id: string
  label: string
  floor: number | null
  members: { profile_id: string; is_primary: boolean; profiles: { full_name: string | null } | null }[]
  rawMembers: { ended_at: string | null }[]
  invites: { id: string; token: string; expires_at: string; used_at: string | null }[]
}

export default async function UnitsPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id: residenceId } = await params
  const { filter } = await searchParams
  await requireRole(['super_admin'], '/admin/manutenzioni')
  const supabase = await createClient()

  const { data: residence } = await supabase
    .from('residences')
    .select('id, name')
    .eq('id', residenceId)
    .single()

  if (!residence) notFound()

  const { data: rawUnitsAll } = await supabase
    .from('units')
    .select(`
      id, label, floor,
      unit_members(profile_id, is_primary, ended_at, profiles(full_name)),
      invites(id, token, expires_at, used_at)
    `)
    .eq('residence_id', residenceId)
    .order('floor', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const units: UnitRow[] = (rawUnitsAll ?? []).map((u) => {
    const rawMembersAll = (u.unit_members as unknown as { profile_id: string; is_primary: boolean; ended_at: string | null; profiles: { full_name: string | null } | null }[]) ?? []
    const members = rawMembersAll
      .filter(m => !m.ended_at)
      .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
    const invites = (u.invites as unknown as { id: string; token: string; expires_at: string; used_at: string | null }[]) ?? []

    return {
      id: u.id,
      label: u.label,
      floor: u.floor,
      members: members as UnitRow['members'],
      rawMembers: rawMembersAll,
      invites,
    }
  })

  return (
    <>
      <PageHeader
        back={{ href: `/admin/residences/${residenceId}`, label: residence.name }}
        title="Unità e inviti"
        className="mb-6"
      />

      <UnitsManager
        residenceId={residenceId}
        units={units}
        appUrl={appUrl}
        initialFilter={filter}
      />
    </>
  )
}
