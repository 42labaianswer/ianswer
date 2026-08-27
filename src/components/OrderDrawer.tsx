 

'use client'

/**
 * ============================================================================
 * OrderDrawer · v2.19
 * ----------------------------------------------------------------------------
 * Drawer con todos los detalles de una orden:
 *   - Cliente (nombre, teléfono)
 *   - Items con modifiers
 *   - Totales desglosados
 *   - Historial de cambios de estado
 *   - Acciones: avanzar estado, cancelar, marcar pagado
 * ============================================================================
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  X, Loader2, Phone, MapPin, Clock, ChevronRight, Truck, Store, UserCheck,
  CheckCircle2, XCircle, DollarSign, CreditCard, Coins, Copy, ExternalLink,
  ShoppingBag, History, AlertTriangle
} from 'lucide-react'

type Order = any
type Props = {
  isOpen: boolean
  onClose: () => void
  order: Order | null
  companyId: string
  accentColor: string
}

export default function OrderDrawer({ isOpen, onClose, order, companyId, accentColor }: Props) {
  const queryClient = useQueryClient()

  // History
  const { data: history = [] } = useQuery({
    queryKey: ['order-history', order?.id],
    queryFn: async () => {
      if (!order?.id) return []
      const { data } = await supabase
        .from('order_status_history')
        .select('*')
        .eq('order_id', order.id)
        .order('changed_at', { ascending: true })
      return data || []
    },
    enabled: !!order?.id && isOpen
  })

  // Mutations
  const advanceMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('advance_order_status', {
        p_order_id: order.id,
        p_changed_by: 'admin'
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Estado avanzado')
      queryClient.invalidateQueries({ queryKey: ['orders-active', companyId] })
      queryClient.invalidateQueries({ queryKey: ['order-history', order?.id] })
      onClose()
    },
    onError: (err: any) => toast.error(err.message)
  })

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const reason = prompt('Motivo de cancelación (opcional):')
      const { error } = await supabase.rpc('cancel_order', {
        p_order_id: order.id,
        p_reason: reason || null
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Orden cancelada')
      queryClient.invalidateQueries({ queryKey: ['orders-active', companyId] })
      onClose()
    },
    onError: (err: any) => toast.error(err.message)
  })

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('orders').update({ payment_status: 'paid' }).eq('id', order.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Marcado como pagado')
      queryClient.invalidateQueries({ queryKey: ['orders-active', companyId] })
    },
    onError: (err: any) => toast.error(err.message)
  })

  // La página pública vive en /tracking/[token] (NO /track). Antes se generaba
  // /track/ y por eso el link daba 404. Se usa NEXT_PUBLIC_BASE_URL igual que
  // OrderTrackingTab para que el dominio sea consistente en prod.
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '')
const trackingUrl = order?.public_token && baseUrl ? `${baseUrl}/tracking/${order.public_token}` : ''
  const copyTrackingUrl = () => {
    if (!trackingUrl) return
    navigator.clipboard.writeText(trackingUrl)
    toast.success('Link copiado')
  }

  if (!isOpen || !order) return null

  const items = order.items || []
  const isFinal = order.status_semantic === 'delivered' || order.status_semantic === 'cancelled'
  const isCancelled = order.status_semantic === 'cancelled'

  const DeliveryIcon = order.delivery_type === 'delivery' ? Truck
                     : order.delivery_type === 'pickup'   ? Store
                                                          : UserCheck
  const deliveryLabel = order.delivery_type === 'delivery' ? 'Domicilio'
                      : order.delivery_type === 'pickup'   ? 'Recoger en local'
                                                            : 'En el local'

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 animate-in fade-in" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 w-full md:w-[600px] bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300 overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0" style={{ backgroundColor: `${accentColor}08` }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: accentColor }}>
              <ShoppingBag size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-slate-900">Orden #{order.order_number}</h2>
              <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: accentColor }} />
                {order.status_label}
                <span className="text-slate-300">·</span>
                <DeliveryIcon size={11} />
                {deliveryLabel}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Cliente */}
          <section>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Cliente</h3>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="font-bold text-slate-900">{order.contact_name || 'Sin nombre'}</p>
              {order.contact_phone && (
                <a href={`tel:${order.contact_phone}`} className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 mt-0.5">
                  <Phone size={11} /> {order.contact_phone}
                </a>
              )}
            </div>
          </section>

          {/* Entrega */}
          {order.delivery_type === 'delivery' && order.delivery_address && (
            <section>
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Dirección de entrega</h3>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-sm text-amber-900 flex items-start gap-1.5">
                  <MapPin size={13} className="text-amber-600 shrink-0 mt-0.5" />
                  {order.delivery_address}
                  {order.delivery_zone && <span className="text-xs text-amber-700"> ({order.delivery_zone})</span>}
                </p>
              </div>
            </section>
          )}

          {/* Items */}
          <section>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Items ({items.length})</h3>
            <div className="space-y-2">
              {items.map((it: any, i: number) => (
                <div key={i} className="bg-white border border-slate-200 rounded-xl p-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-black text-slate-900">{it.quantity}x</span>
                      <span className="font-bold text-slate-900 truncate">{it.item_name}</span>
                    </div>
                    {it.modifiers && it.modifiers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {it.modifiers.map((m: any, j: number) => (
                          <span key={j} className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">
                            {m.name}
                            {m.price_delta > 0 && ` (+$${m.price_delta})`}
                          </span>
                        ))}
                      </div>
                    )}
                    {it.notes && (
                      <p className="text-xs text-amber-700 italic mt-1">📝 {it.notes}</p>
                    )}
                  </div>
                  <p className="font-black text-slate-900 shrink-0">${it.subtotal.toFixed(0)}</p>
                </div>
              ))}
            </div>

            {order.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-3">
                <p className="text-xs text-amber-900 leading-relaxed">
                  <strong>Instrucciones del cliente:</strong> {order.notes}
                </p>
              </div>
            )}
          </section>

          {/* Totales */}
          <section>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Totales</h3>
            <div className="bg-slate-50 rounded-xl p-3 space-y-1 text-sm">
              <div className="flex justify-between text-slate-700">
                <span>Subtotal</span>
                <span>${order.subtotal.toFixed(2)}</span>
              </div>
              {order.tax > 0 && (
                <div className="flex justify-between text-slate-700">
                  <span>IVA</span>
                  <span>${order.tax.toFixed(2)}</span>
                </div>
              )}
              {order.delivery_fee > 0 && (
                <div className="flex justify-between text-slate-700">
                  <span>Envío</span>
                  <span>${order.delivery_fee.toFixed(2)}</span>
                </div>
              )}
              {order.tip > 0 && (
                <div className="flex justify-between text-slate-700">
                  <span>Propina</span>
                  <span>${order.tip.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-1.5 mt-1.5 flex justify-between font-black text-slate-900 text-base">
                <span>Total</span>
                <span>${order.total.toFixed(2)} {order.currency}</span>
              </div>
            </div>
          </section>

          {/* Pago */}
          <section>
            <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3">
              <div className="flex items-center gap-2">
                {order.payment_method === 'cash' ? <Coins size={14} className="text-emerald-600" />
                  : order.payment_method === 'card' ? <CreditCard size={14} className="text-blue-600" />
                  : <DollarSign size={14} className="text-slate-600" />}
                <span className="text-xs font-bold text-slate-700 capitalize">{order.payment_method}</span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  order.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700'
                  : order.payment_status === 'pending' ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-700'
                }`}>
                  {order.payment_status === 'paid' ? 'PAGADO' : order.payment_status === 'pending' ? 'PENDIENTE' : order.payment_status.toUpperCase()}
                </span>
              </div>
              {order.payment_status !== 'paid' && (
                <button
                  onClick={() => markPaidMutation.mutate()}
                  disabled={markPaidMutation.isPending}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 px-3 py-1 rounded-lg"
                >
                  Marcar pagado
                </button>
              )}
            </div>
          </section>

          {/* Tracking URL */}
          {order.public_token && (
            <section>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-blue-900 uppercase tracking-widest mb-0.5">Link de tracking</p>
                  <p className="text-xs text-blue-800 font-mono truncate">/tracking/{order.public_token.slice(0, 8)}...</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={copyTrackingUrl}
                    className="text-xs font-bold text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg flex items-center gap-1"
                  >
                    <Copy size={11} /> Copiar
                  </button>
                  <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-white hover:opacity-90 px-3 py-1.5 rounded-lg flex items-center gap-1"
                    style={{ backgroundColor: accentColor }}
                  >
                    <ExternalLink size={11} /> Ver
                  </a>
                </div>
              </div>
            </section>
          )}

          {/* History */}
          <section>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              <History size={11} /> Historial
            </h3>
            <div className="space-y-1.5">
              {history.map((h: any, i: number) => (
                <div key={i} className="bg-slate-50 rounded-lg p-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-2 w-2 rounded-full bg-slate-400 shrink-0" />
                    <span className="font-bold text-slate-800">{h.status_label}</span>
                    <span className="text-[10px] text-slate-500">por {h.changed_by}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 shrink-0">
                    {new Date(h.changed_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Footer con acciones */}
        {!isFinal && (
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center gap-2 shrink-0">
            <button
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="text-xs font-bold text-rose-700 hover:bg-rose-50 px-3 py-2.5 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
            >
              {cancelMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
              Cancelar orden
            </button>
            <button
              onClick={() => advanceMutation.mutate()}
              disabled={advanceMutation.isPending}
              className="flex-1 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              style={{ backgroundColor: accentColor }}
            >
              {advanceMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
              Avanzar al siguiente estado
            </button>
          </div>
        )}

        {isCancelled && (
          <div className="px-6 py-4 border-t border-slate-200 bg-rose-50 shrink-0">
            <p className="text-xs text-rose-700 font-bold text-center flex items-center justify-center gap-2">
              <AlertTriangle size={12} /> Esta orden está cancelada
            </p>
          </div>
        )}
      </div>
    </>
  )
}
