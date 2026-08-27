 

// ============================================================================
// hooks/useInstalledApps.ts · Shim v3.0
// ----------------------------------------------------------------------------
// El 3.0 consultaba public.company_apps directamente. En el modelo unificado
// (templates + addons), un "app instalado" = un módulo activo en algún template
// instalado por la company.
//
// Devuelve un AppsMap leyendo entitlements.templates[].active_modules.
// ============================================================================

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useEntitlements } from './useEntitlements'
import { ALL_APP_IDS, EMPTY_APPS_MAP, type AppsMap, type AppId } from '../types/apps'

/**
 * Devuelve un AppsMap derivado de entitlements.templates[].active_modules.
 * Si alguno de los templates instalados marca el módulo en true, queda en true.
 */
export function useInstalledApps() {
  const { data: entitlements, isLoading } = useEntitlements()

  const appsMap = useMemo<AppsMap>(() => {
    const map: AppsMap = { ...EMPTY_APPS_MAP }
    const templates = entitlements?.templates || []
    for (const tpl of templates) {
      const modules = (tpl as any).active_modules || (tpl as any).config?.active_modules || {}
      for (const id of ALL_APP_IDS) {
        if (modules[id]) map[id] = true
      }
    }
    return map
  }, [entitlements])

  return {
    data: appsMap,
    isLoading,
    isInstalled: (id: AppId) => appsMap[id] === true
  }
}

/**
 * En el 3.0 esto detectaba si la company ya estaba migrada al modelo de apps.
 * En el modelo unificado siempre devolvemos true (el modelo nuevo siempre aplica).
 */
export function useHasNewAppsModel(): boolean {
  return true
}
