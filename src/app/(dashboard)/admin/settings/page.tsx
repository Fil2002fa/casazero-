import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import SettingsForm from './SettingsForm'

export default async function SettingsPage() {
  const profile = await requireRole(['super_admin'])

  const supabase = await createClient()
  const { data: builder } = await supabase
    .from('builders')
    .select('name, primary_color, contact_email, contact_phone')
    .eq('id', profile.builder_id!)
    .single()

  return (
    <SettingsForm
      initialName={builder?.name ?? ''}
      initialColor={builder?.primary_color ?? '#04342C'}
      initialEmail={builder?.contact_email ?? ''}
      initialPhone={builder?.contact_phone ?? ''}
    />
  )
}
