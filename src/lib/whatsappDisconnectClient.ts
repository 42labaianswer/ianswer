// Botón "Desconectar" de WhatsApp (Conectividad y /dashboard/whatsapp).
// Llama a /api/whatsapp/disconnect y, si Meta no liberó el número, le pregunta
// al usuario si quiere desconectar de todos modos.

export type ConfirmFn = (message: string, options?: { title?: string; confirmText?: string; danger?: boolean }) => Promise<boolean>

export type DisconnectOutcome =
  | { status: 'disconnected'; message: string; warning: string | null }
  | { status: 'cancelled' }
  | { status: 'error'; error: string }

async function post(force: boolean) {
  const res = await fetch('/api/whatsapp/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force }),
  })
  const data = await res.json().catch(() => ({}))
  return { res, data }
}

function successMessage(data: { released?: boolean; coexistence?: boolean }): string {
  if (data.coexistence) return 'WhatsApp desconectado. El número sigue funcionando en tu app de WhatsApp Business.'
  if (data.released) return 'WhatsApp desconectado. El número quedó libre para usarlo en la app de WhatsApp Business.'
  return 'WhatsApp desconectado'
}

export async function disconnectWhatsApp(confirm: ConfirmFn): Promise<DisconnectOutcome> {
  try {
    let { res, data } = await post(false)

    if (res.status === 409 && data?.needsForce) {
      const ok = await confirm(
        `${data.error}. Si desconectas de todos modos, el número seguirá registrado en Meta y no podrás usarlo en la app de WhatsApp Business hasta liberarlo desde Meta.`,
        { title: 'No se pudo liberar el número', danger: true, confirmText: 'Desconectar de todos modos' }
      )
      if (!ok) return { status: 'cancelled' }
      ;({ res, data } = await post(true))
    }

    if (!res.ok || !data?.success) return { status: 'error', error: data?.error || 'No se pudo desconectar' }
    return { status: 'disconnected', message: successMessage(data), warning: data.warning ?? null }
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : 'No se pudo desconectar' }
  }
}

export const DISCONNECT_CONFIRM =
  '¿Desconectar WhatsApp? El bot dejará de recibir y responder mensajes por este canal. ' +
  'Si no lo conectaste con coexistencia, el número se libera en Meta para que puedas usarlo en la app de WhatsApp Business.'
