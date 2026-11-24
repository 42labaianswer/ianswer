import { describe, expect, it } from 'vitest'
import { addonsForPlanCheckout, type CheckoutAddon } from './checkoutAddons'

const addon = (over: Partial<CheckoutAddon>): CheckoutAddon => ({
  id: 'x', stripe_price_id: 'price_x', is_recurring: true, is_active: true,
  requires_plan_min: null, feature_flags: {}, credit_grants: {}, ...over,
})

const training = addon({ id: 'agent_training_pro', feature_flags: { agent_training_pro: true } })
const menu = addon({ id: 'restaurant_menu', requires_plan_min: 'start', feature_flags: { menu_pdf_import: true } })
const pack = addon({ id: 'ai_replies_1000', is_recurring: false, credit_grants: { ai_replies: 1000 } })

describe('addonsForPlanCheckout', () => {
  it('deja pasar los que el plan alcanza y no incluye', () => {
    const ids = addonsForPlanCheckout([training, menu, pack], 'start', {}, 'monthly').map(a => a.id)
    expect(ids).toEqual(['agent_training_pro', 'restaurant_menu', 'ai_replies_1000'])
  })
  it('quita los que piden un plan mayor', () => {
    const ids = addonsForPlanCheckout([menu, pack], 'lite', {}, 'monthly').map(a => a.id)
    expect(ids).toEqual(['ai_replies_1000'])
  })
  it('quita los que el plan ya incluye', () => {
    const ids = addonsForPlanCheckout([training], 'growth', { agent_training_pro: true }, 'monthly')
    expect(ids).toEqual([])
  })
  it('sin precio de Stripe o inactivo no se cobra', () => {
    expect(addonsForPlanCheckout([addon({ stripe_price_id: null })], 'start', {}, 'monthly')).toEqual([])
    expect(addonsForPlanCheckout([addon({ is_active: false })], 'start', {}, 'monthly')).toEqual([])
  })
  it('con plan anual solo pasan los de pago único', () => {
    const ids = addonsForPlanCheckout([training, pack], 'start', {}, 'yearly').map(a => a.id)
    expect(ids).toEqual(['ai_replies_1000'])
  })
})
