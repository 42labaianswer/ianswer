 

'use client'
import { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useEntitlements } from '../hooks/useEntitlements'
import { Lock, Sparkles, ArrowRight, Loader2 } from 'lucide-react'

// ============================================================================
// FeatureGate v3.0
// ----------------------------------------------------------------------------
// Wrapper que protege bloques de UI detrás de un feature flag o capacidad.
//
// Tres variantes:
//   - "card": muestra una tarjeta de paywall en lugar del contenido
//   - "inline": muestra el children pero deshabilitado, con badge "addon"
//   - "limit": valida una capacidad numérica (ej. canales actuales vs max)
//
// Ejemplos:
//   <FeatureGate feature="ai_agent_simulator" addonId="agent_simulator">
//     <Simulador />
//   </FeatureGate>
//
//   <FeatureGate
//     capacity="max_channels"
//     currentValue={channels.length}
//     mode="inline"
//     addonId="extra_channel">
//     <button>Conectar canal</button>
//   </FeatureGate>
// ============================================================================

type Props = {
  /** Feature flag a verificar (de entitlements.features) */
  feature?: string
  /** Capacity key a verificar (de entitlements.capacity) */
  capacity?: string
  /** Valor actual cuando se verifica capacity */
  currentValue?: number
  /** Modo de presentación cuando no se cumple */
  mode?: 'card' | 'inline' | 'limit'
  /** ID del addon que activa esta feature/capacity (para CTA) */
  addonId?: string
  /** Nombre legible del feature (para mensajes) */
  featureName?: string
  /** Descripción corta para el paywall */
  description?: string
  children: ReactNode
}

export default function FeatureGate({
  feature,
  capacity,
  currentValue,
  mode = 'card',
  addonId,
  featureName,
  description,
  children
}: Props) {
  const router = useRouter()
  const { data: entitlements, isLoading } = useEntitlements()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  // ── Verificación de feature flag ──
  let allowed = true
  let limitInfo: { used: number, limit: number } | null = null

  if (feature && entitlements) {
    allowed = !!(entitlements.features as Record<string, any> | undefined)?.[feature]
  }

  if (capacity && entitlements && typeof currentValue === 'number') {
    const limit = (entitlements.capacity as any)?.[capacity]
    if (typeof limit === 'number') {
      allowed = currentValue < limit
      limitInfo = { used: currentValue, limit }
    }
  }

  // Permitido → renderiza children como están
  if (allowed) {
    return <>{children}</>
  }

  // No permitido → renderiza según el modo
  if (mode === 'inline') {
    return (
      <div className="relative inline-block">
        <div className="pointer-events-none opacity-40">{children}</div>
        <button
          type="button"
          onClick={() => router.push(addonId ? `/dashboard/addons?highlight=${addonId}` : '/dashboard/addons')}
          className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm rounded-xl hover:bg-amber-50/80 transition-colors group"
        >
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-[11px] font-black uppercase tracking-wider rounded-full shadow-md group-hover:scale-105 transition-transform">
            <Lock size={11} />
            Activar addon
          </span>
        </button>
      </div>
    )
  }

  if (mode === 'limit' && limitInfo) {
    return (
      <div className="p-6 bg-amber-50 border-2 border-amber-200 rounded-2xl">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 bg-amber-500 text-white rounded-xl flex items-center justify-center shrink-0">
            <Lock size={20} />
          </div>
          <div className="flex-1">
            <h3 className="font-black text-amber-900 mb-1">Límite alcanzado</h3>
            <p className="text-sm text-amber-800 font-medium mb-3">
              Estás usando {limitInfo.used} de {limitInfo.limit} {featureName || capacity}.
              {' '}{description || 'Activa el addon para ampliar tu capacidad.'}
            </p>
            <button
              onClick={() => router.push(addonId ? `/dashboard/addons?highlight=${addonId}` : '/dashboard/addons')}
              className="px-4 py-2 bg-amber-900 hover:bg-amber-950 text-white text-xs font-bold rounded-lg flex items-center gap-1.5"
            >
              Ver addon disponible <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // mode = "card" (default)
  return (
    <div className="p-8 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl shadow-xl">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-amber-400" />
        <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
          Addon premium
        </span>
      </div>
      <h3 className="text-xl font-black mb-2 tracking-tight">
        {featureName || 'Esta funcionalidad requiere un addon'}
      </h3>
      <p className="text-sm text-slate-300 font-medium mb-5 max-w-xl">
        {description || 'Activa el addon correspondiente para desbloquear esta función.'}
      </p>
      <button
        onClick={() => router.push(addonId ? `/dashboard/addons?highlight=${addonId}` : '/dashboard/addons')}
        className="px-5 py-2.5 bg-white text-slate-900 hover:bg-slate-100 text-sm font-bold rounded-xl flex items-center gap-2 transition-colors"
      >
        Ver addon <ArrowRight size={14} />
      </button>
    </div>
  )
}
