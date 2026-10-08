 

// ============================================================================
// src/lib/subscription.ts
// ----------------------------------------------------------------------------
// Regla ÚNICA de bloqueo por suscripción.
//
// ⚠️  Esta misma regla está replicada en el nodo "5. Validar Suscripcion" del
//     flujo de n8n `enviar-whatsapp-admin`. Si divergen, el envío falla con
//     HTTP 402 y empresas con plan activo no pueden responder desde la
//     bandeja. Si cambias esta función, cambia también ese nodo.
//
// Criterio: LISTA NEGRA. Se bloquea solo lo que inequívocamente hay que
// bloquear. Un estado desconocido NO bloquea — es preferible dejar pasar un
// mensaje de más que dejar mudo a un cliente que sí paga.
// ============================================================================

export const GRACE_DAYS = 3

/** Estados que cortan el servicio de inmediato. */
export const BLOCKED_STATUSES = ['expired', 'canceled'] as const

export interface SubscriptionState {
  status?: string | null
  /** Fecha de referencia para contar la gracia de `past_due`. */
  trialEndsAt?: string | null
}

export function isSubscriptionBlocked(
  state: SubscriptionState,
  now: Date = new Date()
): boolean {
  const status = (state.status || '').toLowerCase().trim()

  if ((BLOCKED_STATUSES as readonly string[]).includes(status)) return true

  if (status === 'past_due' && state.trialEndsAt) {
    const dias = (now.getTime() - new Date(state.trialEndsAt).getTime()) / 86400000
    return dias > GRACE_DAYS
  }

  return false
}

// ============================================================================
// Acceso al DASHBOARD — lista BLANCA.
// ----------------------------------------------------------------------------
// Distinta a propósito de isSubscriptionBlocked (que es lista negra porque
// está replicada en n8n para los envíos desde la bandeja). Para entrar
// al dashboard hace falta una suscripción de Stripe viva: en prueba, activa, o
// con un cobro fallido todavía dentro de los días de gracia.
//
// Motivo: con lista negra, 'inactive' (cuentas que terminaron el wizard sin
// pasar por Stripe, y suscripciones canceladas) no se bloquearía nunca — acceso
// ilimitado sin pagar.
// ============================================================================

export const DASHBOARD_ALLOWED_STATUSES = ['trialing', 'active'] as const

export function hasDashboardAccess(
  state: SubscriptionState,
  now: Date = new Date()
): boolean {
  const status = (state.status || '').toLowerCase().trim()
  if ((DASHBOARD_ALLOWED_STATUSES as readonly string[]).includes(status)) return true
  if (status === 'past_due') return !isSubscriptionBlocked(state, now)
  return false
}

