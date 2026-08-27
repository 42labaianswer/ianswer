'use client'

/**
 * ============================================================================
 * OrderTrackingClient · v2.20
 * ----------------------------------------------------------------------------
 * Client component del /track/<token>.
 * Hace polling cada 30s para actualizar el estado.
 * Renderiza timeline vertical con animaciones sutiles.
 * ============================================================================
 */

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  CheckCircle2, Circle, Clock, Truck, Store, UserCheck, ShoppingBag,
  MapPin, AlertCircle, Loader2, Phone
} from 'lucide-react'

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const SEMANTIC_EMOJI: Record<string, string> = {
  received:   '📥',
  confirmed:  '✅',
  preparing:  '🍳',
  ready:      '🎁',
  shipping:   '🚚',
  delivered:  '🎉',
  cancelled:  '❌'
}

export default function OrderTrackingClient({
  initialOrder,
  token,
  fullBranding = false,
  platformName = 'iAnswer'
}: {
  initialOrder: any
  token: string
  fullBranding?: boolean
  platformName?: string
}) {
  const [order, setOrder] = useState<any>(initialOrder)
  const [isPolling, setIsPolling] = useState(false)

  // Polling cada 30s
  useEffect(() => {
    const isFinal = order.status_semantic === 'delivered' || order.status_semantic === 'cancelled'
    if (isFinal) return

    const interval = setInterval(async () => {
      setIsPolling(true)
      try {
        const { data } = await supabaseAnon.rpc('get_order_tracking', { p_token: token })
        if (data && data[0]) setOrder(data[0])
      } catch (e) {
        // silent fail
      } finally {
        setIsPolling(false)
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [token, order.status_semantic])

  const statuses: any[] = order.order_statuses || []
  const items: any[] = order.items || []
  const history: any[] = order.history || []

  const primaryColor = order.company_primary_color || '#ea580c'
  const accentColor  = order.company_accent_color  || '#f97316'

  const isCompleted = order.status_semantic === 'delivered'
  const isCancelled = order.status_semantic === 'cancelled'
  const isActive = !isCompleted && !isCancelled

  const DeliveryIcon = order.delivery_type === 'delivery' ? Truck
                     : order.delivery_type === 'pickup'   ? Store
                                                          : UserCheck
  const deliveryLabel = order.delivery_type === 'delivery' ? 'Domicilio'
                      : order.delivery_type === 'pickup'   ? 'Recoger en local'
                                                            : 'En el local'

  // Historial mapeado por step para encontrar timestamps
  const historyByStep: Record<string, string> = {}
  history.forEach((h: any) => {
    if (!historyByStep[h.status_step]) historyByStep[h.status_step] = h.changed_at
  })

  // ETA legible
  const etaText = order.estimated_ready_at && isActive
    ? new Date(order.estimated_ready_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="min-h-screen bg-slate-50">

      {/* HEADER whitelabel */}
      <header className="text-white shadow-md" style={{ backgroundColor: primaryColor }}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          {order.company_logo ? (
            <img src={order.company_logo} alt="" className="h-10 max-w-[180px] object-contain" />
          ) : (
            <div className="h-10 w-10 bg-white/15 rounded-xl flex items-center justify-center">
              <span className="text-white font-black text-xl">{(order.company_name || '?').charAt(0)}</span>
            </div>
          )}
          <div className="min-w-0">
            <p className="font-black truncate">{order.company_name}</p>
            <p className="text-[10px] opacity-80 uppercase tracking-widest">Seguimiento de pedido</p>
          </div>
          {isPolling && (
            <Loader2 size={14} className="ml-auto animate-spin opacity-50" />
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* Hero card: estado actual */}
        <section className="bg-white rounded-3xl shadow-sm p-6 text-center border-2" style={{ borderColor: accentColor }}>
          {isCancelled ? (
            <>
              <div className="text-5xl mb-3">{SEMANTIC_EMOJI.cancelled}</div>
              <h1 className="text-2xl font-black text-slate-900 mb-1">Pedido cancelado</h1>
              <p className="text-sm text-slate-500">Tu pedido #{order.order_number} fue cancelado.</p>
            </>
          ) : isCompleted ? (
            <>
              <div className="text-5xl mb-3">{SEMANTIC_EMOJI.delivered}</div>
              <h1 className="text-2xl font-black text-slate-900 mb-1">¡Pedido entregado!</h1>
              <p className="text-sm text-slate-500">Disfruta tu orden #{order.order_number}</p>
            </>
          ) : (
            <>
              <div className="text-5xl mb-3 animate-bounce">{SEMANTIC_EMOJI[order.status_semantic] || '⏳'}</div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Estado actual</p>
              <h1 className="text-3xl font-black mb-2" style={{ color: primaryColor }}>{order.status_label}</h1>
              {etaText && (
                <p className="text-sm text-slate-500 flex items-center justify-center gap-1.5 mt-2">
                  <Clock size={13} /> Estimado listo: <strong className="text-slate-900">{etaText}</strong>
                </p>
              )}
            </>
          )}
        </section>

        {/* Timeline */}
        {!isCancelled && (
          <section className="bg-white rounded-3xl shadow-sm p-6">
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-5">Progreso</h2>
            <div className="relative">
              {/* Línea vertical */}
              <div className="absolute left-[15px] top-3 bottom-3 w-0.5 bg-slate-200" />

              <div className="space-y-5">
                {statuses.map((s, i) => {
                  const isCompleted = s.step <= order.status_step
                  const isCurrent = s.step === order.status_step && isActive
                  const isFuture = s.step > order.status_step
                  const timestamp = historyByStep[s.step]

                  return (
                    <div key={s.step} className="flex items-start gap-3 relative">
                      {/* Dot */}
                      <div className={`relative z-10 h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                        isCompleted ? 'text-white shadow-md' : 'bg-white border-2 border-slate-200 text-slate-300'
                      }`} style={isCompleted ? { backgroundColor: accentColor } : {}}>
                        {isCompleted ? (
                          <CheckCircle2 size={16} />
                        ) : isCurrent ? (
                          <Circle size={16} />
                        ) : (
                          <Circle size={16} />
                        )}
                        {/* Animación pulse en current */}
                        {isCurrent && (
                          <div className="absolute inset-0 rounded-full animate-ping opacity-50" style={{ backgroundColor: accentColor }} />
                        )}
                      </div>

                      {/* Body */}
                      <div className="flex-1 pt-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`font-bold ${isCurrent ? 'text-slate-900' : isCompleted ? 'text-slate-700' : 'text-slate-400'}`}>
                            {s.name}
                          </p>
                          {timestamp && (
                            <p className="text-[10px] text-slate-500 shrink-0">
                              {new Date(timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                        {isCurrent && s.avg_minutes > 0 && (
                          <p className="text-[10px] text-slate-500 mt-0.5">≈ {s.avg_minutes} min en esta fase</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* Items */}
        <section className="bg-white rounded-3xl shadow-sm p-6">
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <ShoppingBag size={11} /> Tu pedido ({items.length} {items.length === 1 ? 'item' : 'items'})
          </h2>
          <div className="space-y-2">
            {items.map((it: any, i: number) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
                <span className="font-black text-slate-900 shrink-0">{it.quantity}x</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900">{it.item_name}</p>
                  {it.modifiers && it.modifiers.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {it.modifiers.map((m: any, j: number) => (
                        <span key={j} className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                          {m.name}{m.price_delta > 0 ? ` +$${m.price_delta}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <p className="font-bold text-slate-700 shrink-0">${it.subtotal.toFixed(0)}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-200 pt-3 mt-3 flex justify-between font-black text-slate-900">
            <span>Total</span>
            <span style={{ color: primaryColor }}>${order.total.toFixed(2)} {order.currency}</span>
          </div>
        </section>

        {/* Entrega info */}
        <section className="bg-white rounded-3xl shadow-sm p-4 flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${accentColor}20` }}>
            <DeliveryIcon size={20} style={{ color: primaryColor }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{deliveryLabel}</p>
            {order.delivery_type === 'delivery' && order.delivery_address ? (
              <p className="text-sm font-bold text-slate-900 mt-0.5 flex items-start gap-1">
                <MapPin size={11} className="text-slate-400 shrink-0 mt-1" /> {order.delivery_address}
              </p>
            ) : (
              <p className="text-sm font-bold text-slate-900 mt-0.5">{order.company_name}</p>
            )}
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-400 pt-4 pb-8">
          <p>Pedido #{order.order_number} · {new Date(order.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</p>
          <p className="mt-1">© {new Date().getFullYear()} {order.company_name}</p>
          {!fullBranding && (
            <p className="mt-3 text-slate-300">
              Powered by{' '}
              <a href="/" target="_blank" rel="noopener noreferrer" className="font-bold text-slate-500 hover:text-slate-700">
                {platformName}
              </a>
            </p>
          )}
        </footer>
      </main>
    </div>
  )
}