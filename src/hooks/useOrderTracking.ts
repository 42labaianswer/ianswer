 

// src/hooks/useOrderTracking.ts
// ----------------------------------------------------------------------------
// Sprint O · Hooks para el addon de Tracking de Pedidos.
// ----------------------------------------------------------------------------

import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// ─── ¿Tiene el addon de tracking activo? ───────────────────────────────────
export function useHasOrderTrackingAddon() {
  return useQuery({
    queryKey: ['has-order-tracking-addon'],
    queryFn: async (): Promise<boolean> => {
      const { data: userRes } = await supabase.auth.getUser()
      if (!userRes.user) return false

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', userRes.user.id)
        .maybeSingle()

      if (!profile?.company_id) return false

      const { data, error } = await supabase.rpc('has_order_tracking_active', {
        p_company_id: profile.company_id,
      })

      if (error) {
        console.error('[useHasOrderTrackingAddon] error:', error)
        return false
      }
      return data === true
    },
    staleTime: 60 * 1000,
  })
}

// ─── Órdenes activas con su tracking token (para el tab de tracking) ───────
export interface TrackableOrder {
  id: string
  order_number: string
  contact_name: string | null
  contact_phone: string | null
  status_label: string
  status_semantic: string
  status_step: number
  delivery_type: string
  total: number
  public_token: string
  created_at: string
}

export function useTrackableOrders(companyId: string | undefined) {
  return useQuery({
    queryKey: ['trackable-orders', companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<TrackableOrder[]> => {
      if (!companyId) return []

      // Órdenes de las últimas 48h que no estén en estado final
      const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, order_number, contact_name, contact_phone, status_label, status_semantic, status_step, delivery_type, total, public_token, created_at'
        )
        .eq('company_id', companyId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data || []) as TrackableOrder[]
    },
    refetchInterval: 30 * 1000, // refresca cada 30s para ver cambios de estado
  })
}
