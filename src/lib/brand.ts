// lib/brand.ts
import { createClient } from '@supabase/supabase-js'

let cachedBrandName: string = 'Plataforma' // Siempre tendrá un valor
let cacheTimestamp: number = 0
const CACHE_TTL = 60 * 1000 // 1 minuto

/**
 * Obtiene el nombre de la marca desde platform_settings.
 * Solo se puede usar en Server Components (o en cualquier lugar donde se pueda
 * llamar a Supabase directamente con la anon key).
 * Cachea el resultado en memoria para reducir llamadas.
 */
export async function getBrandName(): Promise<string> {
  // Si está en caché y no ha expirado
  if (cachedBrandName && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedBrandName
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data, error } = await supabase
    .from('platform_settings')
    .select('name')
    .eq('id', 1)
    .maybeSingle()

  if (error || !data?.name) {
    console.warn('[brand] No se pudo obtener brandName, usando fallback "Plataforma"')
    cachedBrandName = 'Plataforma'
  } else {
    cachedBrandName = data.name
  }

  cacheTimestamp = Date.now()
  return cachedBrandName
}

/**
 * Reemplaza todas las ocurrencias de "iAnswer" (case insensitive) en un string
 * por el brandName dado. Si no se pasa brandName, lo obtiene con getBrandName().
 * Útil para textos largos donde queremos inyectar el nombre dinámico.
 */
export async function replaceBrandText(
  text: string,
  brandName?: string
): Promise<string> {
  const name = brandName ?? await getBrandName()
  return text.replace(/\bPlataforma\b/gi, name)
}

/**
 * Versión síncrona para cuando ya tenemos el brandName en el cliente.
 * (No usa async)
 */
export function replaceBrandTextSync(text: string, brandName: string): string {
  return text.replace(/\bPlataforma\b/gi, brandName)
}