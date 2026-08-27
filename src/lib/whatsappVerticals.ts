 

// ============================================================================
// src/lib/whatsappVerticals.ts
// ----------------------------------------------------------------------------
// Categorías de negocio válidas para el perfil de WhatsApp Business.
//
// Lista oficial de Meta (Graph API, campo `vertical` del business profile).
// El selector del editor ofrecía además una opción inventada, `UNDEFINED`,
// que Meta rechaza con:
//
//   (#100) Param vertical must be one of {OTHER, AUTO, BEAUTY, …} - got "UNDEFINED"
//
// La forma correcta de decir «sin categoría» en Meta es `OTHER`.
//
// Esta lista es la fuente única: la usan tanto el selector como la ruta de
// API, para que un valor inválido no pueda llegar a Meta ni siquiera si la
// petición se arma a mano.
// ============================================================================

export const WHATSAPP_VERTICALS = [
  'OTHER',
  'AUTO',
  'BEAUTY',
  'APPAREL',
  'EDU',
  'ENTERTAIN',
  'EVENT_PLAN',
  'FINANCE',
  'GROCERY',
  'GOVT',
  'HOTEL',
  'HEALTH',
  'NONPROFIT',
  'PROF_SERVICES',
  'RETAIL',
  'TRAVEL',
  'RESTAURANT',
  'ALCOHOL',
  'ONLINE_GAMBLING',
  'PHYSICAL_GAMBLING',
  'OTC_DRUGS',
  'MATRIMONY_SERVICE',
] as const

export type WhatsAppVertical = (typeof WHATSAPP_VERTICALS)[number]

/** Valor con el que Meta representa «sin categoría específica». */
export const DEFAULT_VERTICAL: WhatsAppVertical = 'OTHER'

/**
 * Devuelve una categoría válida para Meta, o `null` si el valor no sirve.
 *
 * Devolver `null` —en lugar de forzar un valor por defecto— permite a quien
 * llama decidir si omite el campo. Mandar `OTHER` sin que el usuario lo haya
 * elegido cambiaría su categoría sin avisarle.
 */
export function normalizeVertical(value: unknown): WhatsAppVertical | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toUpperCase()
  if (!v) return null
  // 'UNDEFINED' venía del selector viejo: se ignora, no se traduce.
  if (v === 'UNDEFINED' || v === 'NULL') return null
  return (WHATSAPP_VERTICALS as readonly string[]).includes(v)
    ? (v as WhatsAppVertical)
    : null
}

/** Etiquetas en español para el selector. */
export const VERTICAL_LABELS: Record<WhatsAppVertical, string> = {
  OTHER: 'Otro',
  AUTO: 'Automotriz',
  BEAUTY: 'Belleza y spa',
  APPAREL: 'Ropa y moda',
  EDU: 'Educación',
  ENTERTAIN: 'Entretenimiento',
  EVENT_PLAN: 'Organización de eventos',
  FINANCE: 'Finanzas y banca',
  GROCERY: 'Abarrotes y supermercado',
  GOVT: 'Gobierno',
  HOTEL: 'Hotel y hospedaje',
  HEALTH: 'Salud',
  NONPROFIT: 'Organización sin fines de lucro',
  PROF_SERVICES: 'Servicios profesionales',
  RETAIL: 'Comercio y tienda',
  TRAVEL: 'Viajes y turismo',
  RESTAURANT: 'Restaurante',
  ALCOHOL: 'Bebidas alcohólicas',
  ONLINE_GAMBLING: 'Apuestas en línea',
  PHYSICAL_GAMBLING: 'Casinos y apuestas',
  OTC_DRUGS: 'Medicamentos de venta libre',
  MATRIMONY_SERVICE: 'Servicios matrimoniales',
}

/** Opciones listas para un `<select>`, ordenadas alfabéticamente por etiqueta. */
export const VERTICAL_OPTIONS = WHATSAPP_VERTICALS
  .map(value => ({ value, label: VERTICAL_LABELS[value] }))
  .sort((a, b) => a.label.localeCompare(b.label, 'es'))

