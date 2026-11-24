import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '../../../../lib/stripe'
import { periodEndOf } from '../../../../lib/stripePlan'

// ============================================================================
// POST /api/stripe/cancel-addon  { addonId }
// ----------------------------------------------------------------------------
// Cancela un add-on mensual también en Stripe (antes solo se marcaba en la
// base y Stripe lo seguía cobrando).
//   - Add-on con su propia suscripción (comprado en Extras): se cancela al
//     final del periodo pagado; el webhook customer.subscription.deleted lo
//     marca como cancelado ese día.
//   - Add-on dentro de la suscripción del plan (elegido en el onboarding): se
//     quita el item con prorrateo (lo no usado queda a favor en la siguiente
//     factura) y se apaga en ese momento.
//   - Sin cobro en Stripe (gratis o activado por admin): solo en la base.
// ============================================================================

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { addonId } = await req.json()
    if (!addonId || typeof addonId !== 'string') {
      return NextResponse.json({ error: 'addonId requerido' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n: string) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
    const companyId = profile?.company_id as string | undefined
    if (!companyId) return NextResponse.json({ error: 'Tu usuario no tiene empresa asignada' }, { status: 403 })

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const [{ data: row }, { data: company }] = await Promise.all([
      admin.from('company_addons')
        .select('id, status, stripe_subscription_item_id')
        .eq('company_id', companyId).eq('addon_id', addonId).maybeSingle(),
      admin.from('companies').select('stripe_subscription_id').eq('id', companyId).maybeSingle(),
    ])
    if (!row || row.status !== 'active') {
      return NextResponse.json({ error: 'Este complemento no está activo' }, { status: 404 })
    }

    const now = new Date().toISOString()

    if (!row.stripe_subscription_item_id) {
      await admin.from('company_addons').update({ status: 'canceled', canceled_at: now, updated_at: now }).eq('id', row.id)
      return NextResponse.json({ ok: true, endsAt: now })
    }

    const item = await stripe.subscriptionItems.retrieve(row.stripe_subscription_item_id)
    const subId = typeof item.subscription === 'string' ? item.subscription : String(item.subscription)

    if (subId === company?.stripe_subscription_id) {
      await stripe.subscriptionItems.del(item.id, { proration_behavior: 'create_prorations' })
      await admin.from('company_addons').update({ status: 'canceled', canceled_at: now, updated_at: now }).eq('id', row.id)
      return NextResponse.json({ ok: true, endsAt: now })
    }

    const sub = await stripe.subscriptions.update(subId, { cancel_at_period_end: true })
    const endsAt = periodEndOf(sub)
    await admin.from('company_addons')
      .update({ canceled_at: now, current_period_end: endsAt, updated_at: now })
      .eq('id', row.id)
    return NextResponse.json({ ok: true, endsAt })
  } catch (error) {
    console.error('[Stripe cancel-addon] Error:', error)
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
