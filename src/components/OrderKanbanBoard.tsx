 

'use client'

/**
 * ============================================================================
 * OrderKanbanBoard · v2.19
 * ----------------------------------------------------------------------------
 * Kanban con columnas dinámicas según companies.order_statuses.
 * Drag and drop con HTML5 nativo (sin librería externa).
 *
 * Cada columna tiene un semantic distinto (received, preparing, etc.) y label
 * custom del restaurante. Las cards se pueden arrastrar entre columnas para
 * cambiar el estado de la orden.
 *
 * Cancelled queda como columna separada (status_step = -1).
 * ============================================================================
 */

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Clock, Phone, MapPin, ShoppingBag, AlertCircle, Loader2, X,
  ChevronRight, Truck, Store, UserCheck
} from 'lucide-react'

import OrderDrawer from './OrderDrawer'
import IAnswerLoader from './IAnswerLoader'

type OrderStatus = {
  step: number
  name: string
  semantic: string
  avg_minutes: number
}

type Order = {
  id: string
  order_number: number
  contact_name: string | null
  contact_phone: string | null
  status_semantic: string
  status_label: string
  status_step: number
  total: number
  delivery_type: 'pickup' | 'delivery' | 'dine_in'
  delivery_address?: string | null
  notes?: string | null
  created_at: string
  estimated_ready_at?: string | null
  items?: any[]
  public_token?: string | null
}

type Props = {
  companyId: string
  accentColor: string
}

export default function OrderKanbanBoard({ companyId, accentColor }: Props) {
  const queryClient = useQueryClient()
  const [draggingOrderId, setDraggingOrderId] = useState<string | null>(null)
  const [hoverColumnStep, setHoverColumnStep] = useState<number | null>(null)
  const [drawerOrder, setDrawerOrder] = useState<Order | null>(null)

  // 1) Cargar estados configurados de la company
  const { data: company } = useQuery({
    queryKey: ['company-order-statuses', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('order_statuses, order_auto_simulate')
        .eq('id', companyId)
        .single()
      if (error) throw error
      return data
    }
  })

  const statuses: OrderStatus[] = (company?.order_statuses as OrderStatus[]) || []

  // 2) Cargar órdenes activas (excluir delivered viejas)
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders-active', companyId],
    queryFn: async (): Promise<Order[]> => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()  // últimas 24h
      const { data, error } = await supabase
        .from('v_orders_full')
        .select('*')
        .eq('company_id', companyId)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []) as Order[]
    },
    refetchInterval: 30 * 1000  // refresh cada 30s
  })

  // 3) Mutation: mover orden a otro status
  const moveOrderMutation = useMutation({
    mutationFn: async ({ orderId, targetStep }: { orderId: string, targetStep: number }) => {
      // Buscar el status que tiene ese step
      const target = statuses.find(s => s.step === targetStep)
      if (!target) {
        // Caso especial: -1 = cancelled
        if (targetStep === -1) {
          const { error } = await supabase.from('orders').update({
            status_semantic: 'cancelled',
            status_label: 'Cancelada',
            status_step: -1
          }).eq('id', orderId)
          if (error) throw error
          return
        }
        throw new Error('Estado destino no encontrado')
      }

      const { error } = await supabase.from('orders').update({
        status_semantic: target.semantic,
        status_label: target.name,
        status_step: target.step
      }).eq('id', orderId)
      if (error) throw error

      // Log con changed_by='admin' (porque viene del dashboard)
      await supabase.from('order_status_history').insert({
        order_id: orderId,
        status_semantic: target.semantic,
        status_label: target.name,
        status_step: target.step,
        changed_by: 'admin'
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders-active', companyId] })
      toast.success('Estado actualizado')
    },
    onError: (err: any) => toast.error(`Error: ${err.message}`)
  })

  // Agrupar órdenes por step
  const ordersByStep = useMemo(() => {
    const map = new Map<number, Order[]>()
    statuses.forEach(s => map.set(s.step, []))
    map.set(-1, []) // Cancelled
    orders.forEach(o => {
      const arr = map.get(o.status_step) || []
      arr.push(o)
      map.set(o.status_step, arr)
    })
    return map
  }, [orders, statuses])

  // ----- DRAG HANDLERS -----
  const handleDragStart = (orderId: string) => {
    setDraggingOrderId(orderId)
  }

  const handleDragEnd = () => {
    setDraggingOrderId(null)
    setHoverColumnStep(null)
  }

  const handleColumnDragOver = (e: React.DragEvent, step: number) => {
    e.preventDefault()
    setHoverColumnStep(step)
  }

  const handleColumnDrop = (e: React.DragEvent, step: number) => {
    e.preventDefault()
    if (!draggingOrderId) return
    const order = orders.find(o => o.id === draggingOrderId)
    if (order && order.status_step !== step) {
      moveOrderMutation.mutate({ orderId: draggingOrderId, targetStep: step })
    }
    handleDragEnd()
  }

  if (isLoading || !statuses.length) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <IAnswerLoader size={32} />
      </div>
    )
  }

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4">
        {/* Columnas regulares */}
        {statuses.map(status => {
          const columnOrders = ordersByStep.get(status.step) || []
          const isHover = hoverColumnStep === status.step
          return (
            <KanbanColumn
              key={status.step}
              status={status}
              orders={columnOrders}
              accentColor={accentColor}
              isHover={isHover}
              onDragOver={(e) => handleColumnDragOver(e, status.step)}
              onDrop={(e) => handleColumnDrop(e, status.step)}
              onCardClick={setDrawerOrder}
              onCardDragStart={handleDragStart}
              onCardDragEnd={handleDragEnd}
            />
          )
        })}

        {/* Columna Cancelled (siempre al final si hay) */}
        {(ordersByStep.get(-1) || []).length > 0 && (
          <KanbanColumn
            status={{ step: -1, name: 'Canceladas', semantic: 'cancelled', avg_minutes: 0 }}
            orders={ordersByStep.get(-1) || []}
            accentColor="#94a3b8"
            isHover={hoverColumnStep === -1}
            onDragOver={(e) => handleColumnDragOver(e, -1)}
            onDrop={(e) => handleColumnDrop(e, -1)}
            onCardClick={setDrawerOrder}
            onCardDragStart={handleDragStart}
            onCardDragEnd={handleDragEnd}
          />
        )}
      </div>

      {/* Drawer */}
      <OrderDrawer
        isOpen={!!drawerOrder}
        onClose={() => setDrawerOrder(null)}
        order={drawerOrder}
        companyId={companyId}
        accentColor={accentColor}
      />
    </>
  )
}

