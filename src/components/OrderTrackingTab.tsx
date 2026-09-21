 

'use client'

// src/components/OrderTrackingTab.tsx
// ----------------------------------------------------------------------------
// Sprint O · Tab de Tracking dentro de Órdenes.
//
// Muestra las órdenes activas con su link público de rastreo. Permite:
//   - Copiar el link de tracking de cada orden para compartirlo
//   - Ver el estado actual de cada una
//   - Abrir el tracking público
//
// Solo se renderiza si el addon order_tracking está activo (el gate lo hace
// OrdersContent). Aquí asumimos que ya pasó el gate.
// ----------------------------------------------------------------------------

import { useState } from 'react'
import { Copy, Check, ExternalLink, MapPin, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTrackableOrders } from '../hooks/useOrderTracking'
import IAnswerLoader from './IAnswerLoader'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL
if (!BASE_URL) {
  throw new Error('Falta NEXT_PUBLIC_BASE_URL o NEXT_PUBLIC_SITE_URL en el entorno')
}


export default function OrderTrackingTab({
  companyId,
  accentColor,
}: {
  companyId: string
  accentColor: string
}) {
  const { data: orders = [], isLoading } = useTrackableOrders(companyId)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function handleCopy(token: string, id: string) {
    const url = `${BASE_URL}/tracking/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(id)
      toast.success('Link de tracking copiado')
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <IAnswerLoader size={28} />
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
        <Package size={40} className="text-slate-300 mx-auto mb-3" strokeWidth={1.5} />
        <h3 className="text-base font-bold text-slate-900 mb-1">Sin pedidos activos</h3>
        <p className="text-sm text-slate-500">
          Cuando lleguen pedidos, aquí verás sus links de rastreo para compartir.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100">
            <MapPin size={16} className="text-slate-600" strokeWidth={1.5} />
          </div>
          <div className="text-xs text-slate-600">
            <p className="font-semibold text-slate-900">Links de rastreo público</p>
            <p className="mt-0.5 leading-relaxed">
              Cada pedido tiene un link único que el cliente puede abrir para ver el estado
              en tiempo real con tu branding. El bot también responde el estado si el
              cliente pregunta por WhatsApp.
            </p>
          </div>
        </div>
      </div>

      {orders.map((order) => (
        <div
          key={order.id}
          className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4"
        >
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-sm">
                #{order.order_number}
              </span>
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: accentColor }}
              >
                {order.status_label}
              </span>
              <span className="text-[10px] text-slate-400 uppercase font-bold">
                {order.delivery_type === 'pickup'
                  ? 'Recoger'
                  : order.delivery_type === 'delivery'
                  ? 'Envío'
                  : 'En sitio'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {order.contact_name || 'Cliente'} ·{' '}
              {order.contact_phone || 'sin teléfono'} · $
              {order.total.toLocaleString('es-MX')}
            </p>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => handleCopy(order.public_token, order.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {copiedId === order.id ? (
                <>
                  <Check size={13} className="text-emerald-600" strokeWidth={2} />
                  Copiado
                </>
              ) : (
                <>
                  <Copy size={13} strokeWidth={1.5} />
                  Copiar link
                </>
              )}
            </button>
            <a
              href={`${BASE_URL}/tracking/${order.public_token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white transition hover:opacity-90"
              style={{ backgroundColor: accentColor }}
            >
              <ExternalLink size={13} strokeWidth={1.5} />
              Ver
            </a>
          </div>
        </div>
      ))}
    </div>
  )
}
