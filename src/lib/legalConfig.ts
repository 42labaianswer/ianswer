// lib/legalConfig.ts
// ============================================================================
// Plataforma Multi-Tenant de Asistente IA (c) 2026 Gustavo Monforte Herrero
// ----------------------------------------------------------------------------
// Carga centralizada de la configuración legal desde platform_settings.
// ============================================================================

import { createClient } from '@supabase/supabase-js'

export interface LegalConfig {
  brandName: string
  legalSettings: {
    legal_name?: string
    website_url?: string
    support_email?: string
    data_collected?: string
    data_purpose?: string
    third_party_services?: string
    payment_processor?: string
    deletion_instructions?: string
    minimum_age?: string
    dpo_email?: string
    billing_email?: string
    legal_email?: string
    abuse_email?: string
    whatsapp_number?: string
    contact_address?: string
    contact_title?: string          // ← nuevo
    contact_subtitle?: string       // ← nuevo
  }
}

export async function loadLegalConfig(): Promise<LegalConfig> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data } = await supabase
    .from('platform_settings')
    .select('name, legal_settings')
    .eq('id', 1)
    .maybeSingle()

  const brandName = data?.name || 'Plataforma'
  const legalSettings = data?.legal_settings || {}

  return { brandName, legalSettings }
}

export function formatWhatsApp(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10) {
    return `+52 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  }
  if (digits.length === 12 && digits.startsWith('52')) {
    const rest = digits.slice(2)
    return `+52 ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`
  }
  return `+${digits}`
}