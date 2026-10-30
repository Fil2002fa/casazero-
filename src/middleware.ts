import { createServerClient } from '@supabase/ssr'
import type { CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { safeNextPath } from '@/lib/safe-next-path'

type CookieToSet = { name: string; value: string; options: CookieOptions }

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(
              name,
              value,
              options as Parameters<typeof supabaseResponse.cookies.set>[2]
            )
          )
        },
      },
    }
  )

  // Refresh session — must not run getSession() before getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname, searchParams } = request.nextUrl

  // Errore di accesso restituito da Supabase: arriva sulla callback oppure,
  // se l'URL di ritorno non e' tra le Redirect URLs, sul Site URL (`/`). Va
  // mostrato su qualunque percorso, mai ignorato: con una sessione gia' aperta
  // la pagina richiesta si aprirebbe con l'account precedente, senza avviso.
  // `error_code`, o `error` insieme a `error_description`, sono la forma di
  // Supabase; `/auth/login?error=no_access` (solo `error`) e' nostro e passa.
  const authErrorCode = searchParams.get('error_code')
  const isSupabaseAuthError =
    authErrorCode !== null || (searchParams.has('error') && searchParams.has('error_description'))
  if (isSupabaseAuthError && pathname !== '/auth/error') {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/error'
    url.search = ''
    url.searchParams.set('reason', authErrorCode ?? searchParams.get('error') ?? 'unknown')
    return NextResponse.redirect(url)
  }

  const isPublicPath =
    pathname.startsWith('/auth') ||
    pathname.startsWith('/welcome') ||
    pathname === '/offline.html'

  // Codice di accesso arrivato fuori dalla callback: succede quando l'URL di
  // ritorno non e' tra le Redirect URLs (es. un URL di deploy Vercel) e
  // Supabase ripiega sul Site URL, consegnando `?code=` su `/`. Senza questa
  // regola `/` e' protetta, il login lo rimanda a /auth/login e il codice non
  // viene mai scambiato. Lo si porta alla callback, che lo scambia o mostra
  // l'errore; solo `code` e `next`, il resto dell'URL non serve.
  const strayCode = searchParams.get('code')
  if (!user && strayCode && pathname !== '/auth/callback') {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/callback'
    url.search = ''
    url.searchParams.set('code', strayCode)
    const next = searchParams.get('next')
    if (next) url.searchParams.set('next', next)
    return NextResponse.redirect(url)
  }

  if (!user && !isPublicPath) {
    // Il percorso richiesto va conservato, non buttato: i link delle email
    // (sollecito, cron) puntano a una voce precisa e chi li apre di norma non
    // ha una sessione attiva. Senza `next` il login atterra sulla home del
    // ruolo e il deep link è perso per sempre.
    const requested = safeNextPath(`${pathname}${request.nextUrl.search}`)
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.search = ''
    if (requested && requested !== '/') url.searchParams.set('next', requested)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
