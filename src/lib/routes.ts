// ============================================================================
// src/lib/routes.ts
// ----------------------------------------------------------------------------
// Rutas internas del dashboard que se enlazan desde varios lugares. Usar estas
// constantes en vez de escribir la URL a mano, para que mover una sección no
// deje enlaces rotos regados por el código.
//
// Equipo vivía en /dashboard/crm/equipo; se desacopló de /crm (que se va a
// ocultar más adelante) — plan-agente-semana04, 6.2.
// ============================================================================

export const ROUTES = {
  team: '/dashboard/team',
} as const
