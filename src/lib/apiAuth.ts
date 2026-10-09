// Autenticación de las rutas de la API que actúan sobre la empresa del usuario.
// /api/* no pasa por el gate de /dashboard (proxy.ts), así que cada ruta que
// gasta dinero o toca canales debe llamar a requireActiveCompany().

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { hasDashboardAccess } from './subscription'

type ServerSupabase = ReturnType<typeof createServerClient>

export type CompanyAuth =
  | { ok: true; supabase: ServerSupabase; userId: string; companyId: string }
  | { ok: false; response: NextResponse }

async function sessionClient(): Promise<ServerSupabase> {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  )
}

function fail(status: number, error: string): CompanyAuth {
  return { ok: false, response: NextResponse.json({ success: false, error }, { status }) }
}

/**
 * Sesión válida + empresa con suscripción viva (misma regla que el dashboard:
 * trialing, active o past_due dentro de la gracia). Los administradores de
 * plataforma pasan siempre.
 */
export async function requireActiveCompany(): Promise<CompanyAuth> {
  const supabase = await sessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail(401, 'No autenticado')

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .maybeSingle()
  const companyId: string | undefined = profile?.company_id
  if (!companyId) return fail(400, 'Tu usuario no tiene empresa asignada')

  const subscriptionError = await activeSubscriptionError(supabase, companyId)
  if (subscriptionError) return fail(402, subscriptionError)

  return { ok: true, supabase, userId: user.id, companyId }
}

export const INACTIVE_SUBSCRIPTION_ERROR = 'Tu suscripción no está activa. Revisa tu plan en Mi Plan.'

/**
 * Para rutas que ya tienen su cliente de sesión y su companyId: devuelve el
 * mensaje de error si la empresa no tiene suscripción viva, o null si puede
 * seguir. Los administradores de plataforma pasan siempre.
 */
export async function activeSubscriptionError(supabase: ServerSupabase, companyId: string): Promise<string | null> {
  const { data: isAdmin } = await supabase.rpc('is_platform_admin')
  if (isAdmin === true) return null

  const { data: company } = await supabase
    .from('companies')
    .select('subscription_status, trial_ends_at')
    .eq('id', companyId)
    .maybeSingle()
  if (!company || !hasDashboardAccess({ status: company.subscription_status, trialEndsAt: company.trial_ends_at })) {
    return INACTIVE_SUBSCRIPTION_ERROR
  }
  return null
}

/** Sesión válida de un administrador de plataforma. */
export async function requirePlatformAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const supabase = await sessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, response: NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 }) }
  const { data: isAdmin } = await supabase.rpc('is_platform_admin')
  if (isAdmin !== true) {
    return { ok: false, response: NextResponse.json({ success: false, error: 'Solo administradores' }, { status: 403 }) }
  }
  return { ok: true, userId: user.id }
}

/** true si la URL es un archivo de nuestro Supabase Storage (evita SSRF). */
export function isOwnStorageUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '')
  return !!base && url.startsWith(`${base}/storage/v1/object/`)
}
