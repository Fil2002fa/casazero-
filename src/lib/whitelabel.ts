import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'

export interface WhitelabelBrand {
  brandDark: string
  logoUrl: string | null
  builderName: string
}

export async function getWhitelabelBrand(): Promise<WhitelabelBrand> {
  const DEFAULT: WhitelabelBrand = { brandDark: '#04342C', logoUrl: null, builderName: 'CasaZero' }

  // Riusa il profilo cache-ato per request (src/lib/auth.ts): niente
  // auth.getUser() né query profiles duplicate rispetto a layout/page.
  const profile = await getProfile()
  if (!profile?.builder_id) return DEFAULT

  const supabase = await createClient()

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
