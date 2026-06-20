import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { UnitsManager } from './UnitsManager'
import QRCode from 'qrcode'

export const metadata: Metadata = { title: 'Unità e inviti' }

type Params = Promise<{ id: string }>

type UnitRow = {
  id: string
  label: string
  floor: number | null
  members: { profile_id: string; profiles: { full_name: string | null } | null }[]
  invites: { id: string; token: string; expires_at: string; used_at: string | null }[]
}

export default async function UnitsPage({ params }: { params: Params }) {
  const { id: residenceId } = await params
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
    .order('label')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const units: (UnitRow & { qrCodes: Record<string, string> })[] = await Promise.all(
    (rawUnitsAll ?? []).map(async (u) => {
      const members = ((u.unit_members as unknown as { profile_id: string; ended_at: string | null; profiles: { full_name: string | null } | null }[]) ?? [])
        .filter(m => !m.ended_at)
      const invites = (u.invites as unknown as { id: string; token: string; expires_at: string; used_at: string | null }[]) ?? []

      // Genera QR per inviti attivi
      const qrCodes: Record<string, string> = {}
      for (const inv of invites) {
        if (!inv.used_at && new Date(inv.expires_at) > new Date()) {
          const url = `${appUrl}/welcome/${inv.token}`
          try {
            qrCodes[inv.id] = await QRCode.toDataURL(url, { width: 180, margin: 1 })
          } catch {
            // QR generation failed, skip
          }
        }
      }

      return {
        id: u.id,
        label: u.label,
        floor: u.floor,
        members: members as UnitRow['members'],
        invites,
        qrCodes,
      }
    })
  )

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="bg-surface border-b border-border px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href={`/admin/residences/${residenceId}`} className="text-text-secondary p-1 -ml-1 rounded-lg">
          <ChevronLeft className="w-5 h-5" strokeWidth={1.6} />
        </Link>
        <div>
          <h1 className="text-base font-medium text-text-primary">Unità e inviti</h1>
          <p className="text-xs text-text-secondary">{residence.name}</p>
        </div>
      </div>

      <div className="p-4">
        <UnitsManager
          residenceId={residenceId}
          units={units}
          appUrl={appUrl}
        />
      </div>
    </div>
  )
}
