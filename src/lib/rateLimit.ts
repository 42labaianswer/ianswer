 

// ============================================================================
// src/lib/rateLimit.ts
// ----------------------------------------------------------------------------
// Límite de tasa para las rutas de API.
//
// El contador vive en Postgres (`check_rate_limit`), no en memoria: la
// aplicación corre en funciones serverless y cada petición puede caer en una
// instancia distinta, así que un contador local no vería nada.
//
// Criterio de diseño: **ante la duda, dejar pasar.** Si la base no responde,
// la petición se permite. Un límite de tasa es una protección, no un control
// de acceso; caerse el limitador no puede tumbar el producto.
// ============================================================================

// El cliente de Supabase se carga solo cuando de verdad hay que consultar el
// contador. Así las funciones puras de este archivo (clientKey, buildBucket,
// cabeceras) no arrastran la dependencia y se pueden probar aisladas.

export interface RateLimitRule {
  /** Peticiones permitidas dentro de la ventana. */
  limit: number
  /** Tamaño de la ventana, en segundos. */
  windowSeconds: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date | null
  /** true si no se pudo consultar el contador y se dejó pasar por precaución. */
  degraded?: boolean
}

/** Reglas por ruta. Las públicas que cuestan dinero son las más estrictas. */
export const RATE_LIMITS: Record<string, RateLimitRule> = {
  // Cada llamada consume una inferencia de IA.
  'help-chat': { limit: 20, windowSeconds: 300 },
  // Cada llamada envía un correo.
  'forgot-password': { limit: 5, windowSeconds: 900 },
  // Formulario público.
  'data-deletion': { limit: 5, windowSeconds: 3600 },
  // Herramientas del agente: alto volumen legítimo, tope amplio.
  'agent-catalog': { limit: 120, windowSeconds: 60 },
  // Simulador y entrenador: consumen IA, pero requieren sesión y addon.
  'agent-ai': { limit: 30, windowSeconds: 300 },
}

/**
 * Identifica a quien llama. Se prefiere la IP que reporta el proxy; si no hay
 * ninguna, se agrupa todo bajo `anon`, que es deliberadamente conservador:
 * mejor limitar de más a un grupo que dejar la puerta abierta.
 */
export function clientKey(req: Request): string {
  const h = req.headers
  const candidatos = [
    h.get('x-real-ip'),
    h.get('cf-connecting-ip'),
    (h.get('x-forwarded-for') || '').split(',')[0],
  ]
  for (const c of candidatos) {
    const v = (c || '').trim()
    if (v) return v
  }
  return 'anon'
}

/** Arma la clave del contador. Se acota para no crecer sin control. */
export function buildBucket(scope: string, identifier: string): string {
  const id = String(identifier || 'anon').trim().slice(0, 100) || 'anon'
  return `${scope}:${id}`
}

/**
 * Comprueba y consume una unidad del límite.
 * Devuelve `allowed: true` si la petición puede continuar.
 */
export async function checkRateLimit(
  scope: string,
  identifier: string,
  rule?: RateLimitRule
): Promise<RateLimitResult> {
  const regla = rule || RATE_LIMITS[scope]
  if (!regla) return { allowed: true, remaining: Infinity, resetAt: null }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return { allowed: true, remaining: 0, resetAt: null, degraded: true }
  }

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(url, key)
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_bucket: buildBucket(scope, identifier),
      p_limit: regla.limit,
      p_window_seconds: regla.windowSeconds,
    })

    if (error) return { allowed: true, remaining: 0, resetAt: null, degraded: true }

    const fila = Array.isArray(data) ? data[0] : data
    if (!fila) return { allowed: true, remaining: 0, resetAt: null, degraded: true }

    return {
      allowed: fila.allowed !== false,
      remaining: Number(fila.remaining ?? 0),
      resetAt: fila.reset_at ? new Date(fila.reset_at) : null,
    }
  } catch {
    // La base no respondió: se deja pasar. Ver nota de diseño arriba.
    return { allowed: true, remaining: 0, resetAt: null, degraded: true }
  }
}

/** Cabeceras estándar para que el cliente sepa cuánto le queda. */
export function rateLimitHeaders(r: RateLimitResult, rule?: RateLimitRule): Record<string, string> {
  const h: Record<string, string> = {}
  if (rule) h['X-RateLimit-Limit'] = String(rule.limit)
  if (Number.isFinite(r.remaining)) h['X-RateLimit-Remaining'] = String(r.remaining)
  if (r.resetAt) {
    h['X-RateLimit-Reset'] = String(Math.floor(r.resetAt.getTime() / 1000))
    if (!r.allowed) {
      const seg = Math.max(1, Math.ceil((r.resetAt.getTime() - Date.now()) / 1000))
      h['Retry-After'] = String(seg)
    }
  }
  return h
}

/** Segundos que faltan para que se libere el límite. Para el mensaje al usuario. */
export function secondsUntilReset(r: RateLimitResult, now: Date = new Date()): number {
  if (!r.resetAt) return 0
  return Math.max(0, Math.ceil((r.resetAt.getTime() - now.getTime()) / 1000))
}

