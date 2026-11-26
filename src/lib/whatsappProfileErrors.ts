// src/lib/whatsappProfileErrors.ts
// ----------------------------------------------------------------------------
// Traduce los errores de la Graph API al editar el perfil de WhatsApp Business
// a respuestas cortas que el editor pueda mostrar en un toast.
// ----------------------------------------------------------------------------

interface GraphError {
  message?: string
  code?: number
  error_subcode?: number
  fbtrace_id?: string
}

export const META_PERMISSIONS_CODE = 'meta_permissions'

/** Slug del artículo del centro de ayuda que explica cómo dar permisos. */
export const META_PERMISSIONS_HELP_SLUG = 'whatsapp-permisos-perfil'

export function whatsappProfileError(
  data: unknown,
  fallback: string,
  step?: string
): { error: string; code?: string } {
  const err = (data as { error?: GraphError } | null)?.error
  if (!err) return { error: fallback }

  console.error('[whatsapp-profile] Graph API error', { step, ...err })

  // Meta usa el rango 200-299 para "Permissions error": el token puede leer
  // el perfil pero no tiene control total del número/WABA para editarlo.
  if (err.code !== undefined && err.code >= 200 && err.code < 300) {
    return { error: 'Meta no dio permiso para editar el perfil.', code: META_PERMISSIONS_CODE }
  }
  return { error: err.message || fallback }
}
