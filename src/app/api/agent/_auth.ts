 

// ============================================================================
// src/app/api/agent/_auth.ts
// ----------------------------------------------------------------------------
// Autenticación de las rutas que consume el agente de IA desde n8n.
//
// Estas rutas NO las llama un usuario con sesión: las llama el workflow. Por
// eso no sirve la cookie de Supabase y hace falta un secreto compartido.
//
// Se acepta `AGENT_API_SECRET` y, si no está definido, `CRON_SECRET`, que ya
// existe y también es server-only. Así funciona sin configurar nada nuevo, y
// puede separarse después sin tocar código.
// ============================================================================

import { NextResponse } from 'next/server'

export function agentSecret(): string | null {
  return process.env.AGENT_API_SECRET || process.env.CRON_SECRET || null
}

/**
 * Devuelve `null` si la petición está autorizada, o la respuesta de error.
 * Acepta el secreto en `Authorization: Bearer …` o en `x-agent-secret`.
 */
export function checkAgentAuth(req: Request): NextResponse | null {
  const esperado = agentSecret()

  // Sin secreto configurado, se rechaza todo: es preferible que las
  // herramientas del agente fallen a exponer el catálogo sin control.
  if (!esperado) {
    return NextResponse.json(
      { error: 'AGENT_API_SECRET no configurado en el servidor' },
      { status: 503 }
    )
  }

  const header = req.headers.get('authorization') || ''
  const bearer = header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : null
  const alterno = req.headers.get('x-agent-secret')

  if (bearer !== esperado && alterno !== esperado) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  return null
}

