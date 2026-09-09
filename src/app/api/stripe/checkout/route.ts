 

import { NextResponse } from 'next/server'
import { stripe } from '../../../../lib/stripe'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ============================================================================
// POST /api/stripe/checkout
// ----------------------------------------------------------------------------
// Crea una sesión de Stripe Checkout para suscribirse a un plan (Start, Growth
// o Scale). Maneja:
//   - Cliente nuevo en Stripe si no existe
//   - Auto-reparación si el cliente fue borrado de Stripe
//   - Soporte para billing mensual o anual
// ============================================================================

export async function POST(req: Request) {
  try {
    const { priceId, companyId, planSlug, billingMode } = await req.json()
    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

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

    const { data: company } = await supabase
      .from('companies')
      .select('stripe_customer_id, contact_email, name, subscription_status, trial_ends_at')
      .eq('id', companyId)
      .single()

    // ── Cargar el plan para saber cuántos días de trial dar ─────────────────
    const { data: plan } = await supabase
      .from('plans')
      .select('slug, trial_days')
      .eq('slug', planSlug)
      .maybeSingle()

    // Solo damos trial si la compañía todavía no usó su período de prueba
    // (es decir, nunca ha estado en 'active' o ya pasó por trial alguna vez).
    const isFirstSubscription = !company?.stripe_customer_id ||
                                 company?.subscription_status === 'trialing' ||
                                 !company?.subscription_status
    const trialDays = isFirstSubscription ? (plan?.trial_days ?? 7) : 0

    let customerId = company?.stripe_customer_id

    const createStripeSession = async (cId: string) => {
      return await stripe.checkout.sessions.create({
        customer: cId,
        mode: 'subscription',
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
          // ✅ Trial automático según trial_days del plan en DB
          ...(trialDays > 0 ? { trial_period_days: trialDays } : {})
        },
        // Permitir que el usuario cancele sin tarjeta durante el trial
        ...(trialDays > 0 ? {
          payment_method_collection: 'if_required' as const
        } : {}),
        success_url: `${origin}/dashboard/billing?success=true&plan=${planSlug}`,
        cancel_url: `${origin}/dashboard/billing?canceled=true`
      })
    }

    let session
    try {
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: company?.contact_email || user.email,
          name: company?.name || undefined,
          metadata: { companyId }
        })
        customerId = customer.id

        await supabase
          .from('companies')
          .update({ stripe_customer_id: customerId })
          .eq('id', companyId)
      }

      session = await createStripeSession(customerId)
    } catch (stripeError: any) {
      // Auto-reparación: cliente borrado en Stripe
      if (stripeError.code === 'resource_missing' && stripeError.message?.includes('No such customer')) {
        const newCustomer = await stripe.customers.create({
          email: company?.contact_email || user.email,
          name: company?.name || undefined,
          metadata: { companyId }
        })
        customerId = newCustomer.id

        await supabase
          .from('companies')
          .update({ stripe_customer_id: customerId })
          .eq('id', companyId)

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
