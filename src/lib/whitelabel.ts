import { createClient } from '@/lib/supabase/server'

export interface WhitelabelBrand {
  brandDark: string
  logoUrl: string | null
  builderName: string
}

export async function getWhitelabelBrand(): Promise<WhitelabelBrand> {
  const DEFAULT: WhitelabelBrand = { brandDark: '#04342C', logoUrl: null, builderName: 'CasaZero' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return DEFAULT

  const { data: profile } = await supabase
    .from('profiles')
    .select('builder_id')
    .eq('id', user.id)
    .single()

  if (!profile?.builder_id) return DEFAULT

  const { data: builder } = await supabase
    .from('builders')
    .select('logo_url, name')
    .eq('id', profile.builder_id)
    .single()

  return {
    // Colore brand fisso deciso da CasaZero: non più personalizzabile dal costruttore.
    brandDark: DEFAULT.brandDark,
    logoUrl: builder?.logo_url ?? null,
    builderName: builder?.name ?? DEFAULT.builderName,
  }
}
