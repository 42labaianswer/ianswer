import { afterEach, describe, expect, it, vi } from 'vitest'
import { postGraphMessage } from './metaGraph'

function mockFetch(impl: () => Promise<unknown>) {
  const fn = vi.fn(impl)
  vi.stubGlobal('fetch', fn)
  return fn
}

const jsonResponse = (ok: boolean, body: unknown) => ({ ok, json: async () => body })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('postGraphMessage', () => {
  it('manda el cuerpo como JSON con el token en la URL', async () => {
    const fetchFn = mockFetch(async () => jsonResponse(true, { messages: [{ id: 'wamid.1' }] }))
    const res = await postGraphMessage('https://graph.test/123/messages', 'tok en', { a: 1 })

    expect(res).toEqual({ ok: true, messageId: 'wamid.1' })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://graph.test/123/messages?access_token=tok%20en')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
  })

  it('toma message_id cuando la respuesta es de Messenger o Instagram', async () => {
    mockFetch(async () => jsonResponse(true, { message_id: 'mid.9' }))
    expect(await postGraphMessage('u', 't', {})).toEqual({ ok: true, messageId: 'mid.9' })
  })

  it('devuelve messageId null si Meta no manda id', async () => {
    mockFetch(async () => jsonResponse(true, {}))
    expect(await postGraphMessage('u', 't', {})).toEqual({ ok: true, messageId: null })
  })

  it('usa el mensaje para el usuario que manda Meta', async () => {
    mockFetch(async () => jsonResponse(false, { error: { message: 'tecnico', error_user_msg: 'Para el usuario' } }))
    expect(await postGraphMessage('u', 't', {})).toEqual({ ok: false, error: 'Para el usuario' })
  })

  it('usa error.message si no hay mensaje para el usuario', async () => {
    mockFetch(async () => jsonResponse(true, { error: { message: 'Invalid parameter' } }))
    expect(await postGraphMessage('u', 't', {})).toEqual({ ok: false, error: 'Invalid parameter' })
  })

  it('da un mensaje genérico si la respuesta no es JSON', async () => {
    mockFetch(async () => ({ ok: false, json: async () => { throw new Error('no json') } }))
    expect(await postGraphMessage('u', 't', {})).toEqual({ ok: false, error: 'Meta rechazó el envío' })
  })

  it('no lanza si falla la red', async () => {
    mockFetch(async () => { throw new Error('ECONNRESET') })
    expect(await postGraphMessage('u', 't', {})).toEqual({ ok: false, error: 'ECONNRESET' })
  })

  it('da un mensaje genérico si lo que lanza no es Error', async () => {
    mockFetch(async () => { throw 'raro' })
    expect(await postGraphMessage('u', 't', {})).toEqual({ ok: false, error: 'No se pudo contactar a Meta' })
  })
})
