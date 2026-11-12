import { afterEach, describe, expect, it, vi } from 'vitest'
import { deregisterNumber, unsubscribeWebhook, type WhatsAppConnection } from './whatsappRelease'
import { GRAPH } from './metaGraph'

const conn = (over: Partial<WhatsAppConnection> = {}): WhatsAppConnection => ({
  phoneNumberId: '1336', wabaId: '1643', token: 'tok', coexistence: false, ...over,
})

function mockFetch(ok: boolean, body: unknown) {
  const fn = vi.fn(async () => ({ ok, status: ok ? 200 : 400, json: async () => body }))
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('deregisterNumber', () => {
  it('da de baja el número con el token en el header', async () => {
    const fetchFn = mockFetch(true, { success: true })
    expect(await deregisterNumber(conn())).toEqual({ status: 'ok' })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${GRAPH}/1336/deregister`)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('no toca el número en coexistencia', async () => {
    const fetchFn = mockFetch(true, { success: true })
    expect((await deregisterNumber(conn({ coexistence: true }))).status).toBe('skipped')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('se salta si falta el número o el token', async () => {
    const fetchFn = mockFetch(true, { success: true })
    expect((await deregisterNumber(conn({ phoneNumberId: null }))).status).toBe('skipped')
    expect((await deregisterNumber(conn({ token: null }))).status).toBe('skipped')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('devuelve el error de Meta', async () => {
    mockFetch(false, { error: { message: 'Malformed access token' } })
    expect(await deregisterNumber(conn())).toEqual({ status: 'error', error: 'Malformed access token' })
  })

  it('prefiere el mensaje para el usuario', async () => {
    mockFetch(false, { error: { message: 'tecnico', error_user_msg: 'Para el usuario' } })
    expect(await deregisterNumber(conn())).toEqual({ status: 'error', error: 'Para el usuario' })
  })

  it('cuenta como ok si el número ya no estaba registrado', async () => {
    mockFetch(false, { error: { message: 'Phone number is not registered' } })
    expect(await deregisterNumber(conn())).toEqual({ status: 'ok' })
  })

  it('trata success: false como error', async () => {
    mockFetch(true, { success: false })
    expect((await deregisterNumber(conn())).status).toBe('error')
  })

  it('devuelve error si no hay red', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET') }))
    expect(await deregisterNumber(conn())).toEqual({ status: 'error', error: 'ECONNRESET' })
  })

  it('usa el código HTTP si Meta no manda cuerpo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => { throw new Error('no json') } })))
    expect(await deregisterNumber(conn())).toEqual({ status: 'error', error: 'Meta respondió 500' })
  })
})

describe('unsubscribeWebhook', () => {
  it('quita la suscripción del WABA', async () => {
    const fetchFn = mockFetch(true, { success: true })
    expect(await unsubscribeWebhook(conn())).toEqual({ status: 'ok' })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${GRAPH}/1643/subscribed_apps`)
    expect(init.method).toBe('DELETE')
  })

  it('también en coexistencia', async () => {
    mockFetch(true, { success: true })
    expect(await unsubscribeWebhook(conn({ coexistence: true }))).toEqual({ status: 'ok' })
  })

  it('se salta si falta el WABA o el token', async () => {
    const fetchFn = mockFetch(true, { success: true })
    expect((await unsubscribeWebhook(conn({ wabaId: null }))).status).toBe('skipped')
    expect((await unsubscribeWebhook(conn({ token: null }))).status).toBe('skipped')
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
