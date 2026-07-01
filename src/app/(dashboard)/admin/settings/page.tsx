import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import SettingsShell from './SettingsShell'
import { DEFAULT_ADMIN_NOTIFICATION_PREFS } from '@/types/database'
import type { AdminNotificationPrefs } from '@/types/database'

export default async function SettingsPage() {
  const profile = await requireRole(['super_admin'])

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: builder } = await supabase
    .from('builders')
    .select('name, logo_url')
    .eq('id', profile.builder_id!)
    .single()

  const { data: account } = await supabase
    .from('profiles')
    .select('full_name, notification_prefs')
    .eq('id', user!.id)
    .single()

  const notifPrefs: AdminNotificationPrefs = {
    ...DEFAULT_ADMIN_NOTIFICATION_PREFS,
    ...(account?.notification_prefs as Partial<AdminNotificationPrefs> ?? {}),
  }

  return (
    <SettingsShell
      builderName={builder?.name ?? ''}
      builderLogoUrl={builder?.logo_url ?? null}
      accountName={account?.full_name ?? ''}
      accountEmail={user?.email ?? ''}
      notifPrefs={notifPrefs}
    />
  )
}
