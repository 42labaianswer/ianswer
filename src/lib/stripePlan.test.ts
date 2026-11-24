import { describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { activateCheckoutAddons, resolvePlanSlug } from './stripePlan'

const PLANS = [{ slug: 'start', stripe_price_id: 'price_start_m', stripe_price_yearly_id: 'price_start_y' }]
const ADDONS = [
  { id: 'agent_training_pro', stripe_price_id: 'price_training', is_recurring: true },
  { id: 'ai_replies_1000', stripe_price_id: 'price_ai', is_recurring: false },
]

function fakeAdmin(rpcError: unknown = null) {
  const rpc = vi.fn(async () => ({ error: rpcError }))
  const from = vi.fn((table: string) => {
    if (table === 'plans') {
      let priceId = ''
      const chain = {
        select: () => chain,
        or: (filter: string) => { priceId = filter.split('.eq.')[1].split(',')[0]; return chain },
        limit: () => chain,
        maybeSingle: async () => ({
          data: PLANS.find(p => p.stripe_price_id === priceId || p.stripe_price_yearly_id === priceId) ?? null,
        }),
      }
      return chain
    }
    return {
      select: () => ({ in: async (_c: string, ids: string[]) => ({ data: ADDONS.filter(a => ids.includes(a.id)) }) }),
    }
  })
  return { admin: { from, rpc } as unknown as SupabaseClient, rpc }
}

const sub = (priceIds: string[], metadata: Record<string, string> = {}) => ({
  id: 'sub_1',
  metadata,
  items: { data: priceIds.map((p, i) => ({ id: `si_${i}`, price: { id: p } })) },
}) as unknown as Stripe.Subscription

describe('resolvePlanSlug', () => {
  it('encuentra el plan aunque no sea el primer item', async () => {
    const { admin } = fakeAdmin()
    expect(await resolvePlanSlug(admin, sub(['price_training', 'price_start_m'])))
      .toEqual({ planSlug: 'start', billingCycle: 'monthly' })
  })
  it('distingue el precio anual', async () => {
    const { admin } = fakeAdmin()
    expect(await resolvePlanSlug(admin, sub(['price_start_y'])))
      .toEqual({ planSlug: 'start', billingCycle: 'yearly' })
  })
  it('sin precio de plan usa metadata.planSlug', async () => {
    const { admin } = fakeAdmin()
    expect(await resolvePlanSlug(admin, sub(['price_otro'], { planSlug: 'growth' })))
      .toEqual({ planSlug: 'growth', billingCycle: null })
  })
})

describe('activateCheckoutAddons', () => {
  it('sin addonIds no hace nada', async () => {
    const { admin, rpc } = fakeAdmin()
    await activateCheckoutAddons(admin, { id: 'cs_1', metadata: {} }, sub(['price_start_m']), 'c1')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('liga el mensual a su item y registra el paquete con la sesión', async () => {
    const { admin, rpc } = fakeAdmin()
    await activateCheckoutAddons(
      admin,
      { id: 'cs_1', metadata: { addonIds: 'agent_training_pro,ai_replies_1000' } },
      sub(['price_start_m', 'price_training']),
      'c1',
    )
    expect(rpc).toHaveBeenCalledWith('activate_addon', expect.objectContaining({
      p_addon_id: 'agent_training_pro', p_stripe_subscription_item_id: 'si_1', p_stripe_checkout_session_id: 'cs_1',
    }))
    expect(rpc).toHaveBeenCalledWith('activate_addon', expect.objectContaining({
      p_addon_id: 'ai_replies_1000', p_stripe_subscription_item_id: null, p_stripe_checkout_session_id: 'cs_1',
    }))
  })

  it('no activa un mensual que no quedó en la suscripción', async () => {
    const { admin, rpc } = fakeAdmin()
    await activateCheckoutAddons(admin, { id: 'cs_1', metadata: { addonIds: 'agent_training_pro' } }, sub(['price_start_m']), 'c1')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('si la base falla lo deja en el log y sigue', async () => {
    const { admin, rpc } = fakeAdmin({ message: 'boom' })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await activateCheckoutAddons(admin, { id: 'cs_1', metadata: { addonIds: 'ai_replies_1000' } }, sub(['price_start_m']), 'c1')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
})
