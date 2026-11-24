import { afterEach, describe, expect, it, vi } from 'vitest'
import { changeOrderStatus, statusChangeToast } from './orderStatusClient'

describe('statusChangeToast', () => {
  it('dice si se avisó al cliente', () => {
    expect(statusChangeToast({ notified: true })).toContain('Se le avisó al cliente')
  })
  it('explica por qué no se avisó', () => {
    expect(statusChangeToast({ notified: false, reason: 'window' })).toContain('24 h')
    expect(statusChangeToast({ notified: false, reason: 'no_whatsapp' })).toContain('no está conectado')
    expect(statusChangeToast({ notified: false, reason: 'send_failed' })).toContain('no aceptó')
    expect(statusChangeToast({ notified: false, reason: 'disabled' })).toBe('Estado actualizado.')
  })
})

describe('changeOrderStatus', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('regresa la respuesta de la API', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, notified: true }) })))
    await expect(changeOrderStatus({ orderId: 'o1', action: 'next' })).resolves.toEqual({ ok: true, notified: true })
  })

  it('lanza el error de la API', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'No hay siguiente estado' }) })))
    await expect(changeOrderStatus({ orderId: 'o1', action: 'next' })).rejects.toThrow('No hay siguiente estado')
  })
})
