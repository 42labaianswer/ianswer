 

'use client'

import { useEffect, ReactNode } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
// ============================================================================
// WorkspaceContext (v2.26)
// ----------------------------------------------------------------------------
// Refactorizado para soportar el modelo de templates + addons.
//
// Cambios vs v1.5:
//   - El concepto "vertical" del modelo viejo se llama ahora `primaryTemplate`.
//     El shim de compat fue removido en el Sprint 3 (fresh-install only).
//   - `installedTemplates` es nuevo: lista de TODOS los templates instalados.
//   - `modules` se computa fusionando active_modules de TODOS los templates +
//     features de addons activos (por ejemplo `multi_location_enabled`).
//   - `labels` se toma del template primario.
//   - Se mantiene la misma forma de consumir desde componentes para minimizar
//     cambios en el resto del código.
// ============================================================================

// ── Protección contra llamadas colgadas ──────────────────────────────────
// `refreshWorkspace()` encadena varias llamadas a Supabase (selects + RPCs).
// Sin esto, si UNA se queda colgada (wifi inestable, VPN, pestaña que estuvo
// en segundo plano), el `await` nunca se resuelve ni rechaza, el código nunca
// llega al `finally`, y `isLoadingWorkspace` se queda en `true` para siempre
// — lo que deja TODA página que depende de este flag (Equipo, Inbox, Menu,
// Orders, Dashboard, Contacts, Properties) atorada en "Cargando..." hasta
// recargar. `withTimeout` fuerza que cada llamada falle a tiempo en vez de
// colgarse indefinidamente, para que el try/catch/finally de abajo siempre
// pueda terminar. (Hallazgo de la investigación de la Tarea 5, 21-sep.)
function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Tiempo de espera agotado (${ms}ms) esperando ${label}`))
    }, ms)
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) }
    )
  })
}

type UILabels = {
  client: string
  clients: string
  client_plural?: string
  staff: string
  staff_plural: string
  location: string
  location_plural: string
  appointment?: string
  appointments?: string
  pipeline_kanban_title?: string
}

type ActiveModules = {
  calendar: boolean
  properties: boolean
  menu: boolean
  orders?: boolean
  reservations?: boolean
  tracking?: boolean
  patients?: boolean
  medical_memory?: boolean
  waitlist?: boolean
  reminders?: boolean
  leads?: boolean
  visits?: boolean
  team?: boolean
  campaigns?: boolean
  accounts?: boolean
  reports_executive?: boolean
}

type Funnels = {
  new_lead: string
  hot_lead: string
  payment: string
  customer: string
}

type PrimaryTemplate = {
  id: string
  name: string
  icon: string
  theme_color: string
  accent_color: string
  tenant_label: string
  funnels?: Record<string, string>
  ui_labels?: Record<string, string>
}

type InstalledTemplate = {
  id: string
  name: string
  icon: string
  is_primary: boolean
}

type WorkspaceState = {
  labels: UILabels
  modules: ActiveModules
  funnels: Funnels
  platform: { name: string, logo_url: string, icon_url: string }
  primaryTemplate: PrimaryTemplate
  installedTemplates: InstalledTemplate[]
  isLoadingWorkspace: boolean
  refreshWorkspace: () => Promise<void>
  hydrateServerTheme: (theme: { theme_color?: string | null; accent_color?: string | null; template_name?: string | null; template_icon?: string | null; tenant_label?: string | null }) => void
}

const defaultLabels: UILabels = {
  client: 'Cliente',
  clients: 'Clientes',
  client_plural: 'Clientes',
  staff: 'Miembro',
  staff_plural: 'Equipo',
  location: 'Sucursal',
  location_plural: 'Sucursales',
  appointment: 'Cita',
  appointments: 'Citas',
  pipeline_kanban_title: 'Pipeline'
}

const defaultModules: ActiveModules = {
  calendar: true,
  properties: false,
  menu: false,
  team: true
}

const defaultFunnels: Funnels = {
  new_lead: 'Nuevo Lead',
  hot_lead: 'Interesado',
  payment: 'En Proceso',
  customer: 'Cliente'
}

const defaultPrimaryTemplate: PrimaryTemplate = {
  id: 'generic',
  name: 'Genérico',
  icon: 'Sparkles',
  theme_color: '#020617',
  accent_color: '#4f46e5',
  tenant_label: 'Plataforma'
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      labels: defaultLabels,
      modules: defaultModules,
      funnels: defaultFunnels,
      platform: { name: '{brandName}', logo_url: '', icon_url: '' },
      primaryTemplate: defaultPrimaryTemplate,
      installedTemplates: [],
      isLoadingWorkspace: true,

      // Hidrata el tema (colores + nombre de plantilla) desde el servidor para
      // evitar el flash de hidratación. Solo actualiza el primaryTemplate sin
      // disparar una recarga completa del workspace.
      hydrateServerTheme: (theme) => {
        const current = get().primaryTemplate
        set({
          primaryTemplate: {
            ...current,
            theme_color: theme.theme_color || current.theme_color,
            accent_color: theme.accent_color || current.accent_color,
            name: theme.template_name || current.name,
            icon: theme.template_icon || current.icon,
            tenant_label: theme.tenant_label || current.tenant_label,
          },
        })
      },

      refreshWorkspace: async () => {
        const isCached = get().platform.name !== '{brandName}' && get().primaryTemplate.id !== 'generic'
        if (!isCached) set({ isLoadingWorkspace: true })

        try {
          // 1. Platform settings (logo, marca)
          const { data: platformData } = await withTimeout(
            supabase.from('platform_settings').select('name, logo_url, icon_url').eq('id', 1).single(),
            10000, 'platform_settings'
          )

          if (platformData) {
            set({
              platform: {
                name: platformData.name || '{brandName}',
                logo_url: platformData.logo_url || '',
                icon_url: platformData.icon_url || ''
              }
            })
            if (typeof document !== 'undefined' && platformData.name) {
              document.title = platformData.name
            }
          }

          // 2. Usuario actual
          const { data: { user } } = await withTimeout(supabase.auth.getUser(), 10000, 'auth.getUser()')
          if (!user) {
            set({ isLoadingWorkspace: false })
            return
          }

          const { data: profile } = await withTimeout(
            supabase.from('profiles').select('company_id').eq('id', user.id).single(),
            10000, 'profiles'
          )

          if (!profile?.company_id) {
            set({ isLoadingWorkspace: false })
            return
          }

          // 3. Entitlements (plan + templates + addons combinados)
          const { data: ent, error: entError } = await withTimeout(
            supabase.rpc('get_company_entitlements', { p_company_id: profile.company_id }),
            15000, 'get_company_entitlements'
          )

          if (entError) {
            console.error('[Workspace] get_company_entitlements error:', entError)
            set({ isLoadingWorkspace: false })
            return
          }

          if (!ent) {
            set({ isLoadingWorkspace: false })
            return
          }

          // 4. Extraer template primario
          const templates = (ent.templates || []) as any[]
          const primary = templates.find(t => t.is_primary) || templates[0]

          if (primary) {
            const newPrimaryTemplate: PrimaryTemplate = {
              id: primary.id,
              name: primary.name,
              icon: primary.icon,
              theme_color: primary.theme_color || '#020617',
              accent_color: primary.accent_color || '#4f46e5',
              tenant_label: primary.tenant_label || 'Plataforma',
              funnels: primary.funnels || undefined,
              ui_labels: primary.ui_labels || undefined
            }

            // Fusión de active_modules: cualquier template instalado que
            // tenga true en un módulo, lo activa globalmente.
            const fusedModules: ActiveModules = { ...defaultModules }
            templates.forEach((t: any) => {
              const mods = t.active_modules || {}
              Object.keys(mods).forEach(key => {
                if (mods[key] === true) {
                  ;(fusedModules as any)[key] = true
                }
              })
            })

            // Si hay addon multi_location_enabled, asegurar locations
            const addons = (ent.addons || []) as any[]
            const hasMultiLocation = addons.some(a =>
              a.status === 'active' && a.feature_flags?.multi_location_enabled
            )
            if (hasMultiLocation) {
              ;(fusedModules as any).multi_location = true
            }

            // #3: Mantener visibles los módulos que YA tienen datos, aunque la
            // plantilla activa no los incluya. Así, si tienes propiedades y
            // cambias a médico, el tab de Propiedades no desaparece. Para
            // quitarlo se borran los datos o se quita el extra.
            try {
              const { data: dataModules } = await withTimeout(
                supabase.rpc('get_modules_with_data', { p_company_id: profile.company_id }),
                10000, 'get_modules_with_data'
              )
              if (dataModules && typeof dataModules === 'object') {
                Object.keys(dataModules).forEach(key => {
                  if ((dataModules as any)[key] === true) {
                    ;(fusedModules as any)[key] = true
                  }
                })
              }
            } catch {
              // Si la RPC no existe aún, seguimos sin romper
            }

            set({
              labels: primary.ui_labels || defaultLabels,
              modules: fusedModules,
              funnels: primary.funnels || defaultFunnels,
              primaryTemplate: newPrimaryTemplate,
              installedTemplates: templates.map((t: any) => ({
                id: t.id,
                name: t.name,
                icon: t.icon,
                is_primary: !!t.is_primary
              }))
            })
          }
        } catch (error) {
          console.error('[Workspace] Error cargando workspace:', error)
        } finally {
          set({ isLoadingWorkspace: false })
        }
      }
    }),
    {
      name: 'workspace-cache-v3',  // bump: invalida caches viejos con tabs fantasma
      partialize: (state) => ({
        labels: state.labels,
        modules: state.modules,
        funnels: state.funnels,
        platform: state.platform,
        primaryTemplate: state.primaryTemplate,
        installedTemplates: state.installedTemplates
      })
    }
  )
)

// Provider fantasma (drop-in del original)
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // ⚠️ Usamos getState() en vez del selector para evitar loop infinito:
    // si extraemos refreshWorkspace via selector, su referencia cambia con
    // cada update del store y el useEffect se re-ejecuta sin parar.
    useWorkspace.getState().refreshWorkspace()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <>{children}</>
}
