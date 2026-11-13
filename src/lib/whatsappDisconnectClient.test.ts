import { afterEach, describe, expect, it, vi } from 'vitest'
import { disconnectWhatsApp } from './whatsappDisconnectClient'

type Reply = { status: number; body: unknown }

function mockApi(...replies: Reply[]) {
  const fn = vi.fn(async () => {
    const r = replies.shift()!
    return { ok: r.status < 400, status: r.status, json: async () => r.body }
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const bodyOf = (fn: ReturnType<typeof vi.fn>, i: number) =>
  JSON.parse((fn.mock.calls[i] as unknown as [string, RequestInit])[1].body as string)

afterEach(() => vi.unstubAllGlobals())

describe('disconnectWhatsApp', () => {
  it('avisa que el número quedó libre', async () => {
    const fetchFn = mockApi({ status: 200, body: { success: true, released: true, coexistence: false, warning: null } })
    const confirm = vi.fn()
    const r = await disconnectWhatsApp(confirm)
    expect(r).toEqual({ status: 'disconnected', message: expect.stringContaining('quedó libre'), warning: null })
    expect(bodyOf(fetchFn, 0)).toEqual({ force: false })
    expect(confirm).not.toHaveBeenCalled()
  })

  it('en coexistencia dice que el número sigue en la app', async () => {
    mockApi({ status: 200, body: { success: true, released: false, coexistence: true } })
    const r = await disconnectWhatsApp(vi.fn())
    expect(r).toMatchObject({ status: 'disconnected', message: expect.stringContaining('sigue funcionando'), warning: null })
  })

  it('mensaje simple si no había número que liberar', async () => {
    mockApi({ status: 200, body: { success: true, released: false, coexistence: false } })
    expect(await disconnectWhatsApp(vi.fn())).toMatchObject({ message: 'WhatsApp desconectado' })
  })

  it('pregunta y reintenta con force si Meta no liberó el número', async () => {
    const fetchFn = mockApi(
      { status: 409, body: { success: false, needsForce: true, error: 'Meta no liberó el número: token vencido' } },
      { status: 200, body: { success: true, released: false, coexistence: false, warning: 'El número sigue registrado' } },
    )
    const confirm = vi.fn(async (_message: string) => true)
    const r = await disconnectWhatsApp(confirm)
    expect(confirm.mock.calls[0][0]).toContain('token vencido')
    expect(bodyOf(fetchFn, 1)).toEqual({ force: true })
    expect(r).toMatchObject({ status: 'disconnected', warning: 'El número sigue registrado' })
  })

  it('no desconecta si el usuario cancela', async () => {
    const fetchFn = mockApi({ status: 409, body: { success: false, needsForce: true, error: 'x' } })
    expect(await disconnectWhatsApp(vi.fn(async () => false))).toEqual({ status: 'cancelled' })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('devuelve el error de la API', async () => {
    mockApi({ status: 401, body: { success: false, error: 'No autenticado' } })
    expect(await disconnectWhatsApp(vi.fn())).toEqual({ status: 'error', error: 'No autenticado' })
  })

  it('devuelve error si falla la red', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await disconnectWhatsApp(vi.fn())).toEqual({ status: 'error', error: 'offline' })
  })

  it('error genérico si la API no manda cuerpo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => { throw new Error('x') } })))
    expect(await disconnectWhatsApp(vi.fn())).toEqual({ status: 'error', error: 'No se pudo desconectar' })
  })
})
