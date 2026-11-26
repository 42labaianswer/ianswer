// Aviso de mensajes entrantes (toast y notificación del sistema), al estilo de
// WhatsApp Web: quién escribió y qué dijo.

const LARGO_MAXIMO = 120

/** Texto corto para el aviso según el tipo de mensaje. */
export function vistaPreviaMensaje(m: { content?: string | null; message_type?: string | null; media_caption?: string | null }): string {
  if (m.message_type === 'audio') return 'Nota de voz'
  if (m.message_type === 'image') return m.media_caption?.trim() || 'Imagen'
  const texto = (m.content || '').replace(/\s+/g, ' ').trim()
  if (!texto) return 'Mensaje nuevo'
  return texto.length > LARGO_MAXIMO ? `${texto.slice(0, LARGO_MAXIMO - 1)}…` : texto
}

// Conversación abierta en Mensajes (external_id). Si el mensaje es de ese chat,
// no se avisa: ya se está viendo.
let chatAbierto: string | null = null

export function setChatAbierto(externalId: string | null) {
  chatAbierto = externalId
}

export function debeAvisar(msg: { sender?: string | null; patient_id?: string | null }): boolean {
  if (msg.sender !== 'patient' || !msg.patient_id) return false
  return msg.patient_id !== chatAbierto
}
