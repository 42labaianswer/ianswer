 

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// ============================================================================
// useAddons (v3.0)
// ----------------------------------------------------------------------------
// Lista addons del catálogo filtrado por templates instalados + addons activos.
// Incluye mutación para iniciar checkout (vía API) y cancelar.
// ============================================================================

/**
 * Trae el catálogo de addons disponibles para la company actual,
 * filtrado por los templates instalados.
 *
 * Para la UI de admin (que muestra todos), usar useAllAddonsCatalog().
 */
export function useAddonsCatalog() {
  return useQuery({
    queryKey: ['addons-catalog-filtered'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single()

      if (!profile?.company_id) return []

      // RPC nueva del Sprint 4 — devuelve solo addons disponibles para los
      // templates instalados (o universales).
      const { data, error } = await supabase
        .rpc('get_company_available_addons', { p_company_id: profile.company_id })

      if (error) {
        console.error('[useAddonsCatalog] RPC error, falling back to full catalog:', error)
        // Fallback: catálogo completo si el RPC falla
        // Computamos is_template_specific localmente porque el RPC no está disponible
        const { data: fallback } = await supabase
          .from('addons')
          .select('*')
          .eq('is_active', true)
          .order('display_order')
        return (fallback || []).map((a: any) => ({
          ...a,
          is_template_specific: Array.isArray(a.available_for_templates) && a.available_for_templates.length > 0,
          available_for_templates: Array.isArray(a.available_for_templates) ? a.available_for_templates : []
        }))
      }

      return data || []
    },
    staleTime: 5 * 60 * 1000
  })
}

/**
 * Catálogo COMPLETO (sin filtrar). Para el admin tab.
 */
export function useAllAddonsCatalog() {
  return useQuery({
    queryKey: ['addons-catalog-all'],
    queryFn: async () => {
      const { data } = await supabase
        .from('addons')
        .select('*')
        .order('display_order')
      return data || []
    },
    staleTime: 30 * 60 * 1000
  })
}

export function useActiveAddons() {
  return useQuery({
    queryKey: ['active-addons'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single()

      if (!profile?.company_id) return []

      const { data } = await supabase
        .from('company_addons')
        .select(`
          id, addon_id, quantity, status, activated_at, current_period_end,
          addon:addons(*)
        `)
        .eq('company_id', profile.company_id)
        .eq('status', 'active')

      return data || []
    },
    staleTime: 5 * 60 * 1000
  })
}

export function useAddonMutations() {
  const queryClient = useQueryClient()

  // Activar addon (redirige a Stripe Checkout)
  const activate = useMutation({
    mutationFn: async ({ addonId, isOneTime, isFree }: { addonId: string, isOneTime: boolean, isFree?: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user!.id).single()

      // ── Addon GRATIS: activar directo, sin pasar por Stripe ──
      if (isFree) {
        const { error } = await supabase.rpc('activate_addon', {
          p_company_id: profile!.company_id,
          p_addon_id: addonId,
          p_quantity: 1
        })
        if (error) throw error
        return null // sin URL: no redirige a Stripe
      }

      // ── Addon de pago: Stripe Checkout ──
      const response = await fetch('/api/stripe/checkout-addon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: profile!.company_id,
          addonId,
          isOneTime
        })
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Error en checkout')
      }

      const { url } = await response.json()
      return url
    },
    onSuccess: (url) => {
      if (url) {
        window.location.href = url  // addon de pago → Stripe
      } else {
        // addon gratis → ya quedó activo, refrescar
        queryClient.invalidateQueries({ queryKey: ['active-addons'] })
        queryClient.invalidateQueries({ queryKey: ['entitlements'] })
        toast.success('Función activada')
      }
    },
    onError: (e: any) => toast.error(e?.message)
  })

  // ⚙️ Activar addon SIN pasar por Stripe (solo admin, modo dev/testing)
  // Llama directo el RPC activate_addon de la DB con 30 días de trial gratis.
  const activateAsAdmin = useMutation({
    mutationFn: async ({ addonId }: { addonId: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('company_id, is_admin').eq('id', user!.id).single()
      
      if (!profile?.is_admin) {
        throw new Error('Solo administradores pueden activar addons sin pago')
      }

      const { error } = await supabase.rpc('activate_addon', {
        p_company_id: profile.company_id,
        p_addon_id: addonId,
        p_quantity: 1
      })
      if (error) throw error

      // Setear current_period_end a 30 días (trial dev)
      const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      await supabase
        .from('company_addons')
        .update({ current_period_end: trialEnd })
        .eq('company_id', profile.company_id)
        .eq('addon_id', addonId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-addons'] })
      queryClient.invalidateQueries({ queryKey: ['entitlements'] })
      toast.success('Addon activado (modo admin · 30 días)')
    },
    onError: (e: any) => toast.error(e?.message || 'Error activando addon')
  })

  const cancel = useMutation({
    mutationFn: async (addonId: string) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user!.id).single()
      const { error } = await supabase.rpc('cancel_addon', {
        p_company_id: profile!.company_id,
        p_addon_id: addonId
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-addons'] })
      queryClient.invalidateQueries({ queryKey: ['entitlements'] })
      toast.success('Addon cancelado')
    },
    onError: (e: any) => toast.error(e?.message)
  })

  // ⚙️ Desactivar addon directo (solo admin, sin flujo de Stripe).
  // Para el usuario final el flujo real es cancelar su suscripción en Stripe;
  // esto es el atajo de admin para pruebas.
  const deactivateAsAdmin = useMutation({
    mutationFn: async ({ addonId }: { addonId: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('company_id, is_admin').eq('id', user!.id).single()

      if (!profile?.is_admin) {
        throw new Error('Solo administradores pueden desactivar addons directamente')
      }

      const { error } = await supabase.rpc('cancel_addon', {
        p_company_id: profile.company_id,
        p_addon_id: addonId
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-addons'] })
      queryClient.invalidateQueries({ queryKey: ['entitlements'] })
      toast.success('Addon desactivado (modo admin)')
    },
    onError: (e: any) => toast.error(e?.message || 'Error desactivando addon')
  })

  return { activate, activateAsAdmin, cancel, deactivateAsAdmin }
}
