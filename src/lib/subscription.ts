 

// ============================================================================
// src/lib/subscription.ts
// ----------------------------------------------------------------------------
// Regla ÚNICA de bloqueo por suscripción.
//
// ⚠️  Esta misma regla está replicada en el nodo "5. Validar Suscripcion" del
//     flujo de n8n `enviar-whatsapp-admin`. Ya divergieron una vez —n8n usaba
//     lista blanca, la app lista negra— y el resultado fue un HTTP 402 en
//     producción: empresas con plan activo no podían responder desde la
//     bandeja. Si cambias esta función, cambia también ese nodo.
//
//     Ver docs/fix-envio-402-suscripcion-n8n.md
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

