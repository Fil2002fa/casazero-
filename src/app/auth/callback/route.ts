import { createServerClient } from '@supabase/ssr'
import type { CookieMethodsServer } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { homePathForRole } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const cookieStore = await cookies()

    const cookieMethods: CookieMethodsServer = {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
        )
      },
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: cookieMethods }
    )

    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && user) {
      // Flusso accettazione invito: la pagina /accept creerà le associazioni
      if (next.startsWith('/welcome/')) {
        return NextResponse.redirect(`${origin}${next}`)
      }

      // Controlla se l'utente ha almeno un'associazione valida
      const { data: profile } = await supabase
        .from('profiles')
        .select('builder_id, role')
        .eq('id', user.id)
        .single()

      const hasRole =
        profile?.builder_id !== null ||
        profile?.role === 'admin' ||
        profile?.role === 'super_admin'

      if (!hasRole) {
        const { count } = await supabase
          .from('unit_members')
          .select('unit_id', { count: 'exact', head: true })
          .eq('profile_id', user.id)
          .is('ended_at', null)

        if (!count || count === 0) {
          await supabase.auth.signOut()
          return NextResponse.redirect(`${origin}/auth/login?error=no_access`)
        }
      }

      return NextResponse.redirect(`${origin}${homePathForRole(profile?.role)}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
