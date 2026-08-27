 

// src/hooks/useBilling.ts
// ----------------------------------------------------------------------------
// Sprint U · Hooks para billing (plan + addons + próximo pago) y uso de sesiones.
// ----------------------------------------------------------------------------

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// ─── Uso del mes actual (sesiones) ─────────────────────────────────────────
export interface UsageData {
  sessions_used: number
  sessions_limit: number
  period_start: string
  period_end: string
  pct_used: number
}

export function useUsageCurrentMonth(companyId: string | undefined) {
  return useQuery({
    queryKey: ['usage-current-month', companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<UsageData | null> => {
      if (!companyId) return null
      const { data, error } = await supabase.rpc('get_usage_current_month', {
        p_company_id: companyId,
      })
      if (error) throw error
      // La RPC devuelve un array con una fila
      const row = Array.isArray(data) ? data[0] : data
      return (row as UsageData) || null
    },
    staleTime: 60 * 1000,
  })
}

// ─── Addons activos con su precio (para el desglose de próximo pago) ────────
export interface ActiveAddonDetail {
  addon_id: string
  name: string
  short_name: string | null
  icon: string
  price_monthly_cents: number
  currency: string
  is_recurring: boolean
  status: string
  current_period_end: string | null
}

export function useActiveAddonsDetailed(companyId: string | undefined) {
  return useQuery({
    queryKey: ['active-addons-detailed', companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<ActiveAddonDetail[]> => {
      if (!companyId) return []
      const { data, error } = await supabase
        .from('company_addons')
        .select(`
          addon_id, status, current_period_end,
          addons ( name, short_name, icon, price_monthly_cents, currency, is_recurring )
        `)
        .eq('company_id', companyId)
        .eq('status', 'active')

      if (error) throw error

      // Supabase infiere el join como array aunque en la práctica sea 1 fila.
      // Normalizamos: tomamos el primer elemento si viene como array.
      type AddonJoin = {
        name: string
        short_name: string | null
        icon: string
        price_monthly_cents: number
        currency: string
        is_recurring: boolean
      }
      type Row = {
        addon_id: string
        status: string
        current_period_end: string | null
        addons: AddonJoin | AddonJoin[] | null
      }

      return ((data as Row[]) || []).map((row) => {
        const a = Array.isArray(row.addons) ? row.addons[0] : row.addons
        return {
          addon_id: row.addon_id,
          name: a?.name || 'Addon',
          short_name: a?.short_name || null,
          icon: a?.icon || 'Puzzle',
          price_monthly_cents: a?.price_monthly_cents || 0,
          currency: a?.currency || 'MXN',
          is_recurring: a?.is_recurring ?? true,
          status: row.status,
          current_period_end: row.current_period_end,
        }
      })
    },
    staleTime: 60 * 1000,
  })
}

// ─── Cancelar un addon (usuario final: vía cancel_addon) ────────────────────
export function useCancelAddon() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { companyId: string; addonId: string }) => {
      const { error } = await supabase.rpc('cancel_addon', {
        p_company_id: params.companyId,
        p_addon_id: params.addonId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-addons-detailed'] })
      queryClient.invalidateQueries({ queryKey: ['active-addons'] })
      queryClient.invalidateQueries({ queryKey: ['entitlements'] })
      toast.success('Addon cancelado. El acceso continúa hasta el fin del periodo.')
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Error al cancelar'),
  })
}

// ─── Cancelar el plan (redirige al portal de Stripe) ───────────────────────
export function useCancelPlan() {
  return useMutation({
    mutationFn: async (companyId: string) => {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'No se pudo abrir el portal de facturación')
      }
      const { url } = await res.json()
      return url as string
    },
    onSuccess: (url: string) => {
      if (url) window.location.href = url
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Error'),
  })
}
