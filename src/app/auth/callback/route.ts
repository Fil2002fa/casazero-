import { createServerClient } from '@supabase/ssr'
import type { CookieMethodsServer } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { homePathForRole } from '@/lib/auth'
import { safeNextPath } from '@/lib/safe-next-path'

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
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('builder_id, role')
        .eq('id', user.id)
        .single()

      if (profileError) {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/auth/login?error=no_access`)
      }

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

      // Il deep link conservato dal middleware vince sulla home del ruolo: chi
      // ha aperto il link di un'email deve atterrare sulla voce, non sulla
      // lista. `safeNextPath` è il filtro contro l'open redirect — `next`
      // arriva dalla query string, quindi dall'esterno.
      const safeNext = safeNextPath(next)
      if (safeNext && safeNext !== '/') {
        return NextResponse.redirect(`${origin}${safeNext}`)
      }

      return NextResponse.redirect(`${origin}${homePathForRole(profile?.role)}`)
    }

    // Scambio fallito: la sessione precedente, se c'e', resta aperta. La
    // pagina d'errore lo dice e offre il logout; chiuderla qui farebbe uscire
    // chiunque per un link aperto due volte.
    console.error('auth/callback: exchangeCodeForSession', { code: error?.code, error })
    return authErrorRedirect(origin, error?.code ?? 'exchange_failed')
  }

  // Senza code: errore di Supabase in query (di norma lo intercetta gia' il
  // middleware) oppure URL incompleto.
  return authErrorRedirect(origin, searchParams.get('error_code') ?? searchParams.get('error') ?? 'missing_code')
}

// `reason` e' solo una chiave: la pagina la confronta con un elenco noto e non
// la mostra mai cosi' com'e'.
function authErrorRedirect(origin: string, reason: string) {
  const url = new URL('/auth/error', origin)
  url.searchParams.set('reason', reason)
  return NextResponse.redirect(url)
}
