import { describe, expect, it } from 'vitest'
import { formatWhatsAppPhone } from './phone'

describe('formatWhatsAppPhone', () => {
  it('antepone 521 a un celular de 10 dígitos', () => {
    expect(formatWhatsAppPhone('999 123 4567')).toBe('5219991234567')
  })

  it('respeta un número que ya trae código de país', () => {
    expect(formatWhatsAppPhone('+52 1 999 123 4567')).toBe('5219991234567')
  })
})
