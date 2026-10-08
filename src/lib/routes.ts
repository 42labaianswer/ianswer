// ============================================================================
// src/lib/routes.ts
// ----------------------------------------------------------------------------
// Rutas internas del dashboard que se enlazan desde varios lugares. Usar estas
// constantes en vez de escribir la URL a mano, para que mover una sección no
// deje enlaces rotos regados por el código.
//
// Equipo vive fuera de /crm a propósito (/crm se va a ocultar más adelante).
// ============================================================================

export const ROUTES = {
  team: '/dashboard/team',
} as const
