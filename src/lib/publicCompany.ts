// ============================================================================
// src/lib/publicCompany.ts
// ----------------------------------------------------------------------------
// Lectura de datos PÚBLICOS de una empresa para las páginas sin sesión
// (/p/[slug], /menu/[slug], opengraph). Solo para Server Components / rutas
// del servidor: usa service_role, que nunca llega al navegador.
//
// Por qué (29-sep-2026, fix_open_policies_parte2.sql): companies tenía un
// SELECT abierto a todos ("Duenos ven su propia clinica" USING true) que
// dejaba leer con la clave pública los tokens de Meta, los IDs de Stripe, etc.
// de todas las empresas. Esas páginas eran la razón de mantenerlo. Ahora la
// política se quita y aquí solo se pueden pedir columnas de la lista blanca.
// ============================================================================

import { createClient } from '@supabase/supabase-js'

/** Columnas de companies que se pueden mostrar en páginas públicas. */
const PUBLIC_COLUMNS = [
  'id', 'slug', 'name', 'description', 'logo_url',
  'primary_color', 'secondary_color', 'phone_e164', 'website',
  'brand_logo_url', 'brand_primary_color', 'brand_accent_color',
] as const

export type PublicCompanyColumn = typeof PUBLIC_COLUMNS[number]

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function assertPublic(columns: readonly PublicCompanyColumn[]) {
  const bad = columns.filter(c => !(PUBLIC_COLUMNS as readonly string[]).includes(c))
  if (bad.length) throw new Error(`[publicCompany] Columnas no públicas: ${bad.join(', ')}`)
}

/** Empresa por `slug` (directorio /p/[slug]). */
export async function getPublicCompanyBySlug<T = Record<string, unknown>>(
  slug: string,
  columns: readonly PublicCompanyColumn[]
): Promise<{ data: T | null; error: { message: string } | null }> {
  assertPublic(columns)
  const { data, error } = await adminClient()
    .from('companies')
    .select(columns.join(', '))
    .eq('slug', slug)
    .maybeSingle()
  return { data: (data as T | null) ?? null, error }
}

/** Empresa por `id` (menú público /menu/[id]). */
export async function getPublicCompanyById<T = Record<string, unknown>>(
  id: string,
  columns: readonly PublicCompanyColumn[]
): Promise<{ data: T | null; error: { message: string } | null }> {
  assertPublic(columns)
  const { data, error } = await adminClient()
    .from('companies')
    .select(columns.join(', '))
    .eq('id', id)
    .maybeSingle()
  return { data: (data as T | null) ?? null, error }
}

/** ¿La empresa tiene instalada la plantilla indicada? (company_templates no es pública). */
export async function companyHasTemplate(companyId: string, templateId: string): Promise<boolean> {
  const { data } = await adminClient()
    .from('company_templates')
    .select('template_id')
    .eq('company_id', companyId)
    .eq('template_id', templateId)
    .maybeSingle()
  return !!data
}
