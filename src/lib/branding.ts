 

// ============================================================================
// lib/branding.ts · v3.0 Sprint 5
// ----------------------------------------------------------------------------
// Helper SSR para verificar si una company tiene el addon full_branding activo.
// Usado en /menu/[slug], /propiedad/[slug] y /tracking/[order] para decidir si
// mostrar "Powered by [Platform]" en el footer.
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { loadPlatformBranding } from '../lib/siteSettings'

 const branding = await loadPlatformBranding()
  const brandName = branding.name || 'Plataforma'
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * Verifica si una company tiene full_branding activo.
 * Devuelve true si:
 *   - tiene un addon activo con flag whitelabel_full en sus features
 *   - O su plan ya incluye whitelabel_full (raro en este modelo, pero posible)
 *
 * Usa el RPC get_company_entitlements que ya mergea plan + addons activos.
 */
export async function hasFullBranding(companyId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAnon
      .rpc('get_company_entitlements', { p_company_id: companyId })

    if (error || !data) return false
    return !!(data as any)?.features?.whitelabel_full
  } catch {
    return false
  }
}

/**
 * Obtiene el nombre de la plataforma para mostrar "Powered by X".
 */
export async function getPlatformName(): Promise<string> {
  try {
    const { data } = await supabaseAnon
      .from('platform_settings')
      .select('name')
      .eq('id', 1)
      .maybeSingle()
    return data?.name || '{brandName}'
  } catch {
    return '{brandName}'
  }
}
