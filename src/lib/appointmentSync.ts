// Trabajo en segundo plano de las citas: sincronizar con Google Calendar (flujo
// de n8n "Sincronizar Cita Google") y avisar al cliente por WhatsApp. Corre
// dentro de after(), cuando la respuesta ya salió al navegador, así que nunca
// lanza: cualquier fallo queda en appointments.google_sync = 'failed'.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const N8N_TIMEOUT_MS = 25_000

export function serviceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function platformWebhook(
  supabase: SupabaseClient,
  field: 'n8n_webhook_sync_appointment' | 'n8n_webhook_whatsapp_admin'
): Promise<string | null> {
  const { data } = await supabase.from('platform_settings').select(field).eq('id', 1).maybeSingle()
  const url = (data as Record<string, unknown> | null)?.[field]
  return typeof url === 'string' && url.trim() ? url.trim() : null
}

async function markFailed(supabase: SupabaseClient, appointmentId: string, error: string) {
  await supabase
    .from('appointments')
    .update({ google_sync: 'failed', google_sync_error: error.slice(0, 500) })
    .eq('id', appointmentId)
}

/**
 * Pide a n8n que cree o mueva el evento de Google de la cita. El flujo marca
 * 'synced' o 'failed' él mismo; aquí solo se marca 'failed' si n8n no responde.
 */
export async function requestGoogleSync(appointmentId: string, supabase: SupabaseClient = serviceClient()) {
  try {
    const url = await platformWebhook(supabase, 'n8n_webhook_sync_appointment')
    if (!url) {
      await markFailed(supabase, appointmentId, 'Falta configurar el webhook "Sincronizar Cita Google" en Admin > Desarrollador')
      return
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId }),
      signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      await markFailed(supabase, appointmentId, `n8n respondió ${res.status}: ${text.slice(0, 200)}`)
    }
  } catch (err) {
    console.error('[appointmentSync] sincronización con Google falló', appointmentId, err)
    await markFailed(supabase, appointmentId, err instanceof Error ? err.message : String(err)).catch(() => {})
  }
}

/** Manda un WhatsApp al cliente por el flujo de envío del equipo (n8n_webhook_whatsapp_admin). */
export async function notifyPatient(
  input: { companyId: string; externalId: string; content: string },
  supabase: SupabaseClient = serviceClient()
) {
  try {
    const url = await platformWebhook(supabase, 'n8n_webhook_whatsapp_admin')
    if (!url) {
      console.error('[appointmentSync] falta n8n_webhook_whatsapp_admin; no se avisó al cliente', input.externalId)
      return
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_id: input.externalId,
        company_id: input.companyId,
        channel: 'whatsapp',
        content: input.content,
        message_type: 'text',
      }),
      signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
    })
    if (!res.ok) console.error('[appointmentSync] aviso de WhatsApp respondió', res.status, input.externalId)
  } catch (err) {
    console.error('[appointmentSync] aviso de WhatsApp falló', input.externalId, err)
  }
}
