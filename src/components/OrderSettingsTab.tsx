 

'use client'

/**
 * ============================================================================
 * OrderSettingsTab · v2.19
 * ----------------------------------------------------------------------------
 * Configuración del módulo de órdenes:
 *   - IVA (tax_rate)
 *   - Envío default y reglas por zona
 *   - Propinas sugeridas
 *   - Pedido mínimo
 *   - Estados configurables (con semantic enum)
 *   - Auto-simular progresión
 *   - Habilitar tracking público
 * ============================================================================
 */

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Percent, Truck, Coins, ShoppingBag, GitBranch, Bot, Eye, Save, Loader2,
  Plus, Trash2, AlertCircle
} from 'lucide-react'
import { useConfirm } from '../hooks/useConfirm'

const SEMANTIC_OPTIONS = [
  { value: 'received',   label: 'Recibida (received)' },
  { value: 'confirmed',  label: 'Confirmada (confirmed)' },
  { value: 'preparing',  label: 'Preparando (preparing)' },
  { value: 'ready',      label: 'Lista (ready)' },
  { value: 'shipping',   label: 'En camino (shipping)' },
  { value: 'delivered',  label: 'Entregada (delivered)' }
]

const TEMPLATES = {
  simple: [
    { step: 0, name: 'Recibida',    semantic: 'received',   avg_minutes: 2 },
    { step: 1, name: 'Preparando',  semantic: 'preparing',  avg_minutes: 20 },
    { step: 2, name: 'Lista',       semantic: 'ready',      avg_minutes: 5 },
    { step: 3, name: 'Entregada',   semantic: 'delivered',  avg_minutes: 0 }
  ],
  delivery: [
    { step: 0, name: 'Recibida',       semantic: 'received',   avg_minutes: 2 },
    { step: 1, name: 'Confirmada',     semantic: 'confirmed',  avg_minutes: 3 },
    { step: 2, name: 'En preparación', semantic: 'preparing',  avg_minutes: 20 },
    { step: 3, name: 'Lista',          semantic: 'ready',      avg_minutes: 5 },
    { step: 4, name: 'En camino',      semantic: 'shipping',   avg_minutes: 20 },
    { step: 5, name: 'Entregada',      semantic: 'delivered',  avg_minutes: 0 }
  ]
}

type OrderStatus = {
  step: number
  name: string
  semantic: string
  avg_minutes: number
}

type Settings = {
  tax_rate: number
  delivery_fee_default: number
  tip_suggestions: number[]
  min_order_amount: number | null
  order_statuses: OrderStatus[]
  order_auto_simulate: boolean
  order_enable_tracking: boolean
}

