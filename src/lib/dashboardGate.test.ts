import { describe, expect, it } from 'vitest'
import { computeDashboardGate, isBlockedAllowedPath, type GateCompany } from './dashboardGate'

const company = (over: Partial<GateCompany> = {}): GateCompany => ({
  onboarding_completed: true,
  subscription_status: 'active',
  trial_ends_at: null,
  stripe_subscription_id: 'sub_123',
  ...over,
})

describe('computeDashboardGate', () => {
  it('cuenta con suscripción viva → ok', () => {
    expect(computeDashboardGate(company(), true)).toBe('ok')
  })

  it('sin onboarding y sin industria → wizard', () => {
    expect(computeDashboardGate(company({ onboarding_completed: false }), false)).toBe('wizard')
  })

  it('sin onboarding pero con industria y suscripción viva → ok', () => {
    expect(computeDashboardGate(company({ onboarding_completed: false }), true)).toBe('ok')
  })

  it('terminó el wizard pero nunca pasó por Stripe → wizard (paso 5)', () => {
    expect(computeDashboardGate(company({ stripe_subscription_id: null, subscription_status: 'inactive' }), true)).toBe('wizard')
  })

  it('plan forzado por admin (active sin Stripe) → ok', () => {
    expect(computeDashboardGate(company({ stripe_subscription_id: null }), true)).toBe('ok')
  })

  it.each(['canceled', 'expired', 'inactive'])('tuvo Stripe y quedó %s → blocked', status => {
    expect(computeDashboardGate(company({ subscription_status: status }), true)).toBe('blocked')
  })
})

describe('isBlockedAllowedPath', () => {
  it.each(['/dashboard/plans', '/dashboard/admin', '/dashboard/help', '/dashboard/profile', '/dashboard/help/articulo'])(
    'permite %s',
    path => expect(isBlockedAllowedPath(path)).toBe(true)
  )

  it.each(['/dashboard', '/dashboard/inbox', '/dashboard/settings', '/dashboard/plansx', '/dashboard/helpdesk'])(
    'bloquea %s',
    path => expect(isBlockedAllowedPath(path)).toBe(false)
  )
})
