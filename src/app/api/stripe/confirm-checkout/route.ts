import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { stripe } from '../../../../lib/stripe'
import { applyPlanSubscription } from '../../../../lib/stripePlan'

// ============================================================================
// POST /api/stripe/confirm-checkout   body: { sessionId }
// ----------------------------------------------------------------------------
// Al regresar de Stripe Checkout, el usuario puede llegar ANTES que el webhook
// checkout.session.completed. Esta ruta le pregunta a Stripe por la sesión y,
// si la suscripción ya existe, escribe el mismo estado que escribiría el
// webhook (lib/stripePlan.ts). Es idempotente: si el webhook ya llegó, no
// cambia nada. Flujo: paso 5 del onboarding → Stripe → dashboard.
//
// Seguridad: el estado sale de Stripe, no del navegador; y la sesión tiene que
// pertenecer a la empresa del usuario autenticado.
// ============================================================================

export async function POST(req: Request) {
  try {
    const { sessionId } = await req.json()
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
      return NextResponse.json({ error: 'sessionId inválido' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n: string) => cookieStore.get(n)?.value } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()
    if (!profile?.company_id) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 })

    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.metadata?.companyId !== profile.company_id || session.metadata?.checkoutType !== 'plan') {
      return NextResponse.json({ error: 'La sesión no corresponde a tu cuenta' }, { status: 403 })
    }
    if (session.status !== 'complete' || !session.subscription) {
      return NextResponse.json({ ok: false, status: session.status }, { status: 202 })
    }

    const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
    const sub = await stripe.subscriptions.retrieve(subId)

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { normalized, planSlug } = await applyPlanSubscription(admin, sub, {
      companyId: profile.company_id,
      markStarted: true,
    })

    return NextResponse.json({ ok: true, subscription_status: normalized, plan_slug: planSlug })
  } catch (error) {
    console.error('[Stripe confirm-checkout] Error:', error)
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
