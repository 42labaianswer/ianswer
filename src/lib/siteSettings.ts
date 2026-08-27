 

// ============================================================================
// src/lib/siteSettings.ts
// ----------------------------------------------------------------------------
// Carga site_settings (textos) y platform_settings (logo, nombre marca) desde
// Supabase.
// ============================================================================

import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function loadSiteSettings(): Promise<Record<string, any>> {
  const supabase = createClient(supabaseUrl, supabaseAnon)
  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value')
  if (error || !data) return {}
  return data.reduce((acc: Record<string, any>, row: any) => {
    acc[row.key] = row.value
    return acc
  }, {})
}

export interface PlatformBranding {
  name: string
  logo_url: string
  icon_url?: string
}

export async function loadPlatformBranding(): Promise<PlatformBranding> {
  const supabase = createClient(supabaseUrl, supabaseAnon)
  const { data } = await supabase
    .from('platform_settings')
    .select('name, logo_url, icon_url')
    .maybeSingle()
  return {
    name:     (data as any)?.name     || 'Plataforma',
    logo_url: (data as any)?.logo_url || '',
    icon_url: (data as any)?.icon_url || ''
  }
}

// Helper para leer settings con default
export function s(settings: Record<string, any>, key: string, defaultValue: any = '') {
  return settings[key] ?? defaultValue
}
