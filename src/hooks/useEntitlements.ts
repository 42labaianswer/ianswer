 

'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// ============================================================================
// useEntitlements (v2.26)
// ----------------------------------------------------------------------------
// REEMPLAZA usePlanFeatures de v1.5/2.x.
//
// Lee de la función RPC `get_company_entitlements(company_id)` que combina
// plan base + addons + templates en un solo objeto.
//
// Devuelve:
//   - plan: { slug, tier, name, price_monthly_cents, ... }
//   - features: { crm_kanban: true, ai_premium_model: false, ... }
//   - capacity: { max_sessions_per_month, max_team_members, max_channels, ... }
//   - templates: array de templates instalados
//   - addons: array de addons activos
//
// Uso típico:
//   const { data: ent } = useEntitlements()
//   if (ent?.features.ai_premium_model) { ... }
//   if (ent?.capacity.max_channels >= 3) { ... }
// ============================================================================

export type EntitlementFeatures = {
  // CRM
  crm_kpis: boolean
  crm_advanced_filters: boolean
  crm_unified_timeline: boolean
  crm_kanban: boolean
  crm_bulk_actions: boolean
  crm_export_csv: boolean
  crm_tasks: boolean
  crm_book_from_contact: boolean
  crm_inline_stage_change: boolean
  crm_extra_columns: boolean
  crm_sortable_columns: boolean
  crm_reminders: boolean
  crm_no_show_tracking: boolean
  crm_waitlist: boolean
  crm_referral_tracking: boolean
  crm_retention_metrics: boolean
  crm_tags_visual: boolean
  crm_tags_ai_aware: boolean
  // AI
  ai_advanced_personality: boolean
  ai_multi_agent_mode: boolean
  ai_voice_notes: boolean
  ai_image_analysis: boolean
  ai_pdf_wizard: boolean
  ai_off_topic_wizard: boolean
  ai_premium_model: boolean
  ai_priority_inference: boolean
  // Channels
  channel_extra_whatsapp: boolean
  channel_extra_generic: boolean
  // Team
  team_v2_rich_profiles: boolean
  // Branding
  branding_custom: boolean
  whitelabel_full: boolean
  custom_domain: boolean
  branded_emails: boolean
  // Locations
  multi_location_enabled: boolean
  reports_by_location: boolean
  location_aware_routing: boolean
  // Support
  sla_dedicated: boolean
  support_24_7: boolean
  account_manager: boolean
}

export type EntitlementCapacity = {
  max_sessions_per_month: number
  max_team_members: number
  max_internal_users: number
  max_channels: number
  max_locations: number
  max_agendas: number
  max_bots: number
}

export type EntitlementPlan = {
  slug: string
  tier: 'start' | 'growth' | 'scale' | null
  name: string
  description: string | null
  price_monthly_cents: number
  price_yearly_cents: number | null
}

export type InstalledTemplate = {
  id: string
  name: string
  icon: string
  theme_color: string
  accent_color: string
  tenant_label: string
  ui_labels: Record<string, string>
  active_modules: Record<string, boolean>
  funnels: Record<string, string>
  is_primary: boolean
  config: Record<string, any>
}

export type ActiveAddon = {
  id: string
  name: string
  category: string
  quantity: number
  feature_flags: Record<string, boolean>
  capacity_grants: Record<string, number>
  status: string
  activated_at: string | null
  current_period_end: string | null
}

export type Entitlements = {
  plan: EntitlementPlan
  features: Partial<EntitlementFeatures>
  features_jsonb: Record<string, boolean>
  capacity: EntitlementCapacity
  templates: InstalledTemplate[]
  addons: ActiveAddon[]
  computed_at: string
}

// Default seguro cuando no hay datos: TODAS las features OFF.
const DEFAULT_ENTITLEMENTS: Entitlements = {
  plan: {
    slug: 'start',
    tier: 'start',
    name: 'Start',
    description: null,
    price_monthly_cents: 79900,
    price_yearly_cents: null
  },
  features: {},
  features_jsonb: {},
  capacity: {
    max_sessions_per_month: 1000,
    max_team_members: 1,
    max_internal_users: 0,
    max_channels: 1,
    max_locations: 1,
    max_agendas: 1,
    max_bots: 1
  },
  templates: [],
  addons: [],
  computed_at: new Date().toISOString()
}

export function useEntitlements() {
  return useQuery({
    queryKey: ['entitlements'],
    queryFn: async (): Promise<Entitlements> => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return DEFAULT_ENTITLEMENTS

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single()

      if (!profile?.company_id) return DEFAULT_ENTITLEMENTS

      const { data, error } = await supabase
        .rpc('get_company_entitlements', { p_company_id: profile.company_id })

      if (error) {
        console.error('[useEntitlements] RPC error:', error)
        return DEFAULT_ENTITLEMENTS
      }

      if (!data) return DEFAULT_ENTITLEMENTS

      return data as Entitlements
    },
    // 5 minutos de cache — los planes/addons no cambian a cada rato
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  })
}

// Helper: un solo flag sin destructurar
export function useFeature(flag: keyof EntitlementFeatures): boolean {
  const { data: ent } = useEntitlements()
  return ent?.features?.[flag] ?? false
}

// Helper: un solo límite de capacidad
export function useCapacity(key: keyof EntitlementCapacity): number {
  const { data: ent } = useEntitlements()
  return ent?.capacity?.[key] ?? 0
}

// Helper: ¿este addon está activo?
export function useHasAddon(addonId: string): boolean {
  const { data: ent } = useEntitlements()
  return !!ent?.addons?.find(a => a.id === addonId && a.status === 'active')
}

// Helper: ¿este template está instalado?
export function useHasTemplate(templateId: string): boolean {
  const { data: ent } = useEntitlements()
  return !!ent?.templates?.find(t => t.id === templateId)
}

// Helper: template primario (el que define UI por default)
export function usePrimaryTemplate(): InstalledTemplate | null {
  const { data: ent } = useEntitlements()
  return ent?.templates?.find(t => t.is_primary) ?? ent?.templates?.[0] ?? null
}
