 

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ============================================================================
// src/proxy.ts
// ----------------------------------------------------------------------------
// Migración del antiguo src/middleware.ts a la convención "proxy" de Next.js 16.
// La lógica es idéntica: mismo control de sesión, mismos redireccionamientos y
// el mismo pase para los bots sociales. Solo cambia el nombre del archivo y el
// de la función exportada, que es lo que pedía la advertencia de compilación.
//
// IMPORTANTE: al aplicar este archivo hay que ELIMINAR src/middleware.ts, o
// Next.js seguirá usando el antiguo y volverá a mostrar la advertencia.
// ============================================================================

export async function proxy(request: NextRequest) {
  // Pase VIP para bots sociales (evita 403 cuando comparten links)
  const userAgent = request.headers.get('user-agent') || ''
  const isSocialBot = /facebookexternalhit|WhatsApp|Twitterbot|LinkedInBot|TelegramBot|Slackbot/i.test(userAgent)

  if (isSocialBot) {
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isPublicRoute = request.nextUrl.pathname === '/' || request.nextUrl.pathname === '/login'

  if (user && isPublicRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
