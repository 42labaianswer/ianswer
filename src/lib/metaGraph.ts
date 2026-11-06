// Envío de mensajes por la Graph API de Meta (WhatsApp Cloud API, Messenger e
// Instagram). Lo usan la bandeja (/api/messages/send) y las campañas
// (/api/campaigns).

export const GRAPH = 'https://graph.facebook.com/' + (process.env.META_GRAPH_VERSION || 'v22.0')

export type GraphSendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: string }

export async function postGraphMessage(endpoint: string, token: string, body: unknown): Promise<GraphSendResult> {
  try {
    const res = await fetch(`${endpoint}?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const respuesta = await res.json().catch(() => null)
    if (!res.ok || respuesta?.error) {
      return { ok: false, error: respuesta?.error?.error_user_msg || respuesta?.error?.message || 'Meta rechazó el envío' }
    }
    return { ok: true, messageId: respuesta?.messages?.[0]?.id ?? respuesta?.message_id ?? null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo contactar a Meta' }
  }
}
