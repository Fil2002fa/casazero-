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

  const { pathname } = request.nextUrl
  const isPublicPath =
    pathname.startsWith('/auth') ||
    pathname.startsWith('/welcome') ||
    pathname === '/offline.html'

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
