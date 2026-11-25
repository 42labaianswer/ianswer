import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const createClientMock = vi.hoisted(() => vi.fn(() => ({ client: 'service' })))
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }))

import { notifyPatient, requestGoogleSync, serviceClient } from './appointmentSync'

/** Supabase falso: platform_settings devuelve `settings`; appointments registra los update. */
function fakeSupabase(settings: Record<string, string | null> | null) {
  const updates: Array<{ values: Record<string, unknown>; id: unknown }> = []
  const client = {
    from(table: string) {
      if (table === 'platform_settings') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: settings }) }) }),
        }
      }
      return {
        update: (values: Record<string, unknown>) => ({
          eq: async (_col: string, id: unknown) => {
            updates.push({ values, id })
            return { error: null }
          },
        }),
      }
    },
  }
  return { client: client as unknown as SupabaseClient, updates }
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('serviceClient', () => {
  it('usa la service role sin persistir sesión', () => {
    serviceClient()
    expect(createClientMock).toHaveBeenCalledWith(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
  })
})

describe('requestGoogleSync', () => {
  it('llama al webhook con el id de la cita y no marca nada si n8n responde bien', async () => {
    const { client, updates } = fakeSupabase({ n8n_webhook_sync_appointment: ' https://n8n.test/webhook/sync ' })
    fetchMock.mockResolvedValue(new Response('{"status":"ok"}', { status: 200 }))

    await requestGoogleSync('apt1', client)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://n8n.test/webhook/sync')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ appointmentId: 'apt1' })
    expect(updates).toEqual([])
  })

  it('marca failed si falta configurar el webhook', async () => {
    const { client, updates } = fakeSupabase({ n8n_webhook_sync_appointment: '' })

    await requestGoogleSync('apt1', client)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(updates).toHaveLength(1)
    expect(updates[0].id).toBe('apt1')
    expect(updates[0].values.google_sync).toBe('failed')
    expect(String(updates[0].values.google_sync_error)).toContain('Sincronizar Cita Google')
  })

  it('marca failed con el status y el cuerpo si n8n responde con error', async () => {
    const { client, updates } = fakeSupabase({ n8n_webhook_sync_appointment: 'https://n8n.test/webhook/sync' })
    fetchMock.mockResolvedValue(new Response('Cannot POST', { status: 404 }))

    await requestGoogleSync('apt1', client)

    expect(updates[0].values).toEqual({ google_sync: 'failed', google_sync_error: 'n8n respondió 404: Cannot POST' })
  })

  it('marca failed si la llamada truena (timeout, red)', async () => {
    const { client, updates } = fakeSupabase({ n8n_webhook_sync_appointment: 'https://n8n.test/webhook/sync' })
    fetchMock.mockRejectedValue(new Error('The operation was aborted due to timeout'))

    await expect(requestGoogleSync('apt1', client)).resolves.toBeUndefined()

    expect(updates[0].values.google_sync).toBe('failed')
    expect(updates[0].values.google_sync_error).toBe('The operation was aborted due to timeout')
  })

  it('recorta errores largos a 500 caracteres', async () => {
    const { client, updates } = fakeSupabase({ n8n_webhook_sync_appointment: 'https://n8n.test/webhook/sync' })
    fetchMock.mockRejectedValue('x'.repeat(800))

    await requestGoogleSync('apt1', client)

    expect(String(updates[0].values.google_sync_error)).toHaveLength(500)
  })
})

describe('notifyPatient', () => {
  const input = { companyId: 'co1', externalId: '5219991234567', content: 'Hola Ana' }

  it('manda el WhatsApp con el external_id, como la bandeja', async () => {
    const { client } = fakeSupabase({ n8n_webhook_whatsapp_admin: 'https://n8n.test/webhook/wa' })
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }))

    await notifyPatient(input, client)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://n8n.test/webhook/wa')
    expect(JSON.parse(init.body)).toEqual({
      patient_id: '5219991234567', company_id: 'co1', channel: 'whatsapp', content: 'Hola Ana', message_type: 'text',
    })
  })

  it('no llama a nada si falta el webhook de WhatsApp', async () => {
    const { client } = fakeSupabase(null)

    await notifyPatient(input, client)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })

  it('no lanza si n8n responde con error o la red falla', async () => {
    const { client } = fakeSupabase({ n8n_webhook_whatsapp_admin: 'https://n8n.test/webhook/wa' })
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }))
    await expect(notifyPatient(input, client)).resolves.toBeUndefined()

    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'))
    await expect(notifyPatient(input, client)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledTimes(2)
  })
})