export default function OrderSettingsTab({ companyId, accentColor }: { companyId: string, accentColor: string }) {
  const { confirm, ConfirmDialog } = useConfirm()
  const queryClient = useQueryClient()
  const [settings, setSettings] = useState<Settings | null>(null)

  // Load
  const { isLoading, error: loadError } = useQuery({
    queryKey: ['order-settings', companyId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('tax_rate, delivery_fee_default, tip_suggestions, min_order_amount, order_statuses, order_auto_simulate, order_enable_tracking')
        .eq('id', companyId)
        .single()
      if (error) throw error
      setSettings({
        tax_rate: data.tax_rate ?? 0.16,
        delivery_fee_default: data.delivery_fee_default ?? 0,
        tip_suggestions: (data.tip_suggestions as number[]) || [10, 15, 20],
        min_order_amount: data.min_order_amount,
        order_statuses: (data.order_statuses as OrderStatus[]) || [],
        order_auto_simulate: data.order_auto_simulate ?? false,
        order_enable_tracking: data.order_enable_tracking ?? true
      })
      return data
    }
  })

  const saveMutation = useMutation({
    mutationFn: async (next: Settings) => {
      // Validar estados configurables
      if (next.order_statuses.length === 0) {
        throw new Error('Necesitas al menos 1 estado')
      }
      if (!next.order_statuses.some(s => s.semantic === 'delivered')) {
        throw new Error('Falta el estado final (semantic="delivered")')
      }

      // Re-asignar steps consecutivos
      const reordered = next.order_statuses.map((s, i) => ({ ...s, step: i }))

      const { error } = await supabase.from('companies').update({
        tax_rate: next.tax_rate,
        delivery_fee_default: next.delivery_fee_default,
        tip_suggestions: next.tip_suggestions,
        min_order_amount: next.min_order_amount,
        order_statuses: reordered,
        order_auto_simulate: next.order_auto_simulate,
        order_enable_tracking: next.order_enable_tracking
      }).eq('id', companyId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Configuración guardada')
      queryClient.invalidateQueries({ queryKey: ['order-settings', companyId] })
      queryClient.invalidateQueries({ queryKey: ['company-order-statuses', companyId] })
    },
    onError: (err: any) => toast.error(err.message)
  })

  // Si falló la carga (ej. columnas faltantes por SQL no aplicado), mostrar error
  // en vez de un loader eterno.
  if (loadError) {
    return (
      <div className="flex flex-col h-[40vh] items-center justify-center text-center px-6">
        <div className="h-12 w-12 rounded-full bg-red-50 flex items-center justify-center mb-3">
          <ShoppingBag size={22} className="text-red-500" />
        </div>
        <h3 className="font-bold text-slate-900 mb-1">No se pudo cargar la configuración</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          Puede que falte aplicar una actualización de base de datos. Contacta al administrador para revisar la configuración de órdenes.
        </p>
      </div>
    )
  }

  if (isLoading || !settings) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <Loader2 size={32} className="text-orange-600 animate-spin" />
      </div>
    )
  }

  // ---- Handlers de estados ----
  const updateStatus = (idx: number, field: keyof OrderStatus, value: any) => {
    const next = [...settings.order_statuses]
    next[idx] = { ...next[idx], [field]: value }
    setSettings({ ...settings, order_statuses: next })
  }

  const removeStatus = (idx: number) => {
    if (settings.order_statuses.length <= 1) {
      toast.error('Debe haber al menos 1 estado')
      return
    }
    setSettings({ ...settings, order_statuses: settings.order_statuses.filter((_, i) => i !== idx) })
  }

  const addStatus = () => {
    setSettings({
      ...settings,
      order_statuses: [
        ...settings.order_statuses,
        { step: settings.order_statuses.length, name: 'Nuevo estado', semantic: 'preparing', avg_minutes: 5 }
      ]
    })
  }

  const applyTemplate = async (key: 'simple' | 'delivery') => {
    if (await confirm('¿Reemplazar los estados actuales con esta plantilla?', { title: 'Reemplazar plantilla' })) {
      setSettings({ ...settings, order_statuses: [...TEMPLATES[key]] })
    }
  }

  const moveStatus = (idx: number, direction: -1 | 1) => {
    const newIdx = idx + direction
    if (newIdx < 0 || newIdx >= settings.order_statuses.length) return
    const next = [...settings.order_statuses]
    ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
    setSettings({ ...settings, order_statuses: next })
  }

  return (
    <div className="space-y-6 max-w-4xl">

      {/* === MATH TOOLS === */}
      <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-1">
          <Coins size={20} className="text-emerald-600" /> Cálculo de totales
        </h2>
        <p className="text-sm text-slate-500 mb-5">Lo que el bot usa para calcular subtotal, IVA, envío y total de cada orden.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">
              <Percent size={11} className="inline mr-1" /> IVA (%)
            </label>
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 focus-within:border-emerald-500 focus-within:bg-white">
              <input
                type="number"
                step="0.01"
                value={settings.tax_rate * 100}
                onChange={e => setSettings({ ...settings, tax_rate: Number(e.target.value) / 100 })}
                className="flex-1 py-2.5 text-sm bg-transparent outline-none"
              />
              <span className="text-xs font-bold text-slate-500">%</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Default México: 16%</p>
          </div>

          <div>
            <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">
              <Truck size={11} className="inline mr-1" /> Envío default
            </label>
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 focus-within:border-emerald-500 focus-within:bg-white">
              <span className="text-xs font-bold text-slate-500">$</span>
              <input
                type="number"
                value={settings.delivery_fee_default ?? 0}
                onChange={e => setSettings({ ...settings, delivery_fee_default: Number(e.target.value) })}
                className="flex-1 py-2.5 text-sm bg-transparent outline-none"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Costo fijo aplicado a pedidos a domicilio</p>
          </div>

          <div>
            <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">
              <ShoppingBag size={11} className="inline mr-1" /> Pedido mínimo
            </label>
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 focus-within:border-emerald-500 focus-within:bg-white">
              <span className="text-xs font-bold text-slate-500">$</span>
              <input
                type="number"
                value={settings.min_order_amount ?? ''}
                onChange={e => setSettings({ ...settings, min_order_amount: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder="Sin mínimo"
                className="flex-1 py-2.5 text-sm bg-transparent outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">Propinas sugeridas (%)</label>
            <input
              type="text"
              value={settings.tip_suggestions.join(', ')}
              onChange={e => {
                const arr = e.target.value.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n))
                setSettings({ ...settings, tip_suggestions: arr })
              }}
              placeholder="10, 15, 20"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500 focus:bg-white"
            />
          </div>
        </div>
      </section>

      {/* === ESTADOS CONFIGURABLES === */}
      <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-1">
          <GitBranch size={20} className="text-purple-600" /> Estados de la orden
        </h2>
        <p className="text-sm text-slate-500 mb-3">El cliente ve el <strong>nombre</strong> que pongas. El bot razona con el <strong>semantic</strong> estándar.</p>

        <div className="flex gap-2 mb-4 flex-wrap">
          <button onClick={() => applyTemplate('simple')} className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg">
            🎯 Plantilla Simple (4 estados)
          </button>
          <button onClick={() => applyTemplate('delivery')} className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg">
            🚚 Plantilla Delivery (6 estados)
          </button>
        </div>

        <div className="space-y-2">
          {settings.order_statuses.map((s, idx) => (
            <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2">
              <div className="flex flex-col gap-0.5 shrink-0">
                <button onClick={() => moveStatus(idx, -1)} disabled={idx === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-20">▲</button>
                <button onClick={() => moveStatus(idx, 1)} disabled={idx === settings.order_statuses.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-20">▼</button>
              </div>

              <div className="flex items-center justify-center h-8 w-8 bg-white border border-slate-200 rounded-lg font-black text-slate-700 text-xs shrink-0">
                {idx}
              </div>

              <input
                type="text"
                value={s.name}
                onChange={e => updateStatus(idx, 'name', e.target.value)}
                placeholder="Nombre custom"
                className="flex-1 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-purple-500 min-w-0"
              />

              <select
                value={s.semantic}
                onChange={e => updateStatus(idx, 'semantic', e.target.value)}
                className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-purple-500 shrink-0 max-w-[180px]"
              >
                {SEMANTIC_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>

              <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 shrink-0 w-24 focus-within:border-purple-500">
                <input
                  type="number"
                  value={s.avg_minutes}
                  onChange={e => updateStatus(idx, 'avg_minutes', Number(e.target.value))}
                  className="flex-1 py-1.5 text-xs bg-transparent outline-none w-12"
                />
                <span className="text-[10px] font-bold text-slate-400">min</span>
              </div>

              <button onClick={() => removeStatus(idx)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg shrink-0">
                <Trash2 size={12} />
              </button>
            </div>
          ))}

          <button
            onClick={addStatus}
            className="w-full py-2.5 border-2 border-dashed border-slate-300 hover:border-purple-400 hover:bg-purple-50 rounded-xl text-xs font-bold text-slate-600 hover:text-purple-700 transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={12} /> Agregar estado
          </button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mt-4 flex gap-2">
          <AlertCircle size={14} className="text-blue-600 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-900 leading-relaxed">
            <strong>Semantic</strong> es lo que el bot entiende universalmente. Aunque tu estado se llame "Volando" o "Listo para vuelo", si el semantic es <code className="bg-blue-100 px-1 rounded">shipping</code>, el bot sabe que el cliente está esperando que llegue su orden. El último estado <strong>debe ser</strong> semantic=<code className="bg-blue-100 px-1 rounded">delivered</code>.
          </p>
        </div>
      </section>

      {/* === AUTOMATIZACIÓN === */}
      <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-1">
          <Bot size={20} className="text-blue-600" /> Automatización
        </h2>
        <p className="text-sm text-slate-500 mb-5">Cómo se comporta el sistema cuando llegan órdenes nuevas.</p>

        <div className="space-y-3">
          <label className="flex items-start gap-3 bg-slate-50 rounded-xl p-3 cursor-pointer hover:bg-slate-100 transition-colors">
            <input
              type="checkbox"
              checked={settings.order_auto_simulate}
              onChange={e => setSettings({ ...settings, order_auto_simulate: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded text-blue-600 focus:ring-blue-500 shrink-0"
            />
            <div className="flex-1">
              <p className="font-bold text-slate-900 text-sm">Auto-progresar órdenes por timer</p>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Las órdenes avanzan solas según los <strong>minutos promedio</strong> de cada estado. Útil si no quieres mover cards manualmente. Activado en v2.20 con pg_cron.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 bg-slate-50 rounded-xl p-3 cursor-pointer hover:bg-slate-100 transition-colors">
            <input
              type="checkbox"
              checked={settings.order_enable_tracking}
              onChange={e => setSettings({ ...settings, order_enable_tracking: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded text-blue-600 focus:ring-blue-500 shrink-0"
            />
            <div className="flex-1">
              <p className="font-bold text-slate-900 text-sm">Mandar link de tracking al cliente</p>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Cuando el bot crea una orden, le manda al cliente un <strong>link público whitelabel</strong> para que vea el progreso en tiempo real. Si lo desactivas, solo recibe confirmación de texto.
              </p>
            </div>
          </label>
        </div>
      </section>

      {/* Save */}
      <div className="flex justify-end sticky bottom-4">
        <button
          onClick={() => saveMutation.mutate(settings)}
          disabled={saveMutation.isPending}
          className="text-white px-8 py-3 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg disabled:opacity-50"
          style={{ backgroundColor: accentColor }}
        >
          {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar configuración
        </button>
      </div>
      {ConfirmDialog}
    </div>
  )
}
