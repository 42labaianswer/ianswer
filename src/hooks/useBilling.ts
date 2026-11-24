 

// src/hooks/useBilling.ts
// ----------------------------------------------------------------------------
// Hooks para billing (plan + addons + próximo pago) y consumo del periodo.
// ----------------------------------------------------------------------------

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import type { UsageSummary } from '../lib/usageSummary'

// ─── Consumo del periodo de cobro (respuestas de IA, recordatorios, marketing)
export function useUsageSummary(companyId: string | undefined) {
  return useQuery({
    queryKey: ['usage-summary', companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<UsageSummary | null> => {
      if (!companyId) return null
      const { data, error } = await supabase.rpc('get_usage_summary', { p_company_id: companyId })
      if (error) throw error
      return (data as UsageSummary) || null
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

// ─── Cancelar un addon (usuario final: también lo cancela en Stripe) ───────
export function useCancelAddon() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { companyId: string; addonId: string }): Promise<string | null> => {
      const res = await fetch('/api/stripe/cancel-addon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addonId: params.addonId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'No se pudo cancelar')
      return (body.endsAt as string | null) ?? null
    },
    onSuccess: (endsAt) => {
      void queryClient.invalidateQueries({ queryKey: ['active-addons-detailed'] })
      void queryClient.invalidateQueries({ queryKey: ['active-addons'] })
      void queryClient.invalidateQueries({ queryKey: ['entitlements'] })
      const later = endsAt && new Date(endsAt).getTime() > Date.now() + 60_000
      toast.success(later
        ? `Complemento cancelado. Lo sigues teniendo hasta el ${new Date(endsAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}.`
        : 'Complemento cancelado.')
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
