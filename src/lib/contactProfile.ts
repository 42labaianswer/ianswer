 

// ============================================================================
// src/lib/contactProfile.ts
// ----------------------------------------------------------------------------
// Lógica pura del enriquecimiento de contactos de Facebook e Instagram.
//
// Meta no manda el nombre del usuario en el webhook de FB/IG, solo su
// identificador. Estas funciones deciden cuándo vale la pena consultar Graph
// API y cómo interpretar lo que devuelve.
// ============================================================================

/**
 * Nombres que el sistema pone cuando no sabe quién es. Si un contacto tiene
 * uno de estos, todavía no se le ha puesto su nombre real.
 */
const NOMBRES_PROVISIONALES = [
  'cliente',
  'sin nombre',
  'usuario',
  'contacto',
  'anon',
  'anónimo',
  'anonimo',
]

export function esNombreProvisional(nombre: unknown): boolean {
  const n = String(nombre ?? '').trim().toLowerCase()
  if (!n) return true
  if (NOMBRES_PROVISIONALES.includes(n)) return true
  // Un identificador de Meta usado como nombre tampoco es un nombre.
  return /^\d{6,}$/.test(n)
}

/**
 * Un avatar alojado por nosotros es definitivo. Uno de un dominio de Meta
 * caduca, así que se trata como si no existiera: hay que volver a guardarlo.
 */
export function esAvatarPropio(url: unknown): boolean {
  const u = String(url ?? '').trim()
  if (!u) return false
  if (/(fbcdn\.net|cdninstagram\.com|lookaside\.|graph\.facebook\.com)/i.test(u)) return false
  return /^https?:\/\//i.test(u)
}

/** ¿Vale la pena llamar a Graph API por este contacto? */
export function necesitaEnriquecer(nombre: unknown, avatarUrl: unknown): boolean {
  return esNombreProvisional(nombre) || !esAvatarPropio(avatarUrl)
}

export interface PerfilMeta {
  name?: unknown
  username?: unknown
  first_name?: unknown
  last_name?: unknown
}

/**
 * Arma el nombre a mostrar a partir de lo que devuelve Graph API.
 * Messenger entrega `first_name` y `last_name`; Instagram, `name` y
 * `username`. Devuelve `null` si no hay nada aprovechable, para no pisar un
 * nombre existente con una cadena vacía.
 */
export function nombreDesdePerfilMeta(perfil: PerfilMeta | null | undefined): string | null {
  if (!perfil) return null

  const limpio = (v: unknown) => String(v ?? '').trim()

  const completo = limpio(perfil.name)
  if (completo) return completo.slice(0, 120)

  const partes = [limpio(perfil.first_name), limpio(perfil.last_name)].filter(Boolean)
  if (partes.length) return partes.join(' ').slice(0, 120)

  const usuario = limpio(perfil.username)
  if (usuario) return `@${usuario}`.slice(0, 120)

  return null
}

/**
 * Ruta del avatar dentro del bucket. Se agrupa por empresa y canal para que
 * borrar los datos de un cliente sea borrar un prefijo.
 */
export function rutaAvatar(companyId: string, canal: string, externalId: string): string {
  const id = String(externalId).replace(/[^A-Za-z0-9_-]/g, '')
  return `${companyId}/${canal}/${id}.jpg`
}

