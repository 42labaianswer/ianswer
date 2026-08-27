 

'use client'

// ============================================================================
// src/components/AddonDetailModal.tsx
// ----------------------------------------------------------------------------
// Modal que muestra el detalle completo de un addon cuando se hace click
// en su tile. Incluye descripción, features, precio y botón de activación.
// ============================================================================

import { useEffect, useState } from 'react'
import { X, Check, Loader2, Sparkles, AlertTriangle, Crown, Trash2 } from 'lucide-react'
import { getIcon } from '../lib/iconMap'

interface AddonDetailModalProps {
  addon: {
    id: string
    name: string
    short_name?: string | null
    description: string | null
    category: string
    icon: string
    price_monthly_cents: number
    price_one_time_cents: number
    currency: string
    is_recurring: boolean
    is_one_time: boolean
    is_featured?: boolean
    requires_plan_min?: string | null
    requires_template?: string | null
    feature_flags?: Record<string, boolean>
    capacity_grants?: Record<string, number>
  } | null
  isActive: boolean
  isAdmin: boolean
  isLoading?: boolean
  isDeactivating?: boolean
  onClose: () => void
  onActivate: () => void
  onDeactivate?: () => void
}

// Mismo mapa de templates → label que en la tile (mantenerlos sincronizados)
const TEMPLATE_LABEL: Record<string, { label: string, bg: string, text: string }> = {
  health:           { label: 'Salud',         bg: 'bg-rose-50',    text: 'text-rose-700' },
  real_estate:      { label: 'Inmobiliaria',  bg: 'bg-blue-50',    text: 'text-blue-700' },
  restaurant:       { label: 'Restaurantes',  bg: 'bg-amber-50',   text: 'text-amber-700' },
  marketing_agency: { label: 'Marketing',     bg: 'bg-violet-50',  text: 'text-violet-700' }
}

// Paletas sólidas para el ícono grande del hero del modal
// (deben coincidir con AddonTile.tsx)
const TEMPLATE_ICON_BG: Record<string, string> = {
  health:           'bg-rose-500',
  real_estate:      'bg-blue-600',
  restaurant:       'bg-orange-500',
  marketing_agency: 'bg-violet-600'
}

const CATEGORY_ICON_BG: Record<string, string> = {
  channel:  'bg-sky-500',
  ai:       'bg-violet-600',
  feature:  'bg-emerald-600',
  service:  'bg-amber-500',
  support:  'bg-rose-500',
  capacity: 'bg-blue-600'
}

function getIconBg(addon: { requires_template?: string | null, category: string }): string {
  if (addon.requires_template && TEMPLATE_ICON_BG[addon.requires_template]) {
    return TEMPLATE_ICON_BG[addon.requires_template]
  }
  return CATEGORY_ICON_BG[addon.category] || CATEGORY_ICON_BG.feature
}

const CATEGORY_LABEL: Record<string, string> = {
  channel:  'Canal',
  ai:       'Inteligencia',
  feature:  'Función',
  service:  'Servicio',
  support:  'Soporte',
  capacity: 'Capacidad'
}

const PLAN_TIER_NAMES: Record<string, string> = {
  start:  'Start',
  growth: 'Growth',
  scale:  'Scale'
}

function formatPrice(cents: number, currency: string = 'mxn'): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0
  }).format(cents / 100)
}

