 

'use client'

import { useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { useWorkspace } from '../../../components/WorkspaceContext'
import { useQuery } from '@tanstack/react-query'
import {
  ClipboardList, Settings, Loader2, RefreshCw, Search, Package,
  Truck, Store, UtensilsCrossed, ChevronRight, LayoutGrid, Plus
} from 'lucide-react'

import OrderSettingsTab from '../../../components/OrderSettingsTab'
import OrderDrawer from '../../../components/OrderDrawer'
import OrderKanbanBoard from '../../../components/OrderKanbanBoard'
import OrderMakerDrawer from '../../../components/OrderMakerDrawer'
import IAnswerLoader from '../../../components/IAnswerLoader'

// ============================================================================
// OrdersContent · Vista de LISTA de órdenes con filtros
// ----------------------------------------------------------------------------
// El kanban NO es un addon: las órdenes vienen con el sistema. Esta pantalla
// muestra TODAS las órdenes en una lista filtrable por estado, con búsqueda.
// El kanban arrastrable / tracking es otra cosa (vive en su propia vista).
// ============================================================================

type Tab = 'list' | 'tracking' | 'settings'

const ORDER_TABS: { id: Tab, label: string, title: string, description: string, icon: typeof ClipboardList }[] = [
  { id: 'list',     label: 'Pedidos',       title: 'Pedidos',       description: 'Todos tus pedidos. Filtra por estado y da clic para ver el detalle.', icon: ClipboardList },
  { id: 'tracking', label: 'Tracking',      title: 'Tracking',      description: 'Mueve cada pedido de estado; el cliente recibe el aviso por WhatsApp.', icon: LayoutGrid },
  { id: 'settings', label: 'Configuración', title: 'Configuración', description: 'Impuestos, envío, propinas, estados y avisos de tu operación.', icon: Settings },
]

type Order = {
  id: string
  order_number: number | null
  contact_name: string | null
  contact_phone: string | null
  status_semantic: string
  status_label: string
  status_step: number
  total: number
  delivery_type: 'pickup' | 'delivery' | 'dine_in' | null
  delivery_address?: string | null
  notes?: string | null
  created_at: string
  items?: any[]
  public_token?: string | null
  tracking_token?: string | null
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'received', label: 'Recibidas' },
  { value: 'preparing', label: 'En preparación' },
  { value: 'ready', label: 'Listas' },
  { value: 'out_for_delivery', label: 'En camino' },
  { value: 'delivered', label: 'Entregadas' },
  { value: 'cancelled', label: 'Canceladas' },
]

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  received: { bg: 'bg-blue-100', text: 'text-blue-700' },
  preparing: { bg: 'bg-amber-100', text: 'text-amber-700' },
  ready: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  out_for_delivery: { bg: 'bg-violet-100', text: 'text-violet-700' },
  delivered: { bg: 'bg-slate-100', text: 'text-slate-600' },
  cancelled: { bg: 'bg-rose-100', text: 'text-rose-700' },
}

