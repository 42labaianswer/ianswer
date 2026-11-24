// Campañas se bloquea cuando el plan no incluye mensajes de marketing (solo
// Pro los trae) y la empresa no tiene saldo comprado vigente. Al comprar un
// paquete se desbloquea.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useEntitlements } from './useEntitlements'
import { campaignsLocked } from '../lib/campaignAccess'

export function useCampaignsLocked(): boolean {
  const { data: entitlements } = useEntitlements()
  const planCap = (entitlements?.capacity as Record<string, number | null | undefined> | undefined)
    ?.max_campaign_messages_per_month

  const { data: creditsLeft = 0 } = useQuery({
    queryKey: ['marketing-credits'],
    enabled: planCap === 0,
    queryFn: async (): Promise<number> => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return 0
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      if (!profile?.company_id) return 0
      const { data } = await supabase
        .from('usage_credits')
        .select('amount, used')
        .eq('company_id', profile.company_id)
        .eq('metric', 'campaign_messages')
        .gt('expires_at', new Date().toISOString())
      return (data || []).reduce((sum, r: { amount: number; used: number }) => sum + (r.amount - r.used), 0)
    },
    staleTime: 60 * 1000,
  })

  return campaignsLocked(planCap, creditsLeft)
}
