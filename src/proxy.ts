 

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { computeDashboardGate, isBlockedAllowedPath, GATE_HEADER, type DashboardGate } from './lib/dashboardGate'

// ============================================================================
// src/proxy.ts
// ----------------------------------------------------------------------------
// Proxy de Next.js 16 (convención que sustituye a middleware.ts): control de
// sesión, redireccionamientos y pase para los bots sociales.
//
// No debe existir src/middleware.ts junto a este archivo: Next.js lo usaría y
// mostraría la advertencia de compilación.
//
// También decide en el servidor el acceso a /dashboard/* según la suscripción
// (ver lib/dashboardGate.ts).
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

  const pathname = request.nextUrl.pathname
  const isDashboard = pathname === '/dashboard' || pathname.startsWith('/dashboard/')

  if (!user && isDashboard) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (!user || !isDashboard) {
    // El header del gate solo lo pone este proxy: nunca aceptar uno del cliente.
    if (request.headers.has(GATE_HEADER)) return nextWithGate(request, response, null)
    return response
  }

  const gate = await resolveDashboardGate(supabase, user.id)

  if (gate === 'wizard' && pathname !== '/dashboard') {
    return redirectKeepingCookies(new URL('/dashboard', request.url), response)
  }
  if (gate === 'blocked' && !isBlockedAllowedPath(pathname)) {
    return redirectKeepingCookies(new URL('/dashboard/plans', request.url), response)
  }

  return nextWithGate(request, response, gate)
}

type ServerSupabase = ReturnType<typeof createServerClient>

// Ante cualquier error devuelve 'ok' (mismo criterio que antes: los overlays
// del cliente siguen como respaldo) para no dejar sin dashboard a quien paga.
async function resolveDashboardGate(supabase: ServerSupabase, userId: string): Promise<DashboardGate> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', userId)
      .maybeSingle()
    if (!profile?.company_id) return 'ok'

    const { data: company, error } = await supabase
      .from('companies')
      .select('onboarding_completed, subscription_status, trial_ends_at, stripe_subscription_id')
      .eq('id', profile.company_id)
      .maybeSingle()
    if (error || !company) return 'ok'

    let hasPrimaryTemplate = true
    if (!company.onboarding_completed) {
      const { data: ct } = await supabase
        .from('company_templates')
        .select('id')
        .eq('company_id', profile.company_id)
        .eq('is_primary', true)
        .limit(1)
      hasPrimaryTemplate = !!(ct && ct.length > 0)
    }

    return computeDashboardGate(company, hasPrimaryTemplate)
  } catch (e) {
    console.error('[proxy] No se pudo calcular el acceso al dashboard:', e)
    return 'ok'
  }
}

// Pasa el gate al layout como header de la petición, conservando las cookies
// de sesión que Supabase haya refrescado en `response`.
function nextWithGate(request: NextRequest, response: NextResponse, gate: DashboardGate | null) {
  const headers = new Headers(request.headers)
  if (gate) headers.set(GATE_HEADER, gate)
  else headers.delete(GATE_HEADER)
  const next = NextResponse.next({ request: { headers } })
  response.cookies.getAll().forEach(c => next.cookies.set(c))
  return next
}

function redirectKeepingCookies(url: URL, response: NextResponse) {
  const redirect = NextResponse.redirect(url)
  response.cookies.getAll().forEach(c => redirect.cookies.set(c))
  return redirect
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
