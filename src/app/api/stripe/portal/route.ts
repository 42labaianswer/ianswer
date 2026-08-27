 

import { NextResponse } from 'next/server'
import { stripe } from '../../../../lib/stripe'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ============================================================================
// POST /api/stripe/portal
// ----------------------------------------------------------------------------
// Abre el Portal de Cliente de Stripe para gestionar suscripción, métodos de
// pago y facturas.
// ============================================================================

export async function POST(req: Request) {
  try {
    const { companyId } = await req.json()
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
      .select('stripe_customer_id')
      .eq('id', companyId)
      .single()

    if (!company?.stripe_customer_id) {
      return NextResponse.json({
        error: 'Aún no tienes una suscripción activa para gestionar.'
      }, { status: 400 })
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: company.stripe_customer_id,
      return_url: `${origin}/dashboard/plans`
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[Stripe Portal] Error:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
