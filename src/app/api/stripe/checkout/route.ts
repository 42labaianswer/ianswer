import { NextResponse } from 'next/server'
import { stripe } from '../../../../lib/stripe'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getAppBaseUrl } from '../../../../lib/appUrl'

// ============================================================================
// POST /api/stripe/checkout
// ----------------------------------------------------------------------------
// Crea una sesión de Stripe Checkout para suscribirse a un plan (Start, Growth
// o Scale). Maneja:
//   - Cliente nuevo en Stripe si no existe (con español como idioma preferido)
//   - Auto-reparación si el cliente fue borrado de Stripe
//   - Soporte para billing mensual o anual
//   - returnTo: 'wizard' (paso 5 del onboarding) o 'plans' (/dashboard/plans)
//
// Cambios plan-agente-semana04 (sección 4):
//   - La prueba gratuita PIDE TARJETA (decisión de Rubén/Roy; ver términos).
//     Antes usaba payment_method_collection 'if_required' → sin tarjeta, al
//     terminar la prueba no había con qué cobrar.
//   - La prueba se da una sola vez por empresa (antes una empresa en 'trialing'
//     podía volver a hacer checkout y recibir otros 7 días).
//   - Si ya hay una suscripción viva, no se crea otra (se cobraría doble):
//     los cambios de plan van por el portal de Stripe.
//   - Checkout en español (locale es-419).
// ============================================================================

const LIVE_STATUSES = ['trialing', 'active', 'past_due']

export async function POST(req: Request) {
  try {
    const { priceId, companyId, planSlug, billingMode, returnTo } = await req.json()
    const origin = req.headers.get('origin') || getAppBaseUrl()

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value }
        }
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // El companyId viene del navegador: tiene que ser la empresa del usuario.
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()
    if (!profile?.company_id || profile.company_id !== companyId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { data: company } = await supabase
      .from('companies')
      .select('stripe_customer_id, stripe_subscription_id, subscription_started_at, contact_email, name, subscription_status, trial_ends_at')
      .eq('id', companyId)
      .single()

    if (!company) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    }

    if (company.stripe_subscription_id && LIVE_STATUSES.includes(company.subscription_status || '')) {
      return NextResponse.json({
        error: 'Ya tienes una suscripción activa. Para cambiar de plan usa "Gestionar suscripción".',
        code: 'subscription_exists'
      }, { status: 409 })
    }

    // ── Plan: días de prueba ────────────────────────────────────────────────
    const { data: plan } = await supabase
      .from('plans')
      .select('slug, trial_days')
      .eq('slug', planSlug)
      .maybeSingle()

    if (!plan) {
      return NextResponse.json({ error: 'Plan no encontrado' }, { status: 400 })
    }

    // Prueba solo si la empresa nunca tuvo una suscripción de Stripe.
    const neverSubscribed = !company.stripe_subscription_id && !company.subscription_started_at
    const trialDays = neverSubscribed ? (plan.trial_days ?? 7) : 0

    const fromWizard = returnTo === 'wizard'
    const successUrl = fromWizard
      ? `${origin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`
      : `${origin}/dashboard/plans?success=true&plan=${planSlug}&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = fromWizard
      ? `${origin}/dashboard?checkout=canceled`
      : `${origin}/dashboard/plans?canceled=true`

    let customerId = company.stripe_customer_id

    const createCustomer = async () => {
      const customer = await stripe.customers.create({
        email: company.contact_email || user.email,
        name: company.name || undefined,
        preferred_locales: ['es-419'],
        metadata: { companyId }
      })
      // Con service_role: con la sesión del usuario la escritura podía fallar
      // en silencio (RLS) y el siguiente checkout creaba un cliente duplicado,
      // dejando el portal apuntando a la suscripción vieja. El webhook también
      // lo reescribe desde la suscripción (lib/stripePlan.ts).
      const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      const { error: saveErr } = await admin
        .from('companies')
        .update({ stripe_customer_id: customer.id })
        .eq('id', companyId)
      if (saveErr) console.error('[Stripe Checkout Plan] No se pudo guardar stripe_customer_id:', saveErr)
      return customer.id
    }

    const createStripeSession = async (cId: string) => {
      return await stripe.checkout.sessions.create({
        customer: cId,
        mode: 'subscription',
        locale: 'es-419',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: {
          companyId,
          planSlug,
          billingMode: billingMode || 'monthly',
          checkoutType: 'plan'
        },
        subscription_data: {
          metadata: {
            companyId,
            planSlug,
            checkoutType: 'plan'
          },
          ...(trialDays > 0 ? { trial_period_days: trialDays } : {})
        },
        success_url: successUrl,
        cancel_url: cancelUrl
      })
    }

    let session
    try {
      if (!customerId) customerId = await createCustomer()
      session = await createStripeSession(customerId)
    } catch (stripeError: any) {
      // Auto-reparación: cliente borrado en Stripe
      if (stripeError.code === 'resource_missing' && stripeError.message?.includes('No such customer')) {
        customerId = await createCustomer()
        session = await createStripeSession(customerId)
      } else {
        throw stripeError
      }
    }

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[Stripe Checkout Plan] Error:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
