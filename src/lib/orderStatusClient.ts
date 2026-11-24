// Cambiar el estado de un pedido desde el panel. Todo pasa por
// /api/orders/status para que el aviso al cliente salga sin importar desde
// dónde se movió (kanban, botón rápido o detalle).

export type OrderStatusResult = {
  ok?: boolean
  notified?: boolean
  reason?: 'disabled' | 'no_phone' | 'not_notified_status' | 'window' | 'no_whatsapp' | 'send_failed' | 'same_status'
  error?: string
}

export async function changeOrderStatus(body: {
  orderId: string
  action: 'next' | 'step' | 'cancel'
  step?: number
  reason?: string | null
}): Promise<OrderStatusResult> {
  const res = await fetch('/api/orders/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as OrderStatusResult
  if (!res.ok) throw new Error(data.error || 'No se pudo cambiar el estado')
  return data
}

/** Mensaje para el toast después de cambiar el estado. */
export function statusChangeToast(result: OrderStatusResult): string {
  if (result.notified) return 'Estado actualizado. Se le avisó al cliente por WhatsApp.'
  switch (result.reason) {
    case 'window':
      return 'Estado actualizado. El cliente no ha escrito en 24 h, así que no se le mandó aviso (lo ve en su link de seguimiento).'
    case 'no_whatsapp':
      return 'Estado actualizado. WhatsApp no está conectado, no se mandó aviso.'
    case 'send_failed':
      return 'Estado actualizado, pero WhatsApp no aceptó el aviso al cliente.'
    default:
      return 'Estado actualizado.'
  }
}