// Convertir feature_flag key en label humano
function featureFlagLabel(key: string): string {
  return key
    .replace(/^agenda_/, '')
    .replace(/^realestate_/, '')
    .replace(/^menu_/, '')
    .replace(/^orders_/, '')
    .replace(/^multi_/, 'Multi-')
    .replace(/^ai_/, 'IA ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

export default function AddonDetailModal({
  addon,
  isActive,
  isAdmin,
  isLoading = false,
  isDeactivating = false,
  onClose,
  onActivate,
  onDeactivate
}: AddonDetailModalProps) {
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false)

  // Cerrar con ESC
  useEffect(() => {
    if (!addon) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [addon, onClose])

  if (!addon) return null

  const Icon = getIcon(addon.icon)
  const price = addon.is_recurring ? addon.price_monthly_cents : addon.price_one_time_cents
  const isFree = price === 0
  const tplLabel = addon.requires_template ? TEMPLATE_LABEL[addon.requires_template] : null
  const features = Object.entries(addon.feature_flags || {}).filter(([_, v]) => v === true)
  const capacities = Object.entries(addon.capacity_grants || {}).filter(([_, v]) => v > 0)

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end md:items-center justify-center p-0 md:p-6 bg-slate-950/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full md:max-w-lg rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header con cierre */}
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between p-4 md:p-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            {tplLabel && (
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${tplLabel.bg} ${tplLabel.text}`}>
                {tplLabel.label}
              </span>
            )}
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {CATEGORY_LABEL[addon.category] || addon.category}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 transition-colors"
            aria-label="Cerrar"
          >
            <X size={18} className="text-slate-600" />
          </button>
        </div>

        {/* Hero del addon */}
        <div className="px-6 md:px-8 pt-2 pb-6 flex flex-col items-center text-center">
          <div className={`
            relative w-24 h-24 md:w-28 md:h-28
            ${getIconBg(addon)}
            rounded-3xl
            flex items-center justify-center
            shadow-lg
            mb-5
          `}>
            <Icon size={52} strokeWidth={2} className="text-white" />
            {isActive && (
              <div className="absolute -top-2 -right-2 bg-emerald-500 text-white rounded-full p-1.5 shadow-md ring-2 ring-white">
                <Check size={14} strokeWidth={3.5} />
              </div>
            )}
          </div>

          <h2 className="text-2xl md:text-3xl font-black text-slate-950 tracking-tight mb-2">
            {addon.name}
          </h2>

          {/* Precio */}
          {price > 0 ? (
            <div className="flex items-baseline gap-1.5 mb-4">
              <span className="text-3xl font-black text-slate-950">
                {formatPrice(price, addon.currency)}
              </span>
              <span className="text-sm font-medium text-slate-500">
                {addon.is_recurring ? '/ mes' : 'pago único'}
              </span>
            </div>
          ) : (
            <div className="flex items-baseline gap-1.5 mb-4">
              <span className="text-3xl font-black text-emerald-600">Gratis</span>
              <span className="text-sm font-medium text-slate-500">incluido</span>
            </div>
          )}

          {/* Estado actual */}
          {isActive && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full mb-2">
              <Check size={12} className="text-emerald-700" strokeWidth={3} />
              <span className="text-xs font-black text-emerald-800 uppercase tracking-wider">
                Instalado
              </span>
            </div>
          )}
        </div>

        {/* Descripción */}
        {addon.description && (
          <div className="px-6 md:px-8 pb-6">
            <p className="text-sm md:text-base text-slate-700 leading-relaxed">
              {addon.description}
            </p>
          </div>
        )}

        {/* Lo que activa */}
        {(features.length > 0 || capacities.length > 0) && (
          <div className="px-6 md:px-8 pb-6">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
              Qué incluye
            </p>
            <ul className="space-y-2">
              {features.map(([key]) => (
                <li key={key} className="flex items-center gap-2.5">
                  <div className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <Check size={11} strokeWidth={3} />
                  </div>
                  <span className="text-sm text-slate-800 font-medium">
                    {featureFlagLabel(key)}
                  </span>
                </li>
              ))}
              {capacities.map(([key, value]) => (
                <li key={key} className="flex items-center gap-2.5">
                  <div className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <Check size={11} strokeWidth={3} />
                  </div>
                  <span className="text-sm text-slate-800 font-medium">
                    +{value.toLocaleString('es-MX')} {key.replace('extra_', '').replace('_', ' ')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Requiere plan mínimo */}
        {addon.requires_plan_min && (
          <div className="mx-6 md:mx-8 mb-6 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5">
            <Crown size={16} className="text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-900 leading-tight">
                Requiere plan {PLAN_TIER_NAMES[addon.requires_plan_min] || addon.requires_plan_min} o superior
              </p>
            </div>
          </div>
        )}

        {/* Footer fijo con CTA */}
        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 md:px-8 py-4 flex flex-col gap-2">
          {isActive ? (
            <>
              {/* Estado instalado */}
              <div className="w-full px-6 py-3 bg-emerald-50 text-emerald-700 rounded-2xl font-black text-sm flex items-center justify-center gap-2">
                <Check size={14} strokeWidth={3} /> Instalado
              </div>

              {/* Admin: desactivar directo (con confirmación) */}
              {isAdmin && onDeactivate && (
                confirmingDeactivate ? (
                  <div className="flex flex-col gap-2 pt-1">
                    <p className="text-xs text-center text-slate-600 font-medium">
                      ¿Desactivar este addon? (modo admin, sin cobros)
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmingDeactivate(false)}
                        disabled={isDeactivating}
                        className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => { onDeactivate(); setConfirmingDeactivate(false) }}
                        disabled={isDeactivating}
                        className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-1.5"
                      >
                        {isDeactivating ? <Loader2 size={14} className="animate-spin" /> : <><Trash2 size={13} /> Desactivar</>}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingDeactivate(true)}
                    className="w-full px-6 py-2.5 border border-red-200 text-red-600 hover:bg-red-50 rounded-2xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 size={13} /> Desactivar (admin)
                  </button>
                )
              )}

              {/* Usuario final: cómo cancelar */}
              {!isAdmin && (
                <p className="text-[11px] text-center text-slate-500 font-medium leading-relaxed px-2">
                  Para cancelar este addon, ve a Mi Plan → Suscripciones. El acceso
                  continúa hasta el fin del periodo ya pagado.
                </p>
              )}
            </>
          ) : (
            <button
              onClick={onActivate}
              disabled={isLoading}
              className={`
                w-full px-6 py-3.5 rounded-2xl font-black text-sm
                transition-colors flex items-center justify-center gap-2
                ${isAdmin
                  ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white'
                  : 'bg-slate-950 hover:bg-slate-800 disabled:bg-slate-400 text-white'}
              `}
            >
              {isLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : isAdmin ? (
                <>
                  <Sparkles size={14} />
                  Activar (admin · 30 días gratis)
                </>
              ) : isFree ? (
                <>
                  <Sparkles size={14} />
                  Activar gratis
                </>
              ) : (
                <>Instalar ahora</>
              )}
            </button>
          )}

          {!isActive && !isAdmin && isFree && (
            <p className="text-[11px] text-center text-emerald-600 font-bold">
              Esta función es gratis. Se activa al instante.
            </p>
          )}

          {!isActive && !isAdmin && price > 0 && (
            <p className="text-[11px] text-center text-slate-500 font-medium">
              Cobra a tu método de pago. Cancela cuando quieras.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
