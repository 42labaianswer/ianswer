 

'use client'

import { useState, useMemo } from 'react'
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
import PageHeader from '../../../components/PageHeader'

// ============================================================================
// OrdersContent · Vista de LISTA de órdenes con filtros
// ----------------------------------------------------------------------------
// El kanban NO es un addon: las órdenes vienen con el sistema. Esta pantalla
// muestra TODAS las órdenes en una lista filtrable por estado, con búsqueda.
// El kanban arrastrable / tracking es otra cosa (vive en su propia vista).
// ============================================================================

type Tab = 'list' | 'tracking' | 'settings'

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

  const [tab, setTab] = useState<Tab>('list')
  const [companyId, setCompanyId] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [makerOpen, setMakerOpen] = useState(false)

  // Cargar company_id
  const { isLoading: isLoadingContext } = useQuery({
    queryKey: ['orders-context'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sin sesión')
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      if (!profile?.company_id) throw new Error('Sin company')
      setCompanyId(profile.company_id)
      return { companyId: profile.company_id }
    }
  })

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
        <Loader2 size={32} className="text-orange-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="pb-12 animate-in fade-in duration-500">

      <PageHeader
        title="Órdenes"
        description={
          tab === 'list' ? 'Todas tus órdenes. Filtra por estado y da clic para ver el detalle.'
          : tab === 'tracking' ? 'Arrastra las cards para cambiar el estado de cada pedido.'
          : 'Configura impuestos, envío, propinas y estados de tu operación'
        }
        actions={
          tab === 'list' ? (
            <div className="flex items-center gap-2">
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
          ) : null
        }
      />

      {/* TABS */}
      <div className="bg-white border border-slate-200 rounded-2xl p-1.5 mb-6 flex gap-1 shadow-sm w-fit">
        <button
          onClick={() => setTab('list')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
            tab === 'list' ? 'text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'
          }`}
          style={tab === 'list' ? { backgroundColor: accentColor } : {}}
        >
          <ClipboardList size={13} /> Órdenes
        </button>
        <button
          onClick={() => setTab('tracking')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
            tab === 'tracking' ? 'text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'
          }`}
          style={tab === 'tracking' ? { backgroundColor: accentColor } : {}}
        >
          <LayoutGrid size={13} /> Tracking
        </button>
        <button
          onClick={() => setTab('settings')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
            tab === 'settings' ? 'text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'
          }`}
          style={tab === 'settings' ? { backgroundColor: accentColor } : {}}
        >
          <Settings size={13} /> Configuración
        </button>
      </div>

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
              <Loader2 size={28} className="text-orange-600 animate-spin" />
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
                    className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left"
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
                          <span className="text-[11px] text-slate-400 font-medium">
                            #{order.order_number}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {order.contact_phone || 'Sin teléfono'} · {formatDate(order.created_at)}
                      </div>
                    </div>

                    <div className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold ${color.bg} ${color.text}`}>
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
