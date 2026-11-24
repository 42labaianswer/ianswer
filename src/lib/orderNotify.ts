// Aviso por WhatsApp al cliente cuando su pedido cambia de estado, y la hora
// estimada al empezar a prepararlo. Lo usa /api/orders/status.

export type OrderSemantic = 'received' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled'

export interface OrderNotice {
  semantic: string
  orderNumber: string | null
  deliveryType: string | null
  customerName?: string | null
  trackingUrl?: string | null
  /** Hora estimada (ISO), solo se menciona al empezar a prepararlo. */
  estimatedReadyAt?: string | null
}

function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Mexico_City',
  })
}

/**
 * Texto del aviso, o null si ese estado no se avisa ("received": el bot ya
 * confirmó el pedido al tomarlo).
 */
export function orderStatusMessage(n: OrderNotice): string | null {
  const pedido = n.orderNumber ? `Tu pedido #${n.orderNumber}` : 'Tu pedido'
  const hola = n.customerName?.trim() ? `Hola ${n.customerName.trim().split(/\s+/)[0]}. ` : ''
  const delivery = n.deliveryType === 'delivery'

  let body: string
  switch (n.semantic) {
    case 'preparing':
      body = `${pedido} ya se está preparando.`
      if (n.estimatedReadyAt) {
        body += delivery
          ? ` Calculamos que sale a entregarse a las ${formatHour(n.estimatedReadyAt)}.`
          : ` Estará listo aproximadamente a las ${formatHour(n.estimatedReadyAt)}.`
      }
      break
    case 'ready':
      body = delivery
        ? `${pedido} está listo y en un momento sale a entregarse.`
        : n.deliveryType === 'dine_in'
          ? `${pedido} está listo, en un momento te lo llevamos a tu mesa.`
          : `${pedido} está listo. Ya puedes pasar por él.`
      break
    case 'out_for_delivery':
      body = `${pedido} va en camino.`
      break
    case 'delivered':
      return `${hola}${pedido} fue entregado. Gracias por tu compra.`
    case 'cancelled':
      return `${hola}${pedido} fue cancelado. Si tienes alguna duda, responde este mensaje.`
    default:
      return null
  }

  const link = n.trackingUrl ? ` Síguelo aquí: ${n.trackingUrl}` : ''
  return `${hola}${body}${link}`
}

/**
 * Minutos de preparación de un pedido: el platillo que más tarda (se
 * preparan en paralelo). Sin tiempos capturados, usa el valor por omisión.
 */
export function prepMinutes(
  items: { menu_item_id?: string | null }[] | null | undefined,
  prepByItem: Record<string, number | null | undefined>,
  fallback = 20,
): number {
  const times = (items || [])
    .map(it => (it.menu_item_id ? prepByItem[it.menu_item_id] : null))
    .filter((m): m is number => typeof m === 'number' && m > 0)
  return times.length > 0 ? Math.max(...times) : fallback
}

/** true si el cliente escribió en las últimas 24 h (Meta solo deja escribirle así). */
export function insideServiceWindow(lastCustomerMessageAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!lastCustomerMessageAt) return false
  return now.getTime() - new Date(lastCustomerMessageAt).getTime() < 24 * 60 * 60 * 1000
}