const DELIVERY_ICON: Record<string, typeof Truck> = {
  delivery: Truck,
  pickup: Store,
  dine_in: UtensilsCrossed,
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function OrdersContent() {
  const { primaryTemplate: vertical } = useWorkspace()
  const accentColor = vertical?.accent_color || '#ea580c'

  // La pestaña vive en ?tab=: así la ruta del encabezado la muestra
  // ("Órdenes / Pedidos"), el link se puede compartir y "Órdenes" en la ruta
  // regresa a Pedidos.
  const searchParams = useSearchParams()
  const tabParam = searchParams?.get('tab')
  const tab: Tab = tabParam === 'tracking' || tabParam === 'settings' ? tabParam : 'list'
  const setTab = (t: Tab) => window.history.replaceState(null, '', `?tab=${t}`)
  const currentTab = ORDER_TABS.find(t => t.id === tab) ?? ORDER_TABS[0]
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [makerOpen, setMakerOpen] = useState(false)

  // La empresa sale del resultado de la consulta (no de un setState dentro de
  // ella): al volver a la página la consulta viene de caché y no se vuelve a
  // ejecutar, así que un setState ahí nunca llegaba y la página se quedaba
  // cargando.
  const { data: ctx, isLoading: isLoadingContext } = useQuery({
    queryKey: ['orders-context'],
    queryFn: async (): Promise<{ companyId: string }> => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sin sesión')
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      if (!profile?.company_id) throw new Error('Sin company')
      return { companyId: profile.company_id as string }
    }
  })
  const companyId = ctx?.companyId ?? ''

  // Cargar TODAS las órdenes de la company
  const { data: orders = [], isLoading: isLoadingOrders, refetch } = useQuery({
    queryKey: ['orders-list', companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as Order[]
    }
  })

  const filtered = useMemo(() => {
    let list = orders
    if (statusFilter !== 'all') {
      list = list.filter(o => o.status_semantic === statusFilter)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(o =>
        (o.contact_name || '').toLowerCase().includes(q) ||
        (o.contact_phone || '').toLowerCase().includes(q) ||
        String(o.order_number || '').includes(q)
      )
    }
    return list
  }, [orders, statusFilter, search])

  // Conteo por estado para las pastillas de filtro
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length }
    for (const o of orders) {
      c[o.status_semantic] = (c[o.status_semantic] || 0) + 1
    }
    return c
  }, [orders])

  if (isLoadingContext || !companyId) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <IAnswerLoader size={32} />
      </div>
    )
  }

  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-6 flex flex-col lg:flex-row lg:min-h-[calc(100vh-80px)] bg-slate-50 animate-in fade-in duration-500">
      {/* ── Celular: pestañas arriba, deslizables ─────────────────────── */}
      <div className="lg:hidden bg-white border-b border-slate-200 shadow-sm">
        <nav className="flex gap-1 overflow-x-auto px-3 py-2 scrollbar-hide">
          {ORDER_TABS.map(t => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  active ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                }`}
              >
                <Icon size={14} className={active ? 'text-white' : 'text-slate-400'} />
                {t.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* ── Escritorio: menú interno, como en Gestor de Clientes ──────── */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-slate-200 shrink-0 flex-col">
        <div className="px-5 pt-6 pb-5 border-b border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Restaurante</p>
          <h2 className="text-base font-black text-slate-900 tracking-tight">Órdenes</h2>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {ORDER_TABS.map(t => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  active ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon size={16} className={active ? 'text-white' : 'text-slate-400'} />
                {t.label}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* ── Contenido ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 lg:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight mb-0.5">{currentTab.title}</h1>
            <p className="text-xs lg:text-sm text-slate-500 font-medium">{currentTab.description}</p>
          </div>
          {tab === 'list' && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => refetch()}
                className="text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-3 py-2 rounded-xl flex items-center gap-1.5"
              >
                <RefreshCw size={12} /> Refrescar
              </button>
              <button
                onClick={() => setMakerOpen(true)}
                className="text-xs font-bold text-white px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm hover:opacity-90"
                style={{ backgroundColor: accentColor }}
              >
                <Plus size={14} /> Nueva orden
              </button>
            </div>
          )}
        </header>

        <div className="flex-1 px-4 md:px-8 py-6">
      {tab === 'list' && (
        <>
          {/* Buscador */}
          <div className="relative mb-4 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por cliente, teléfono o número de orden"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
            />
          </div>

          {/* Filtros de estado */}
          <div className="flex flex-wrap gap-2 mb-6">
            {STATUS_FILTERS.map(f => {
              const active = statusFilter === f.value
              const count = counts[f.value] || 0
              return (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all border ${
                    active
                      ? 'text-white border-transparent shadow-sm'
                      : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                  style={active ? { backgroundColor: accentColor } : {}}
                >
                  {f.label}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white/25' : 'bg-slate-100 text-slate-500'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Lista */}
          {isLoadingOrders ? (
            <div className="flex h-[40vh] items-center justify-center">
              <IAnswerLoader size={28} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center">
              <Package size={40} className="text-slate-300 mx-auto mb-3" />
              <h3 className="text-lg font-black text-slate-900 mb-1">
                {orders.length === 0 ? 'Aún no tienes órdenes' : 'Sin resultados'}
              </h3>
              <p className="text-slate-500 text-sm max-w-sm mx-auto">
                {orders.length === 0
                  ? 'Cuando crees una orden o el bot reciba un pedido, aparecerá aquí.'
                  : 'Prueba con otro filtro o término de búsqueda.'}
              </p>
              {orders.length === 0 && (
                <button
                  onClick={() => setMakerOpen(true)}
                  className="mt-4 text-xs font-bold text-white px-4 py-2.5 rounded-xl inline-flex items-center gap-1.5 shadow-sm hover:opacity-90"
                  style={{ backgroundColor: accentColor }}
                >
                  <Plus size={14} /> Crear primera orden
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
              {filtered.map(order => {
                const color = STATUS_COLORS[order.status_semantic] || STATUS_COLORS.received
                const DeliveryIcon = DELIVERY_ICON[order.delivery_type || 'pickup'] || Store
                return (
                  <button
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className="w-full flex items-center gap-3 sm:gap-4 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left"
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                      <DeliveryIcon size={18} className="text-slate-500" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm truncate">
                          {order.contact_name || 'Cliente sin nombre'}
                        </span>
                        {order.order_number != null && (
                          <span className="text-[11px] text-slate-400 font-medium shrink-0 whitespace-nowrap">
                            #{order.order_number}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        <span className={`sm:hidden font-bold ${color.text}`}>{order.status_label} · </span>
                        {order.contact_phone || 'Sin teléfono'} · {formatDate(order.created_at)}
                      </div>
                    </div>

                    <div className={`hidden sm:block flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold ${color.bg} ${color.text}`}>
                      {order.status_label}
                    </div>

                    <div className="flex-shrink-0 text-right">
                      <div className="font-black text-slate-900 text-sm">{formatMoney(order.total)}</div>
                    </div>

                    <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {tab === 'tracking' && (
        <OrderKanbanBoard companyId={companyId} accentColor={accentColor} />
      )}

      {tab === 'settings' && (
        <OrderSettingsTab companyId={companyId} accentColor={accentColor} />
      )}
        </div>
      </div>

      {/* Drawer de detalle */}
      {selectedOrder && (
        <OrderDrawer
          isOpen={!!selectedOrder}
          onClose={() => { setSelectedOrder(null); refetch() }}
          order={selectedOrder as any}
          companyId={companyId}
          accentColor={accentColor}
        />
      )}

      {/* Drawer de crear orden */}
      <OrderMakerDrawer
        companyId={companyId}
        accentColor={accentColor}
        open={makerOpen}
        onClose={() => setMakerOpen(false)}
        onCreated={() => refetch()}
      />
    </div>
  )
}

export default OrdersContent
