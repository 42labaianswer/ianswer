 

// ============================================================================
// src/lib/agentCatalog.ts
// ----------------------------------------------------------------------------
// Lógica pura de las consultas de catálogo que hace el agente de IA:
// menú de restaurante, órdenes y propiedades inmobiliarias.
//
// Las herramientas del agente (`buscar_platillo`, `crear_orden_restaurante`,
// `consultar_estado_orden`, `buscar_propiedad`, `detalle_propiedad`) llaman a
// las rutas `/api/agent/*`, que se apoyan en estas funciones.
//
// Aquí no hay acceso a red ni a base de datos: solo validación y armado de
// filtros, para que pueda probarse de forma unitaria.
// ============================================================================

export type OperationType = 'venta' | 'renta'
export type DeliveryType = 'pickup' | 'delivery' | 'dine_in'

// ─── Validación de entrada ──────────────────────────────────────────────────

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

/**
 * Limpia un término de búsqueda antes de meterlo en un filtro `ilike`.
 * PostgREST usa `*` como comodín y `,` para separar condiciones: si el texto
 * del usuario los trae, rompe la consulta.
 */
export function sanitizeSearchTerm(value: unknown, maxLength = 60): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[*,()%\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

/** Convierte a número positivo, o `null` si no aplica. */
export function toPositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function normalizeOperationType(value: unknown): OperationType | null {
  const v = String(value ?? '').toLowerCase().trim()
  if (v === 'venta' || v === 'compra' || v === 'comprar') return 'venta'
  if (v === 'renta' || v === 'rentar' || v === 'alquiler') return 'renta'
  return null
}

export function normalizeDeliveryType(value: unknown): DeliveryType {
  const v = String(value ?? '').toLowerCase().trim()
  if (v === 'delivery' || v === 'domicilio' || v === 'entrega') return 'delivery'
  if (v === 'dine_in' || v === 'comer aqui' || v === 'local' || v === 'mesa') return 'dine_in'
  return 'pickup'
}

// ─── Filtros de propiedades ─────────────────────────────────────────────────

export interface PropertyFilters {
  operationType?: unknown
  propertyType?: unknown
  zone?: unknown
  city?: unknown
  bedrooms?: unknown
  maxPrice?: unknown
  minPrice?: unknown
}

export interface PropertyQuery {
  operation_type: OperationType | null
  property_type: string | null
  zone: string
  city: string
  bedrooms: number | null
  minPrice: number | null
  maxPrice: number | null
}

const PROPERTY_TYPES = ['casa', 'departamento', 'terreno', 'oficina', 'local']

export function buildPropertyQuery(filters: PropertyFilters): PropertyQuery {
  const tipo = String(filters.propertyType ?? '').toLowerCase().trim()
  const min = toPositiveNumber(filters.minPrice)
  const max = toPositiveNumber(filters.maxPrice)

  return {
    operation_type: normalizeOperationType(filters.operationType),
    property_type: PROPERTY_TYPES.includes(tipo) ? tipo : null,
    zone: sanitizeSearchTerm(filters.zone),
    city: sanitizeSearchTerm(filters.city),
    bedrooms: toPositiveNumber(filters.bedrooms),
    // Si vienen invertidos, se corrigen en lugar de devolver cero resultados.
    minPrice: min !== null && max !== null ? Math.min(min, max) : min,
    maxPrice: min !== null && max !== null ? Math.max(min, max) : max,
  }
}

// ─── Órdenes ────────────────────────────────────────────────────────────────

export interface OrderItemInput {
  name?: unknown
  qty?: unknown
  price?: unknown
  notes?: unknown
}

export interface OrderItem {
  name: string
  qty: number
  price: number
  notes: string | null
}

/**
 * Normaliza los items que arma el agente. Descarta los que no tienen nombre:
 * una orden con líneas vacías es peor que una orden con menos líneas.
 */
export function normalizeOrderItems(input: unknown): OrderItem[] {
  const lista = Array.isArray(input) ? input : []
  return lista
    .map((raw: OrderItemInput) => {
      const name = sanitizeSearchTerm(raw?.name, 120)
      if (!name) return null
      const qty = toPositiveNumber(raw?.qty)
      const price = toPositiveNumber(raw?.price)
      return {
        name,
        qty: qty && qty > 0 ? Math.floor(qty) : 1,
        price: price ?? 0,
        notes: sanitizeSearchTerm(raw?.notes, 200) || null,
      }
    })
    .filter((x): x is OrderItem => x !== null)
}

export function calculateOrderTotal(items: OrderItem[]): number {
  return Number(items.reduce((sum, i) => sum + i.price * i.qty, 0).toFixed(2))
}

/**
 * Número de orden legible, con la fecha como prefijo.
 * `seed` debe venir de fuera para que la función sea determinista y probable.
 */
export function buildOrderNumber(date: Date, seed: number): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const n = String(Math.abs(Math.floor(seed)) % 10000).padStart(4, '0')
  return `${y}${m}${d}-${n}`
}

