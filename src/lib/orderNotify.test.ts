import { describe, expect, it } from 'vitest'
import { insideServiceWindow, orderStatusMessage, prepMinutes } from './orderNotify'

const base = { orderNumber: '123', deliveryType: 'pickup', trackingUrl: 'https://ianswer.pro/tracking/abc' }

describe('orderStatusMessage', () => {
  it('no avisa al recibir el pedido', () => {
    expect(orderStatusMessage({ ...base, semantic: 'received' })).toBeNull()
  })

  it('al preparar menciona la hora estimada y el link', () => {
    const msg = orderStatusMessage({ ...base, semantic: 'preparing', estimatedReadyAt: '2026-11-24T20:35:00Z', customerName: 'Ana López' })!
    expect(msg).toContain('Hola Ana.')
    expect(msg).toContain('Tu pedido #123 ya se está preparando.')
    expect(msg).toContain('Estará listo aproximadamente a las 2:35')
    expect(msg).toContain('Síguelo aquí: https://ianswer.pro/tracking/abc')
  })

  it('cambia el texto según si es para llevar, a domicilio o en mesa', () => {
    expect(orderStatusMessage({ ...base, semantic: 'ready' })).toContain('Ya puedes pasar por él.')
    expect(orderStatusMessage({ ...base, semantic: 'ready', deliveryType: 'delivery' })).toContain('sale a entregarse')
    expect(orderStatusMessage({ ...base, semantic: 'ready', deliveryType: 'dine_in' })).toContain('a tu mesa')
    expect(orderStatusMessage({ ...base, semantic: 'preparing', deliveryType: 'delivery', estimatedReadyAt: '2026-11-24T20:35:00Z' }))
      .toContain('sale a entregarse a las')
  })

  it('en camino, entregado y cancelado', () => {
    expect(orderStatusMessage({ ...base, semantic: 'out_for_delivery' })).toContain('va en camino')
    const delivered = orderStatusMessage({ ...base, semantic: 'delivered' })!
    expect(delivered).toContain('fue entregado')
    expect(delivered).not.toContain('Síguelo')
    expect(orderStatusMessage({ ...base, semantic: 'cancelled' })).toContain('fue cancelado')
  })

  it('sin número ni link sigue teniendo sentido', () => {
    expect(orderStatusMessage({ semantic: 'out_for_delivery', orderNumber: null, deliveryType: 'delivery' }))
      .toBe('Tu pedido va en camino.')
  })
})

describe('prepMinutes', () => {
  it('toma el platillo que más tarda', () => {
    expect(prepMinutes([{ menu_item_id: 'a' }, { menu_item_id: 'b' }], { a: 10, b: 25 })).toBe(25)
  })
  it('sin tiempos capturados usa el valor por omisión', () => {
    expect(prepMinutes([{ menu_item_id: 'a' }, {}], {}, 20)).toBe(20)
    expect(prepMinutes(null, {}, 15)).toBe(15)
  })
})

describe('insideServiceWindow', () => {
  const now = new Date('2026-11-24T20:00:00Z')
  it('dentro de 24 horas sí', () => {
    expect(insideServiceWindow('2026-11-24T10:00:00Z', now)).toBe(true)
  })
  it('después de 24 horas o sin mensajes no', () => {
    expect(insideServiceWindow('2026-11-23T19:59:00Z', now)).toBe(false)
    expect(insideServiceWindow(null, now)).toBe(false)
  })
})
