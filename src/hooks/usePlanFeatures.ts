 

'use client'

// ============================================================================
// usePlanFeatures (capa de compatibilidad)
// ----------------------------------------------------------------------------
// Mantiene esta firma para que TODO el código que importa `usePlanFeatures`
// y `useFeature` siga funcionando sin tocar nada.
//
// Internamente delega a useEntitlements (el hook unificado).
// ============================================================================

import { useEntitlements, EntitlementFeatures } from './useEntitlements'

// Tipo legacy: mantiene exactamente los keys que usaba el sistema viejo.
export type PlanFeatures = Partial<EntitlementFeatures>

export function usePlanFeatures() {
  const q = useEntitlements()
  return {
    ...q,
    data: q.data?.features as PlanFeatures | undefined
  }
}

export function useFeature(flag: keyof EntitlementFeatures): boolean {
  const { data: ent } = useEntitlements()
  return ent?.features?.[flag] ?? false
}
