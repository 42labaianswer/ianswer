// Libera en Meta el número de WhatsApp de una empresa al desconectarlo de
// iAnswer. Lo usa /api/whatsapp/disconnect.
//
// Al conectar por la vía normal, /embedded-signup/exchange registra el número
// en la Cloud API (/register). Mientras siga registrado, la app de WhatsApp
// Business no deja usarlo ("intenta en una hora"), así que al desconectar hay
// que darlo de baja (/deregister). En coexistencia no: el número lo sigue
// usando la app del cliente.

import { GRAPH } from './metaGraph'

export type MetaStep =
  | { status: 'ok' }
  | { status: 'skipped'; reason: string }
  | { status: 'error'; error: string }

export interface WhatsAppConnection {
  phoneNumberId: string | null
  wabaId: string | null
  token: string | null
  coexistence: boolean
}

async function graphCall(method: 'POST' | 'DELETE', url: string, token: string, body?: unknown): Promise<MetaStep> {
  try {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = await res.json().catch(() => null)
    if (res.ok && data?.success !== false && !data?.error) return { status: 'ok' }
    return { status: 'error', error: data?.error?.error_user_msg || data?.error?.message || `Meta respondió ${res.status}` }
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : 'No se pudo contactar a Meta' }
  }
}

/** Da de baja el número de la Cloud API, salvo en coexistencia. */
export async function deregisterNumber(c: WhatsAppConnection): Promise<MetaStep> {
  if (c.coexistence) return { status: 'skipped', reason: 'coexistencia: el número sigue en la app de WhatsApp Business' }
  if (!c.phoneNumberId) return { status: 'skipped', reason: 'sin número guardado' }
  if (!c.token) return { status: 'skipped', reason: 'sin token guardado' }

  const result = await graphCall('POST', `${GRAPH}/${c.phoneNumberId}/deregister`, c.token)
  // Si ya no estaba registrado, el resultado es el mismo que queríamos.
  if (result.status === 'error' && /not registered|is not registered|already deregistered/i.test(result.error)) {
    return { status: 'ok' }
  }
  return result
}

/** Deja de mandar los mensajes del WABA a nuestra app. */
export async function unsubscribeWebhook(c: WhatsAppConnection): Promise<MetaStep> {
  if (!c.wabaId) return { status: 'skipped', reason: 'sin WABA guardado' }
  if (!c.token) return { status: 'skipped', reason: 'sin token guardado' }
  return graphCall('DELETE', `${GRAPH}/${c.wabaId}/subscribed_apps`, c.token)
}
