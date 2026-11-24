import { describe, expect, it } from 'vitest'
import { campaignsLocked } from './campaignAccess'

describe('campaignsLocked', () => {
  it('bloquea si el plan no trae marketing y no hay saldo comprado', () => {
    expect(campaignsLocked(0, 0)).toBe(true)
  })
  it('se desbloquea con saldo comprado', () => {
    expect(campaignsLocked(0, 500)).toBe(false)
  })
  it('no bloquea en planes con marketing incluido (Pro)', () => {
    expect(campaignsLocked(500, 0)).toBe(false)
  })
  it('sin el dato del plan no bloquea', () => {
    expect(campaignsLocked(undefined, 0)).toBe(false)
    expect(campaignsLocked(null, 0)).toBe(false)
  })
})
