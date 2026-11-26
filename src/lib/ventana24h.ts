// Ventana de atención de 24 h de Meta (WhatsApp, Messenger e Instagram): un
// mensaje normal solo se entrega si el cliente escribió en las últimas 24 h.
// Fuera de esa ventana Meta acepta el envío y después lo marca como fallido
// (error 131047), así que hay que avisar antes de enviar.

const VENTANA_MS = 24 * 60 * 60 * 1000

/** Fecha del último mensaje del cliente: lo más reciente entre el historial y contacts.last_inbound_at. */
export function ultimoMensajeDelCliente(
  mensajes: { sender?: string | null; created_at?: string | null }[],
  lastInboundAt?: string | null,
): number | null {
  let ultimo = lastInboundAt ? Date.parse(lastInboundAt) || 0 : 0
  for (const m of mensajes) {
    if (m.sender !== 'patient' || !m.created_at) continue
    const t = Date.parse(m.created_at)
    if (t > ultimo) ultimo = t
  }
  return ultimo || null
}

export function estadoVentana(ultimo: number | null, ahora = Date.now()): { abierta: boolean; horasRestantes: number } {
  if (!ultimo) return { abierta: false, horasRestantes: 0 }
  const restante = ultimo + VENTANA_MS - ahora
  return restante > 0
    ? { abierta: true, horasRestantes: Math.ceil(restante / 3_600_000) }
    : { abierta: false, horasRestantes: 0 }
}
