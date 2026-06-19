import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { ProfiloClient } from './ProfiloClient'
import QRCode from 'qrcode'
import { DEFAULT_NOTIFICATION_PREFS } from '@/types/database'
import type { NotificationPrefs } from '@/types/database'

export const metadata: Metadata = { title: 'Profilo' }

export default async function ProfiloPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone, role, notification_prefs')
    .eq('id', user.id)
    .single()

  const admin = createServiceClient()

  // Unità e residenza dell'utente (prima memberhip attiva)
  const { data: membershipRaw } = await admin
    .from('unit_members')
    .select('unit_id, units(id, label, residence_id, residences(name, address))')
    .eq('profile_id', user.id)
    .is('ended_at', null)
    .limit(1)
    .single()

  type MembershipRaw = {
    unit_id: string
    units: { id: string; label: string; residence_id: string; residences: { name: string; address: string | null } | null } | null
  }
  const membership = membershipRaw as unknown as MembershipRaw | null

  const unit = membership?.units
    ? {
        id: membership.units.id,
        label: membership.units.label,
        residence_id: membership.units.residence_id,
        residence_name: membership.units.residences?.name ?? '',
        address: membership.units.residences?.address ?? null,
      }
    : null

  // Altri membri dell'unità (escluso l'utente corrente)
  type OtherMemberRaw = { profile_id: string; profiles: { full_name: string | null } | null }
  let members: { profile_id: string; full_name: string | null }[] = []
  if (unit) {
    const { data: rawMembers } = await admin
      .from('unit_members')
      .select('profile_id, profiles(full_name)')
      .eq('unit_id', unit.id)
      .is('ended_at', null)
      .neq('profile_id', user.id)

    members = ((rawMembers ?? []) as unknown as OtherMemberRaw[]).map(m => ({
      profile_id: m.profile_id,
      full_name: m.profiles?.full_name ?? null,
    }))
  }

  // Inviti attivi per l'unità (non usati e non scaduti)
  type InviteRaw = { id: string; token: string; expires_at: string }
  let invitesWithQR: { id: string; token: string; expires_at: string; qrCode: string }[] = []
  if (unit) {
    const now = new Date().toISOString()
    const { data: rawInvites } = await admin
      .from('invites')
      .select('id, token, expires_at')
      .eq('unit_id', unit.id)
      .is('used_at', null)
      .gt('expires_at', now)
      .order('expires_at', { ascending: true })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    invitesWithQR = await Promise.all(
      ((rawInvites ?? []) as unknown as InviteRaw[]).map(async inv => {
        let qrCode = ''
        try {
          qrCode = await QRCode.toDataURL(`${appUrl}/welcome/${inv.token}`, { width: 180, margin: 1 })
        } catch { /* skip */ }
        return { id: inv.id, token: inv.token, expires_at: inv.expires_at, qrCode }
      })
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const notifPrefs: NotificationPrefs = {
    ...DEFAULT_NOTIFICATION_PREFS,
    ...(profile?.notification_prefs as Partial<NotificationPrefs> ?? {}),
  }

  return (
    <ProfiloClient
      email={user.email ?? ''}
      fullName={profile?.full_name ?? null}
      phone={profile?.phone ?? null}
      role={profile?.role ?? 'client'}
      unit={unit}
      members={members}
      invites={invitesWithQR}
      appUrl={appUrl}
      notifPrefs={notifPrefs}
    />
  )
}
