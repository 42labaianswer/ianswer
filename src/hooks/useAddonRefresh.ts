 

// src/hooks/useAddonRefresh.ts
// ----------------------------------------------------------------------------
// Sprint AA · Refresco global tras activar/desactivar un addon.
//
// El problema: al activar un addon, los tabs nuevos (Tracking en Órdenes,
// Entrenamiento en Agente IA, etc.) dependen de queries que viven en otras
// páginas. Invalidar solo 'active-addons' no basta; hay que invalidar TODAS
// las queries de gating para que esos tabs aparezcan sin recargar la página.
//
// Este hook centraliza esa invalidación.
// ----------------------------------------------------------------------------

import { useQueryClient } from '@tanstack/react-query'

// Todas las queryKeys que dependen del estado de addons/entitlements.
const ADDON_DEPENDENT_KEYS = [
  'active-addons',
  'active-addons-detailed',
  'entitlements',
  'company-entitlements',
  'has-order-tracking-addon',
  'has-agent-training-addon',
  'usage-current-month',
  'catalog-addons',
  'company-available-addons',
  'plan-features',
]

export function useAddonRefresh() {
  const queryClient = useQueryClient()

  // Invalida todas las queries relevantes para que el UI se actualice en vivo.
  async function refreshAll() {
    await Promise.all(
      ADDON_DEPENDENT_KEYS.map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] })
      )
    )
    // También refrescamos cualquier query que empiece con estos prefijos
    // (por si tienen parámetros, ej. ['has-order-tracking-addon', companyId]).
    await queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0]
        return typeof key === 'string' && ADDON_DEPENDENT_KEYS.includes(key)
      },
    })
  }

  return { refreshAll }
}
