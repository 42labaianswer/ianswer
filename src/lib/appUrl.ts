// ============================================================================
// src/lib/appUrl.ts
// ----------------------------------------------------------------------------
// URL pública de la app para armar enlaces que salen por correo (recuperar
// contraseña, etc.). plan-agente-semana04, 2.1.
//
// Antes forgot-password leía solo NEXT_PUBLIC_BASE_URL; en Vercel solo existe
// NEXT_PUBLIC_SITE_URL, así que el redirectTo quedaba "undefined/reset-password",
// Supabase lo rechazaba y caía a su Site URL (que en producción decía localhost).
//
// - Acepta cualquiera de las 3 variables que ya existen en el proyecto.
// - Quita la "/" final (NEXT_PUBLIC_SITE_URL en Vercel termina en "/", lo que
//   armaba "https://www.ianswer.pro//reset-password").
// - En producción nunca devuelve localhost.
//
// No se usa el Host/Origin del request a propósito: en un flujo de recuperación
// de contraseña eso permite que alguien fuerce un enlace a otro dominio (host
// header injection).
// ============================================================================

const PRODUCTION_FALLBACK = 'https://ianswer.pro'
const DEV_FALLBACK = 'http://localhost:3000'

export function getAppBaseUrl(): string {
  const isProduction = process.env.VERCEL_ENV === 'production'
  const candidates = [
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]

  for (const raw of candidates) {
    const url = raw?.trim().replace(/\/+$/, '')
    if (!url || !/^https?:\/\//.test(url)) continue
    if (isProduction && /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url)) continue
    return url
  }

  return isProduction ? PRODUCTION_FALLBACK : DEV_FALLBACK
}
