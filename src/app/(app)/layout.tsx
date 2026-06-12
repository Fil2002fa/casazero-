import BottomNav from '@/components/BottomNav'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let brandDark = '#04342C'
  let logoUrl: string | null = null

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('builder_id')
      .eq('id', user.id)
      .single()

    if (profile?.builder_id) {
      const { data: builder } = await supabase
        .from('builders')
        .select('primary_color, logo_url')
        .eq('id', profile.builder_id)
        .single()

      if (builder?.primary_color) brandDark = builder.primary_color
      if (builder?.logo_url) logoUrl = builder.logo_url
    }
  }

  return (
    <div
      className="min-h-svh flex flex-col"
      style={{ '--wl-brand-dark': brandDark, '--wl-logo': logoUrl ? `url(${logoUrl})` : 'none' } as React.CSSProperties}
    >
      <main className="flex-1 pb-20">{children}</main>
      <BottomNav />
    </div>
  )
}