// ============================================================================
// COLUMNA del Kanban
// ============================================================================
function KanbanColumn({ status, orders, accentColor, isHover, onDragOver, onDrop, onCardClick, onCardDragStart, onCardDragEnd }: {
  status: OrderStatus
  orders: Order[]
  accentColor: string
  isHover: boolean
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onCardClick: (o: Order) => void
  onCardDragStart: (id: string) => void
  onCardDragEnd: () => void
}) {
  const SEMANTIC_COLORS: Record<string, string> = {
    received:   '#3b82f6',
    confirmed:  '#06b6d4',
    preparing:  '#f59e0b',
    ready:      '#10b981',
    shipping:   '#8b5cf6',
    delivered:  '#22c55e',
    cancelled:  '#94a3b8'
  }
  const color = SEMANTIC_COLORS[status.semantic] || accentColor

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`shrink-0 w-72 rounded-2xl flex flex-col transition-all ${
        isHover ? 'bg-slate-100 ring-2 ring-offset-2' : 'bg-slate-50'
      }`}
      style={isHover ? { '--tw-ring-color': color } as any : {}}
    >
      {/* Header de columna */}
      <div className="px-3 py-3 border-b border-slate-200/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">{status.name}</h3>
        </div>
        <span className="text-xs font-black text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
          {orders.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-280px)] overflow-y-auto">
        {orders.length === 0 ? (
          <div className="text-center py-8 text-[10px] text-slate-400 font-bold">
            Arrastra cards aquí
          </div>
        ) : (
          orders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              statusColor={color}
              onClick={() => onCardClick(order)}
              onDragStart={() => onCardDragStart(order.id)}
              onDragEnd={onCardDragEnd}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ============================================================================
// CARD de orden (draggable)
// ============================================================================
function OrderCard({ order, statusColor, onClick, onDragStart, onDragEnd }: {
  order: Order
  statusColor: string
  onClick: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const itemsCount = (order.items || []).reduce((sum: number, it: any) => sum + (it.quantity || 0), 0)
  const minutesSince = Math.round((Date.now() - new Date(order.created_at).getTime()) / 60000)
  const isLate = order.estimated_ready_at && new Date(order.estimated_ready_at).getTime() < Date.now() && order.status_semantic !== 'delivered'

  const DeliveryIcon = order.delivery_type === 'delivery' ? Truck
                     : order.delivery_type === 'pickup'   ? Store
                                                          : UserCheck

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="bg-white border border-slate-200 rounded-xl p-3 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-slate-300 transition-all relative group"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="font-black text-slate-900 text-sm">#{order.order_number}</p>
          {order.contact_name && (
            <p className="text-[11px] text-slate-700 font-bold truncate mt-0.5">{order.contact_name}</p>
          )}
        </div>
        <DeliveryIcon size={14} className="text-slate-400 shrink-0" />
      </div>

      {/* Items resumen */}
      <p className="text-xs text-slate-600 line-clamp-1">
        <ShoppingBag size={10} className="inline mr-1 text-slate-400" />
        {itemsCount > 0 ? `${itemsCount} items` : 'Sin items'}
        {(order.items || []).length > 0 && ' · '}
        {(order.items || []).slice(0, 2).map((it: any) => `${it.quantity}x ${it.item_name}`).join(', ')}
        {(order.items || []).length > 2 && '...'}
      </p>

      {/* Address si delivery */}
      {order.delivery_type === 'delivery' && order.delivery_address && (
        <p className="text-[10px] text-slate-500 mt-1 line-clamp-1 flex items-start gap-1">
          <MapPin size={9} className="text-slate-400 shrink-0 mt-0.5" />
          {order.delivery_address}
        </p>
      )}

      {/* Notes */}
      {order.notes && (
        <p className="text-[10px] text-amber-700 bg-amber-50 px-2 py-1 rounded mt-2 line-clamp-2 italic">
          📝 {order.notes}
        </p>
      )}

      {/* Footer: precio + tiempo */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
        <span className="text-sm font-black text-slate-900">${order.total.toFixed(0)}</span>
        <div className="flex items-center gap-2">
          {isLate && <AlertCircle size={11} className="text-rose-500" />}
          <span className={`text-[10px] font-bold flex items-center gap-0.5 ${isLate ? 'text-rose-600' : 'text-slate-500'}`}>
            <Clock size={9} /> {minutesSince}m
          </span>
        </div>
      </div>
    </div>
  )
}
