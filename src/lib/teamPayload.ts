 

// ============================================================================
// src/lib/teamPayload.ts
// ----------------------------------------------------------------------------
// Normaliza la fila de un miembro del equipo antes de guardarla.
//
// El problema: los campos profesionales son ESPECÍFICOS DE CADA INDUSTRIA
// (ver teamFieldsByTemplate.ts). Una clínica captura "Especialidad"; una
// industria genérica ni siquiera muestra ese campo. Pero algunas de esas
// columnas quedaron NOT NULL en la base, así que al dar de alta a alguien
// desde la plantilla "Otro" el insert reventaba con:
//
//   null value in column "specialty" of relation "team" violates not-null
//
// Solución en dos partes:
//   · Aquí: los campos de texto específicos de industria nunca viajan como
//     null; van como cadena vacía. Funciona con el esquema tal como está.
//   · En la base: sql/2026-08-fix-team-campos-industria.sql quita esos
//     NOT NULL, porque un campo de una vertical no puede ser obligatorio
//     para todas.
// ============================================================================

/**
 * Campos de texto que solo existen en algunas industrias. Si la plantilla
 * activa no los muestra, llegan como `undefined` y hay que mandarlos vacíos.
 */
export const TEAM_VERTICAL_TEXT_FIELDS = [
  'specialty',
  'subspecialty',
  'medical_license',
  'realtor_license',
  'position',
  'shift',
  'studies',
  'portfolio_url',
] as const

/** Campos de lista específicos de industria: su vacío es `[]`, no `''`. */
export const TEAM_VERTICAL_ARRAY_FIELDS = [
  'insurances_accepted',
  'property_specialties',
  'zones_covered',
] as const

export function normalizeTeamPayload<T extends Record<string, any>>(input: T): T {
  const out: Record<string, any> = { ...input }

  for (const key of TEAM_VERTICAL_TEXT_FIELDS) {
    if (out[key] === undefined || out[key] === null) out[key] = ''
  }

  for (const key of TEAM_VERTICAL_ARRAY_FIELDS) {
    if (out[key] === undefined || out[key] === null) out[key] = []
  }

  // `years_experience` es numérico: vacío es null, no 0 — decir "0 años de
  // experiencia" no es lo mismo que no haberlo capturado. Se deja fuera
  // a propósito; si la columna fuera NOT NULL, el SQL lo corrige.

  // Nunca mandes cadenas con solo espacios.
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string') out[k] = v.trim()
  }

  return out as T
}

