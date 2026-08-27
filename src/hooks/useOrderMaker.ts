 

// src/hooks/useOrderMaker.ts
// ----------------------------------------------------------------------------
// Sprint Q · Hooks para crear órdenes manuales conectadas al menú.
// ----------------------------------------------------------------------------

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// ─── Tipos ─────────────────────────────────────────────────────────────────
export interface MenuItemForOrder {
  id: string
  name: string
  description: string | null
  price: number
  category_id: string | null
  is_available: boolean
  photo_url: string | null
}

export interface MenuCategoryForOrder {
  id: string
  name: string
  display_order: number
}

export interface OrderLineItem {
  menu_item_id: string
  item_name: string
  quantity: number
  unit_price: number
  subtotal: number
  notes?: string
}

export interface CreateOrderInput {
  company_id: string
  contact_id?: string
  contact_name: string
  contact_phone: string
  delivery_type: 'pickup' | 'delivery' | 'dine_in'
  delivery_address?: string
  payment_method?: string
  notes?: string
  items: OrderLineItem[]
  subtotal: number
  tax: number
  tip: number
  delivery_fee: number
  total: number
}

// ─── Cargar el menú (categorías + items disponibles) ───────────────────────
export function useMenuForOrder(companyId: string | undefined) {
  return useQuery({
    queryKey: ['menu-for-order', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      if (!companyId) return { categories: [], items: [] }

      const [catsRes, itemsRes] = await Promise.all([
        supabase
          .from('menu_categories')
          .select('*')
          .eq('company_id', companyId)
          .order('display_order'),
        supabase
          .from('menu_items')
          .select('*')
          .eq('company_id', companyId)
          .order('display_order'),
      ])

      if (catsRes.error) throw catsRes.error
      if (itemsRes.error) throw itemsRes.error

      return {
        categories: (catsRes.data || []) as MenuCategoryForOrder[],
        items: (itemsRes.data || []) as MenuItemForOrder[],
      }
    },
    staleTime: 60 * 1000,
  })
}

// ─── Config del restaurante (IVA, propina, envío) ──────────────────────────
export function useRestaurantOrderConfig(companyId: string | undefined) {
  return useQuery({
    queryKey: ['restaurant-order-config', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      if (!companyId) return null
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .maybeSingle()

      if (error) throw error
      return data as {
        tax_rate: number | null
        delivery_fee_default: number | null
        tip_suggestions: number[] | null
        min_order_amount: number | null
        order_statuses: Array<{ step: number; name: string; semantic: string }> | null
      } | null
    },
    staleTime: 60 * 1000,
  })
}

// ─── Crear la orden ────────────────────────────────────────────────────────
export function useCreateManualOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      // Generar order_number: ORD-{timestamp corto}
      const orderNumber = `ORD-${Date.now().toString().slice(-6)}`

      // Estado inicial: primer paso del flujo del restaurante
      const { data: company } = await supabase
        .from('companies')
        .select('order_statuses')
        .eq('id', input.company_id)
        .maybeSingle()

      const statuses = (company?.order_statuses as Array<{
        step: number
        name: string
        semantic: string
      }>) || []
      const firstStatus = statuses.find((s) => s.step === 0) || {
        step: 0,
        name: 'Recibida',
        semantic: 'received',
      }

      const { data, error } = await supabase
        .from('orders')
        .insert([
          {
            company_id: input.company_id,
            order_number: orderNumber,
            contact_id: input.contact_id || null,
            contact_name: input.contact_name,
            contact_phone: input.contact_phone.replace(/\D/g, ''),
            delivery_type: input.delivery_type,
            delivery_address: input.delivery_address || null,
            payment_method: input.payment_method || null,
            notes: input.notes || null,
            items: input.items,
            subtotal: input.subtotal,
            tax: input.tax,
            tip: input.tip,
            delivery_fee: input.delivery_fee,
            total: input.total,
            status_semantic: firstStatus.semantic,
            status_label: firstStatus.name,
            status_step: firstStatus.step,
            source: 'manual',
          },
        ])
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['company-orders'] })
      queryClient.invalidateQueries({ queryKey: ['trackable-orders'] })
    },
  })
}
