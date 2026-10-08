// ============================================================================
// src/lib/stripePlan.ts  (solo servidor)
// ----------------------------------------------------------------------------
// Lógica compartida para reflejar en `companies` el estado real de la
// suscripción del PLAN BASE en Stripe. La usan:
//   - el webhook (api/stripe/webhook)
//   - la confirmación al regresar de Checkout (api/stripe/confirm-checkout),
//     para no depender de que el webhook llegue antes que el usuario.
//
// Regla: el plan y la prueba SOLO se escriben desde aquí, con datos que
// vienen de Stripe. El wizard no asigna plan.
//
// Notas de la versión de API 2026-04-22.dahlia:
//   - invoice.subscription no existe → invoice.parent.subscription_details.subscription
//   - current_period_end vive en los items de la suscripción, no en la raíz.
// ============================================================================

import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Estado de Stripe → nuestro enum de companies.subscription_status. */
export function normalizeStripeStatus(status: string): string {
  const map: Record<string, string> = {
    trialing: 'trialing',
    active: 'active',
    past_due: 'past_due',
    unpaid: 'past_due',
    canceled: 'canceled',
    incomplete: 'inactive',
    incomplete_expired: 'canceled',
    paused: 'paused',
  }
  return map[status] || status
}

/** account_status que lee can_bot_respond_v2 (n8n). */
export function accountStatusFor(normalized: string): string {
  return normalized === 'canceled' || normalized === 'expired' ? 'expired' : 'active'
}

export function toIso(unixSeconds?: number | null): string | null {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null
}

/** Fin del periodo actual (en dahlia vive en el item; se deja el fallback viejo). */
export function periodEndOf(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0] as (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end
  return toIso(item?.current_period_end ?? legacy)
}

/** Id de la suscripción de una factura, en el formato nuevo o el viejo. */
export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const fromParent = invoice.parent?.subscription_details?.subscription
  const legacy = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription
  const raw = fromParent ?? legacy
  if (!raw) return null
  return typeof raw === 'string' ? raw : raw.id
}

/**
 * Plan de la suscripción según el price.id del item (así los cambios hechos
 * desde el portal de Stripe se reflejan). Si no encuentra el precio, usa
 * metadata.planSlug como respaldo.
 */
export async function resolvePlanSlug(
  admin: SupabaseClient,
  sub: Stripe.Subscription
): Promise<{ planSlug: string | null, billingCycle: 'monthly' | 'yearly' | null }> {
  const priceId = sub.items?.data?.[0]?.price?.id
  if (priceId) {
    const { data } = await admin
      .from('plans')
      .select('slug, stripe_price_id, stripe_price_yearly_id')
      .or(`stripe_price_id.eq.${priceId},stripe_price_yearly_id.eq.${priceId}`)
      .limit(1)
      .maybeSingle()
    if (data?.slug) {
      return { planSlug: data.slug, billingCycle: data.stripe_price_yearly_id === priceId ? 'yearly' : 'monthly' }
    }
  }
  return { planSlug: sub.metadata?.planSlug || null, billingCycle: null }
}

/**
 * Escribe en companies el estado de una suscripción de plan. Idempotente: se
 * puede llamar desde el webhook y desde la confirmación sin problema.
 */
export async function applyPlanSubscription(
  admin: SupabaseClient,
  sub: Stripe.Subscription,
  opts: { companyId?: string | null, markStarted?: boolean } = {}
) {
  const normalized = normalizeStripeStatus(sub.status)
  const { planSlug, billingCycle } = await resolvePlanSlug(admin, sub)

  const updates: Record<string, unknown> = {
    stripe_subscription_id: sub.id,
    // El cliente de la suscripción es la fuente de verdad (corrige si el
    // checkout no alcanzó a guardarlo).
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    subscription_status: normalized,
    account_status: accountStatusFor(normalized),
  }
  if (planSlug) {
    updates.plan_slug = planSlug
    updates.selected_plan_slug = planSlug
    updates.pending_plan_slug = null
  }
  if (billingCycle) updates.billing_cycle = billingCycle
  const trialEnd = toIso(sub.trial_end)
  if (trialEnd) {
    updates.trial_ends_at = trialEnd
    updates.trial_starts_at = toIso(sub.trial_start)
  }
  const periodEnd = periodEndOf(sub)
  if (periodEnd) updates.current_period_ends_at = periodEnd
  const companyId = opts.companyId || sub.metadata?.companyId
  const query = admin.from('companies').update(updates)
  const { error } = companyId
    ? await query.eq('id', companyId)
    : await query.eq('stripe_subscription_id', sub.id)
  if (error) throw error

  // Solo la primera vez (lo llaman el webhook y confirm-checkout; no pisar la fecha).
  if (opts.markStarted) {
    const first = admin.from('companies').update({ subscription_started_at: new Date().toISOString() }).is('subscription_started_at', null)
    await (companyId ? first.eq('id', companyId) : first.eq('stripe_subscription_id', sub.id))
  }

  return { normalized, planSlug }
}

/** Correo y nombre del cliente de Stripe, para los avisos por Resend. */
export async function customerContact(
  stripe: Stripe,
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): Promise<{ email: string | null, name: string | null }> {
  if (!customer) return { email: null, name: null }
  const c = typeof customer === 'string' ? await stripe.customers.retrieve(customer) : customer
  if ((c as Stripe.DeletedCustomer).deleted) return { email: null, name: null }
  const cust = c as Stripe.Customer
  return { email: cust.email || null, name: cust.name || null }
}
