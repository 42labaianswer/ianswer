 

import { NextResponse } from 'next/server'
import { stripe } from '../../../../lib/stripe'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ============================================================================
// POST /api/stripe/checkout-addon
// ----------------------------------------------------------------------------
// Crea una sesión de Stripe Checkout para activar un addon.
//
// Soporta:
//   - Recurrentes  (mode: 'subscription' con price recurring)
//   - One-time     (mode: 'payment' con price one_time)
//
// El webhook (route.ts) se encarga de:
//   - Activar el addon (RPC activate_addon) cuando checkout.session.completed
//   - Cancelar (RPC cancel_addon) cuando customer.subscription.deleted
// ============================================================================

export async function POST(req: Request) {
  try {
    const { companyId, addonId, isOneTime } = await req.json()
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

    // 1. Validar pertenencia a la company
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (profile?.company_id !== companyId) {
      return NextResponse.json({ error: 'No autorizado para esta company' }, { status: 403 })
    }

    // 2. Obtener addon y company
    const [{ data: addon }, { data: company }] = await Promise.all([
      supabase.from('addons').select('*').eq('id', addonId).single(),
      supabase.from('companies').select('stripe_customer_id, contact_email, name').eq('id', companyId).single()
    ])

    if (!addon) {
      return NextResponse.json({ error: 'Addon no encontrado' }, { status: 404 })
    }

    if (!addon.stripe_price_id || addon.stripe_price_id.includes('...')) {
      return NextResponse.json({
        error: 'Este addon aún no tiene precio configurado en Stripe. Avísale al admin.'
      }, { status: 400 })
    }

    // 3. Asegurar customer en Stripe
    let customerId = company?.stripe_customer_id
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

    // 4. Crear checkout session según tipo
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: isOneTime ? 'payment' : 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: addon.stripe_price_id, quantity: 1 }],
      metadata: {
        companyId,
        addonId,
        checkoutType: 'addon',
        isOneTime: String(!!isOneTime)
      },
      ...(isOneTime
        ? {} // one-time no necesita subscription_data
        : {
            subscription_data: {
              metadata: {
                companyId,
                addonId,
                checkoutType: 'addon'
              }
            }
          }),
      success_url: `${origin}/dashboard/addons?success=true&addon=${addonId}`,
      cancel_url: `${origin}/dashboard/addons?canceled=true`
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[Stripe Checkout Addon] Error:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
