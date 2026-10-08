 

// ============================================================================
// hooks/useAppCapability.ts · Shim de compatibilidad
// ----------------------------------------------------------------------------
// Las capabilities por feature viven en entitlements.features (merge resuelto
// de plan + addons).
//
// Conserva la firma por app (appId + capability) que usan los componentes
// portados del 3.0, para que no se rompan.
// ============================================================================

import { useEntitlements } from './useEntitlements'
import { useInstalledApps } from './useInstalledApps'
import type { AppId } from '../types/apps'

/**
 * Devuelve si una capability de un app está activa.
 *
 *   useAppCapability('agenda', 'voice_notes') → boolean
 *
 * Ignora `appId` (las capabilities están centralizadas
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
