 

// ============================================================================
// src/types/apps.ts · Shim de compatibilidad v3.0
// ----------------------------------------------------------------------------
// El modelo del 3.0 hablaba de "apps" (app_id, AppsMap, instalación granular).
// En el modelo v3 unificado (templates + addons + entitlements), un "app id"
// es simplemente la clave de un módulo dentro de active_modules del template.
//
// Este shim existe para que los componentes portados del 3.0 (MenuContent,
// OrdersContent, PropertiesContent, AppGate) sigan compilando y funcionando
// sin reescribirse uno a uno.
//
// La lógica real vive en useInstalledApps.ts y useAppCapability.ts (también
// shims), que consultan entitlements.templates.active_modules.
// ============================================================================

export const ALL_APP_IDS = [
  'agenda',
  'recordatorios',
  'lista_espera',
  'reactivacion',
  'referidos',
  'propiedades',
  'menu',
  'ordenes',
  'pagos',
  'hubspot_sync',
  'multi_sucursal',
  'reviews_nps',
  // Nuevos en v3 (ya no son apps separadas, son módulos activos vía template)
  'patients',
  'medical_memory',
  'team',
  'calendar',
  'tracking',
  'reservations',
] as const

export type AppId = typeof ALL_APP_IDS[number]
export type AppStatus     = 'active' | 'trial' | 'suspended' | 'cancelled'
export type CatalogStatus = 'active' | 'beta' | 'coming_soon' | 'deprecated'
export type AppCategory   = 'productivity' | 'sales' | 'ai' | 'integration' | 'vertical'

export type AppsMap = Record<AppId, boolean>

export type AppCapabilities = Record<string, boolean | number | string>

export type AppRecord = {
  id: AppId
  name: string
  short_description: string | null
  long_description: string | null
  icon_name: string | null
  color_token: string
  category: AppCategory
  price_monthly_mxn: number
  min_plan_slug: string | null
  required_app_ids: AppId[]
  suggested_for_verticals: string[]
  routes: string[]
  requires_onboarding: boolean
  capabilities: AppCapabilities
  status: CatalogStatus
  display_order: number
}

export type CompanyAppRecord = {
  company_id: string
  app_id: AppId
  installed_at: string
  trial_ends_at: string | null
  status: AppStatus
}

export const EMPTY_APPS_MAP: AppsMap = ALL_APP_IDS.reduce<AppsMap>((acc, id) => {
  acc[id] = false
  return acc
}, {} as AppsMap)
