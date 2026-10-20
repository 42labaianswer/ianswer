import { describe, expect, it } from 'vitest'
import { GRACE_DAYS, hasDashboardAccess, isSubscriptionBlocked } from './subscription'

const NOW = new Date('2026-10-20T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString()

describe('isSubscriptionBlocked (lista negra, replicada en n8n)', () => {
  it.each(['expired', 'canceled', ' Canceled '])('bloquea %j', status => {
    expect(isSubscriptionBlocked({ status }, NOW)).toBe(true)
  })

  it.each(['active', 'trialing', 'inactive', 'algo-nuevo', '', null, undefined])(
    'no bloquea %j (estado desconocido no bloquea)',
    status => {
      expect(isSubscriptionBlocked({ status }, NOW)).toBe(false)
    }
  )

  it('past_due dentro de la gracia no bloquea', () => {
    expect(isSubscriptionBlocked({ status: 'past_due', trialEndsAt: daysAgo(GRACE_DAYS) }, NOW)).toBe(false)
  })

  it('past_due pasada la gracia bloquea', () => {
    expect(isSubscriptionBlocked({ status: 'past_due', trialEndsAt: daysAgo(GRACE_DAYS + 0.1) }, NOW)).toBe(true)
  })

  it('past_due sin fecha de referencia no bloquea', () => {
    expect(isSubscriptionBlocked({ status: 'past_due' }, NOW)).toBe(false)
  })
})

describe('hasDashboardAccess (lista blanca)', () => {
  it.each(['trialing', 'active', 'ACTIVE '])('deja entrar con %j', status => {
    expect(hasDashboardAccess({ status }, NOW)).toBe(true)
  })

  it.each(['inactive', 'canceled', 'expired', 'algo-nuevo', '', null])('no deja entrar con %j', status => {
    expect(hasDashboardAccess({ status }, NOW)).toBe(false)
  })

  it('past_due deja entrar solo dentro de la gracia', () => {
    expect(hasDashboardAccess({ status: 'past_due', trialEndsAt: daysAgo(1) }, NOW)).toBe(true)
    expect(hasDashboardAccess({ status: 'past_due', trialEndsAt: daysAgo(GRACE_DAYS + 1) }, NOW)).toBe(false)
  })
})
