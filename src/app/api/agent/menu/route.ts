 

// ============================================================================
// src/app/api/agent/menu/route.ts
// ----------------------------------------------------------------------------
// Herramienta `buscar_platillo` del agente de restaurante.
//
// Antes apuntaba a un campo `n8n_webhook_url_menu` de la tabla `companies` que
// nunca existió, así que la herramienta no devolvía nada. Ahora consulta el
// menú directamente.
//
// Contrato de entrada (el mismo que ya enviaba la herramienta):
//   { companyId, query, action? }
// ============================================================================

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAgentAuth } from '../_auth'
import { checkRateLimit, clientKey, rateLimitHeaders, RATE_LIMITS } from '../../../../lib/rateLimit'
import { isUuid, sanitizeSearchTerm } from '../../../../lib/agentCatalog'

export const dynamic = 'force-dynamic'

const LIMITE = 10

export async function POST(req: Request) {
  const noAutorizado = checkAgentAuth(req)
  if (noAutorizado) return noAutorizado

  // Aunque la ruta exige secreto, el límite acota el daño si se filtrara.
  const rl = await checkRateLimit('agent-catalog', clientKey(req))
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas consultas seguidas', success: false },
      { status: 429, headers: rateLimitHeaders(rl, RATE_LIMITS['agent-catalog']) }
    )
  }

  try {
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

    const companyId = body.companyId
    if (!isUuid(companyId)) {
      return NextResponse.json({ error: 'companyId inválido' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const termino = sanitizeSearchTerm(body.query)

    let q = supabase
      .from('menu_items')
      .select('id, name, description, price, category_id, is_available')
      .eq('company_id', companyId)
      .eq('is_available', true)
      .order('display_order', { ascending: true })
      .limit(LIMITE)

    // Sin término de búsqueda devolvemos el menú destacado: el cliente que
    // pregunta "¿qué tienen?" espera opciones, no una lista vacía.
    if (termino) {
      q = q.or(`name.ilike.%${termino}%,description.ilike.%${termino}%`)
    }

    const { data, error } = await q
    if (error) {
      return NextResponse.json({ error: 'Error al consultar el menú' }, { status: 500 })
    }

    const platillos = (data || []).map((p: any) => ({
      id: p.id,
      nombre: p.name,
      descripcion: p.description || null,
      precio: p.price,
    }))

    return NextResponse.json({
      success: true,
      total: platillos.length,
      busqueda: termino || null,
      platillos,
      // Mensaje listo para que el agente lo use tal cual si no encuentra nada.
      mensaje: platillos.length === 0
        ? (termino
            ? `No encontré nada que coincida con "${termino}" en el menú.`
            : 'El menú aún no tiene platillos disponibles.')
        : null,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error inesperado', details: err?.message },
      { status: 500 }
    )
  }
}

