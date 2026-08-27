 

// ============================================================================
// src/app/sitemap.ts
// ----------------------------------------------------------------------------
// Genera /sitemap.xml dinámicamente con todas las páginas públicas + artículos
// del centro de ayuda publicados.
// ============================================================================

import { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL
if (!BASE_URL) {
  throw new Error('Falta NEXT_PUBLIC_BASE_URL o NEXT_PUBLIC_SITE_URL en el entorno')
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = [
    '',
    '/precios',
    '/funciones',
    '/plantillas',
    '/integraciones',
    '/recursos/ayuda',
    '/contacto',
    '/sobre-nosotros',
    '/legal/privacidad',
    '/legal/terminos',
    '/legal/cookies'
  ]

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map(path => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1.0 : path === '/precios' ? 0.9 : 0.7
  }))

  // Artículos del centro de ayuda
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: articles } = await supabase
      .from('help_articles')
      .select('slug, updated_at')
      .eq('published', true)

    const articleEntries: MetadataRoute.Sitemap = (articles || []).map((art: any) => ({
      url: `${BASE_URL}/recursos/ayuda/${art.slug}`,
      lastModified: art.updated_at ? new Date(art.updated_at) : new Date(),
      changeFrequency: 'monthly',
      priority: 0.5
    }))

    return [...staticEntries, ...articleEntries]
  } catch {
    return staticEntries
  }
}
