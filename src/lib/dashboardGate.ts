// ============================================================================
// src/lib/dashboardGate.ts
// ----------------------------------------------------------------------------
// Decide EN EL SERVIDOR qué puede ver una cuenta en /dashboard.
//
// Se hace en el servidor porque el wizard (OnboardingWizard) y el bloqueo
// (SubscriptionGuard) son overlays del lado del cliente: si el dashboard
// completo llega al navegador, basta con borrar el div del overlay en
// "Inspeccionar" para usarlo sin pasar por Stripe.
//
// proxy.ts calcula el estado con esta función en cada petición a
// /dashboard/* (también en las navegaciones internas de Next) y:
//   - 'wizard'  → redirige todo a /dashboard, y el layout renderiza SOLO el
//                 wizard (sin sidebar ni páginas).
//   - 'blocked' → solo deja entrar a BLOCKED_ALLOWED_PATHS; lo demás redirige
//                 a /dashboard/plans.
//   - 'ok'      → sin cambios.
//
// Las condiciones replican exactamente las de OnboardingWizard y
// SubscriptionGuard. Si cambias una, cambia la otra.
// ============================================================================

import { hasDashboardAccess } from './subscription'

export type DashboardGate = 'ok' | 'wizard' | 'blocked'

/** Header interno que proxy.ts pasa al layout (siempre lo sobrescribe). */
export const GATE_HEADER = 'x-dashboard-gate'

/** Rutas a las que una cuenta bloqueada (suscripción cancelada o vencida) sí puede entrar. */
export const BLOCKED_ALLOWED_PATHS = ['/dashboard/plans', '/dashboard/admin', '/dashboard/help', '/dashboard/profile']

export interface GateCompany {
  onboarding_completed: boolean | null
  subscription_status: string | null
  trial_ends_at: string | null
  stripe_subscription_id: string | null
}

/**
 * @param hasPrimaryTemplate  solo importa si el onboarding no está completo;
 *                            se consulta aparte para ahorrar la query cuando no hace falta.
 */
export function computeDashboardGate(company: GateCompany, hasPrimaryTemplate: boolean): DashboardGate {
  const access = hasDashboardAccess({ status: company.subscription_status, trialEndsAt: company.trial_ends_at })

  // OnboardingWizard: sin onboarding (y sin industria) → wizard completo;
  // terminó el wizard pero nunca inició suscripción en Stripe → paso 5.
  if (!company.onboarding_completed && !hasPrimaryTemplate) return 'wizard'
  if (!company.stripe_subscription_id && !access) return 'wizard'

  // SubscriptionGuard: tuvo suscripción de Stripe y ya no está viva.
  if (company.onboarding_completed && company.stripe_subscription_id && !access) return 'blocked'

  return 'ok'
}

export function isBlockedAllowedPath(pathname: string): boolean {
  return BLOCKED_ALLOWED_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}
