 

// ============================================================================
// types/database.ts — v2.26
// ----------------------------------------------------------------------------
// Tipos del schema de iAnswer 2.0 después de la migración v2.26.
// ============================================================================

// ─────────── Planes (Start / Growth / Scale) ───────────
export type PlanTier = 'start' | 'growth' | 'scale'

export interface Plan {
  slug: string
  tier: PlanTier
  name: string
  description: string | null
  price_monthly_cents: number
  price_yearly_cents: number | null
  max_sessions_per_month: number
  max_team_members: number
  max_internal_users: number
  max_channels: number
  max_locations: number
  max_agendas: number
  max_bots: number
  features: string | null
  feature_flags: Record<string, boolean>
  features_jsonb: Record<string, boolean>
  is_active: boolean
  is_legacy: boolean
  display_order: number
  stripe_price_id: string | null
  stripe_price_yearly_id: string | null
}

// ─────────── Templates ───────────
export interface Template {
  id: string
  name: string
  short_name: string | null
  description: string | null
  icon: string
  theme_color: string
  accent_color: string
  tenant_label: string
  ui_labels: Record<string, string>
  active_modules: Record<string, boolean>
  funnels: Record<string, string>
  custom_fields: Array<{ key: string, label: string, type: string, options?: string[] }>
  default_prompts: Record<string, any>
  is_active: boolean
  is_generic: boolean
  is_legacy: boolean
  display_order: number
}

export interface CompanyTemplate {
  id: string
  company_id: string
  template_id: string
  is_primary: boolean
  config: Record<string, any>
  installed_at: string
  updated_at: string
}

// ─────────── Addons ───────────
export type AddonCategory = 'channel' | 'ai' | 'feature' | 'service' | 'support' | 'capacity'

export interface Addon {
  id: string
  name: string
  short_name: string | null
  description: string | null
  category: AddonCategory
  icon: string
  price_monthly_cents: number
  price_one_time_cents: number
  currency: string
  stripe_price_id: string | null
  is_recurring: boolean
  is_one_time: boolean
  feature_flags: Record<string, boolean>
  capacity_grants: Record<string, number>
  requires_plan_min: PlanTier | null
  requires_template: string | null
  is_active: boolean
  is_featured: boolean
  display_order: number
}

export interface CompanyAddon {
  id: string
  company_id: string
  addon_id: string
  quantity: number
  status: 'pending' | 'active' | 'past_due' | 'canceled' | 'expired'
  stripe_subscription_item_id: string | null
  stripe_invoice_id: string | null
  stripe_checkout_session_id: string | null
  activated_at: string | null
  current_period_end: string | null
  canceled_at: string | null
  created_at: string
  updated_at: string
}

// ─────────── Company ───────────
export interface Company {
  id: string
  name: string
  plan_slug: string
  account_status: 'active' | 'trial' | 'expired'
  subscription_status: 'active' | 'past_due' | 'canceled' | 'inactive'
  contact_email: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  onboarding_step: number
  onboarding_completed: boolean
  brand_logo_url: string | null
  brand_primary_color: string | null
  brand_accent_color: string | null
  created_at: string
}

// ─────────── Entitlements RPC return ───────────
export interface CompanyEntitlements {
  plan: {
    slug: string
    tier: PlanTier
    name: string
    description: string | null
    price_monthly_cents: number
    price_yearly_cents: number | null
  }
  features: Record<string, boolean>
  features_jsonb: Record<string, boolean>
  capacity: {
    max_sessions_per_month: number
    max_team_members: number
    max_internal_users: number
    max_channels: number
    max_locations: number
    max_agendas: number
    max_bots: number
  }
  templates: Array<Template & { is_primary: boolean; config: Record<string, any> }>
  addons: Array<{
    id: string
    name: string
    category: AddonCategory
    quantity: number
    feature_flags: Record<string, boolean>
    capacity_grants: Record<string, number>
    status: string
    activated_at: string | null
    current_period_end: string | null
  }>
  computed_at: string
}

// ─────────── Compat con código viejo (deprecated) ───────────
export type PlanType = 'start' | 'growth' | 'scale' | 'personal' | 'personal_plus' | 'centro_salud'
export type AgendaType = 'location' | 'doctor'

export interface Account {
  id: string
  name: string
  plan_type: PlanType
  stripe_customer_id?: string
  subscription_status: 'active' | 'past_due' | 'canceled' | 'inactive'
}

export interface Bot {
  id: string
  account_id: string
  business_phone_id: string
  name: string
  system_prompt: string
}

export interface Agenda {
  id: string
  bot_id: string
  type: AgendaType
  name: string
  schedule_rules: string
  google_calendar_id: string
}
