// Add-ons que se cobran en el mismo checkout del plan (los que se eligen en el
// onboarding). Los mensuales entran como items de la suscripción del plan
// (con la misma prueba gratis); los paquetes de pago único van en la primera
// factura.

export type CheckoutAddon = {
  id: string
  stripe_price_id: string | null
  is_recurring: boolean
  is_active: boolean
  requires_plan_min: string | null
  feature_flags: Record<string, unknown> | null
  credit_grants: Record<string, unknown> | null
}

const PLAN_RANK: Record<string, number> = { lite: 0, start: 1, growth: 2, scale: 3 }

/**
 * Los add-ons que sí se pueden cobrar con el plan elegido: activos, con
 * precio de Stripe, que el plan alcance (requires_plan_min) y que el plan no
 * incluya ya (p. ej. Entrenamiento PRO en Growth). Los mensuales solo van con
 * el plan mensual: Stripe no mezcla periodos en una suscripción.
 */
export function addonsForPlanCheckout(
  addons: CheckoutAddon[],
  planSlug: string,
  planFlags: Record<string, unknown> | null | undefined,
  billingMode: 'monthly' | 'yearly',
): CheckoutAddon[] {
  const rank = PLAN_RANK[planSlug] ?? 1
  return addons.filter(a => {
    if (!a.is_active || !a.stripe_price_id || a.stripe_price_id.includes('...')) return false
    if (a.requires_plan_min && rank < (PLAN_RANK[a.requires_plan_min] ?? 1)) return false
    if (a.is_recurring && billingMode !== 'monthly') return false
    const isPack = !!a.credit_grants && Object.keys(a.credit_grants).length > 0
    const flags = Object.entries(a.feature_flags || {}).filter(([, v]) => v === true)
    if (!isPack && flags.length > 0 && flags.every(([k]) => planFlags?.[k] === true)) return false
    return true
  })
}
