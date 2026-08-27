 

// ============================================================================
// hooks/useAppCapability.ts · Shim v3.0
// ----------------------------------------------------------------------------
// En el 3.0, capabilities eran un jsonb mergeado de apps + plan_app_limits.
// En el modelo unificado, las capabilities por feature viven en
// entitlements.features (merge resuelto de plan + addons).
//
// Esto preserva la firma del 3.0 para que componentes portados no se rompan.
// ============================================================================

import { useEntitlements } from './useEntitlements'
import { useInstalledApps } from './useInstalledApps'
import type { AppId } from '../types/apps'

/**
 * Devuelve si una capability de un app está activa.
 *
 *   useAppCapability('agenda', 'voice_notes') → boolean
 *
 * En el nuevo modelo: ignoramos `appId` (las capabilities están centralizadas
 * en entitlements.features) y solo miramos el flag.
 */
export function useAppCapability(_appId: AppId, capability: string): boolean {
  const { data: entitlements } = useEntitlements()
  return !!(entitlements?.features as Record<string, any> | undefined)?.[capability]
}

/**
 * Hook moderno: leer una feature flag por nombre.
 *
 *   useFeature('ai_premium_model') → boolean
 */
export function useFeature(flag: string): boolean {
  const { data: entitlements } = useEntitlements()
  return !!(entitlements?.features as Record<string, any> | undefined)?.[flag]
}

/**
 * Hook para verificar si un app está instalado (alias de useInstalledApps).
 */
export function useIsAppInstalled(appId: AppId): boolean {
  const { isInstalled } = useInstalledApps()
  return isInstalled(appId)
}

/**
 * Devuelve un límite numérico desde entitlements.capacity.
 *
 *   useAppLimit('menu', 'max_menu_items') → number
 *
 * Si la capacity no existe, devuelve Infinity (sin límite).
 * Útil para gates como `if (items.length >= maxItems) showPaywall()`.
 */
export function useAppLimit(_appId: AppId, capabilityKey: string): number {
  const { data: entitlements } = useEntitlements()
  const value = (entitlements?.capacity as any)?.[capabilityKey]
  if (typeof value === 'number') return value
  // Si la capacity key no existe en el plan, asumimos sin límite
  return Infinity
}
