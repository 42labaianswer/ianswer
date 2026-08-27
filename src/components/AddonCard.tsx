 

'use client'
import {
  Phone, Plug, Sparkles, Building, Wrench, GraduationCap,
  LifeBuoy, TrendingUp, Palette, CheckCircle2, Loader2,
  Plus, X, Lock
} from 'lucide-react'

const ADDON_ICONS: Record<string, any> = {
  Phone, Plug, Sparkles, Building, Wrench, GraduationCap,
  LifeBuoy, TrendingUp, Palette
}

type AddonCardProps = {
  addon: {
    id: string
    name: string
    description: string | null
    category: string
    icon: string
    price_monthly_cents: number
    price_one_time_cents: number
    is_recurring: boolean
    is_one_time: boolean
    is_featured: boolean
    requires_plan_min: string | null
  }
  isActive: boolean
  isLoading?: boolean
  isLockedByPlan?: boolean 
  
  isAdmin?: boolean
  onActivate?: () => void
  onCancel?: () => void
}

// ── Paleta sutil tipo Conectividad: bg-{color}-50 + text-{color}-600 ────────
const CATEGORY_TONES: Record<string, { bg: string, text: string }> = {
  channel:  { bg: 'bg-sky-50',     text: 'text-sky-600' },
  ai:       { bg: 'bg-violet-50',  text: 'text-violet-600' },
  feature:  { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  service:  { bg: 'bg-amber-50',   text: 'text-amber-600' },
  support:  { bg: 'bg-rose-50',    text: 'text-rose-600' },
  capacity: { bg: 'bg-blue-50',    text: 'text-blue-600' }
}

const CATEGORY_LABELS: Record<string, string> = {
  channel:  'Canal',
  ai:       'Inteligencia',
  feature:  'Función',
  service:  'Servicio',
  support:  'Soporte',
  capacity: 'Capacidad'
}

function formatPrice(cents: number, currency = 'MXN'): string {
  const value = cents / 100
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(value)
}

export default function AddonCard({
  addon,
  isActive,
  isLoading = false,
  isLockedByPlan = false,
  isAdmin = false,
  onActivate,
  onCancel
}: AddonCardProps) {
  const Icon = ADDON_ICONS[addon.icon] || Sparkles
  const tone = CATEGORY_TONES[addon.category] || CATEGORY_TONES.feature
  const price = addon.is_recurring ? addon.price_monthly_cents : addon.price_one_time_cents

  return (
    <div className={`bg-white rounded-[24px] border p-6 shadow-sm hover:shadow-md transition-all flex flex-col ${
      isActive ? 'border-emerald-300' : 'border-slate-200 hover:border-slate-300'
    }`}>

      {/* Header: icono pastel + badge sutil */}
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-2xl border border-slate-100 ${tone.bg} ${tone.text}`}>
          <Icon size={24} strokeWidth={2} />
        </div>

        <div className="flex items-center gap-2">
          {isActive && (
            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider rounded-full border border-emerald-200 flex items-center gap-1">
              <CheckCircle2 size={9} />
              Activo
            </span>
          )}
          {addon.is_featured && !isActive && (
            <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider rounded-full border border-slate-200">
              Recomendado
            </span>
          )}
        </div>
      </div>

      {/* Eyebrow de categoría */}
      <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${tone.text}`}>
        {CATEGORY_LABELS[addon.category] || addon.category}
      </p>

      {/* Título + descripción */}
      <h3 className="font-bold text-slate-900 text-lg mb-2">
        {addon.name}
      </h3>
      <p className="text-sm text-slate-500 flex-1 leading-relaxed mb-5">
        {addon.description}
      </p>

      {/* Precio (sutil, sin separador grueso) */}
      <div className="mb-5">
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold text-slate-900">
            {formatPrice(price)}
          </span>
          <span className="text-xs font-medium text-slate-500">
            {addon.is_recurring ? '/ mes' : 'pago único'}
          </span>
        </div>
        {addon.requires_plan_min && (
          <p className="text-[11px] font-medium text-amber-600 mt-1">
            Requiere plan {addon.requires_plan_min} o superior
          </p>
        )}
      </div>

      {/* CTA */}
      {isLockedByPlan ? (
        <button
          type="button"
          disabled
          className="w-full py-2.5 text-sm font-bold rounded-xl border bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Lock size={14} />
          Mejora tu plan
        </button>
      ) : !isActive ? (
        <button
          type="button"
          onClick={onActivate}
          disabled={isLoading}
          className="w-full py-2.5 text-sm font-bold rounded-xl border bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : isAdmin ? (
            <>
              <Plus size={14} />
              Activar (admin)
            </>
          ) : (
            <>
              <Plus size={14} />
              {addon.is_one_time ? 'Comprar' : 'Activar'}
            </>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading || addon.is_one_time}
          className="w-full py-2.5 text-sm font-bold rounded-xl border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : addon.is_one_time ? (
            'Comprado'
          ) : (
            <>
              <X size={14} />
              Cancelar
            </>
          )}
        </button>
      )}
    </div>
  )
}
