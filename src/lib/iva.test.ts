import { afterEach, describe, expect, it, vi } from 'vitest'
import { desgloseIva, ivaTaxRates } from './iva'

describe('ivaTaxRates', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('devuelve la tasa configurada', () => {
    vi.stubEnv('STRIPE_IVA_TAX_RATE_ID', 'txr_123')
    expect(ivaTaxRates()).toEqual(['txr_123'])
  })

  it('sin la variable no aplica IVA y lo avisa en el log', () => {
    vi.stubEnv('STRIPE_IVA_TAX_RATE_ID', '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(ivaTaxRates()).toEqual([])
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('desgloseIva', () => {
  it('con la tasa de Stripe usa su subtotal sin impuesto (Start: $1,500 + IVA)', () => {
    expect(desgloseIva(174000, 150000)).toEqual({ subtotalCents: 150000, ivaCents: 24000 })
  })

  it('sin impuesto separado toma el total como IVA incluido', () => {
    expect(desgloseIva(150000, 150000)).toEqual({ subtotalCents: 129310, ivaCents: 20690 })
  })

  it.each([null, undefined])('sin total_excluding_tax (%j) toma el total como IVA incluido', sinIva => {
    expect(desgloseIva(116000, sinIva)).toEqual({ subtotalCents: 100000, ivaCents: 16000 })
  })

  it('subtotal + IVA siempre suma el total cobrado', () => {
    for (const total of [1, 99, 57884, 174000, 870000]) {
      const { subtotalCents, ivaCents } = desgloseIva(total, null)
      expect(subtotalCents + ivaCents).toBe(total)
    }
  })
})
