 

// ============================================================================
// src/app/api/agent/properties/route.ts
// ----------------------------------------------------------------------------
// Herramientas `buscar_propiedad` y `detalle_propiedad` del agente
// inmobiliario. Antes apuntaban a un campo `n8n_webhook_url_propiedades` que
// nunca existió en `companies`.
//
// Contrato de entrada (el mismo que ya enviaban las herramientas):
//   { companyId, action: 'buscar' | 'detalle', ...filtros | propertyId }
// ============================================================================

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAgentAuth } from '../_auth'
import { checkRateLimit, clientKey, rateLimitHeaders, RATE_LIMITS } from '../../../../lib/rateLimit'
import { isUuid, buildPropertyQuery } from '../../../../lib/agentCatalog'

export const dynamic = 'force-dynamic'

const LIMITE = 5
const CAMPOS = 'id, title, public_slug, operation_type, property_type, price, currency, zone, city, bedrooms, bathrooms, parking_spots, sqm_construction, status, photos, description, amenities'

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

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || ''

    const accion = String(body.action || 'buscar').toLowerCase()

    // ── Detalle de una propiedad ────────────────────────────────────────────
    if (accion === 'detalle') {
      const id = body.propertyId
      if (!id) {
        return NextResponse.json({ error: 'Falta propertyId' }, { status: 400 })
      }

      // Acepta el uuid o el slug público: el agente a veces tiene uno u otro.
      const columna = isUuid(id) ? 'id' : 'public_slug'
      const { data, error } = await supabase
        .from('properties')
        .select(CAMPOS)
        .eq('company_id', companyId)
        .eq(columna, id)
        .maybeSingle()

      if (error) {
        return NextResponse.json({ error: 'Error al consultar la propiedad' }, { status: 500 })
      }
      if (!data) {
        return NextResponse.json({
          success: true,
          encontrada: false,
          mensaje: 'No encontré esa propiedad en el catálogo.',
        })
      }

      return NextResponse.json({
        success: true,
        encontrada: true,
        propiedad: formatear(data, baseUrl, true),
      })
    }

    // ── Búsqueda con filtros ────────────────────────────────────────────────
    const f = buildPropertyQuery({
      operationType: body.operation_type,
      propertyType: body.property_type,
      zone: body.zone,
      city: body.city,
      bedrooms: body.bedrooms,
      minPrice: body.min_price,
      maxPrice: body.max_price,
    })

    let q = supabase
      .from('properties')
      .select(CAMPOS)
      .eq('company_id', companyId)
      .eq('status', 'disponible')
      .order('created_at', { ascending: false })
      .limit(LIMITE)

    if (f.operation_type) q = q.eq('operation_type', f.operation_type)
    if (f.property_type) q = q.eq('property_type', f.property_type)
    if (f.zone) q = q.ilike('zone', `%${f.zone}%`)
    if (f.city) q = q.ilike('city', `%${f.city}%`)
    // Las recámaras se piden como mínimo: quien busca 2 acepta 3.
    if (f.bedrooms !== null) q = q.gte('bedrooms', f.bedrooms)
    if (f.minPrice !== null) q = q.gte('price', f.minPrice)
    if (f.maxPrice !== null) q = q.lte('price', f.maxPrice)

    const { data, error } = await q
    if (error) {
      return NextResponse.json({ error: 'Error al buscar propiedades' }, { status: 500 })
    }

    const propiedades = (data || []).map((p: any) => formatear(p, baseUrl, false))

    return NextResponse.json({
      success: true,
      total: propiedades.length,
      filtros: f,
      propiedades,
      mensaje: propiedades.length === 0
        ? 'No encontré propiedades disponibles con esos criterios. Puedo buscar con otros filtros.'
        : null,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error inesperado', details: err?.message },
      { status: 500 }
    )
  }
}

function formatear(p: any, baseUrl: string, completo: boolean) {
  const fotos = Array.isArray(p.photos) ? p.photos : []
  const base = {
    id: p.id,
    titulo: p.title,
    operacion: p.operation_type,
    tipo: p.property_type,
    precio: p.price,
    moneda: p.currency || 'MXN',
    zona: p.zone || null,
    ciudad: p.city || null,
    recamaras: p.bedrooms ?? null,
    banos: p.bathrooms ?? null,
    estacionamientos: p.parking_spots ?? null,
    m2_construccion: p.sqm_construction ?? null,
    foto: fotos[0] || null,
    url: p.public_slug ? `${baseUrl}/propiedad/${p.public_slug}` : null,
  }
  if (!completo) return base
  return {
    ...base,
    descripcion: p.description || null,
    amenidades: p.amenities || null,
    fotos,
  }
}

