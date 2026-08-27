 

// ============================================================================
// src/app/api/agent/orders/route.ts
// ----------------------------------------------------------------------------
// Herramientas `crear_orden_restaurante` y `consultar_estado_orden`.
// Antes apuntaban a un campo `n8n_webhook_url_orders` que nunca existió.
//
// Contrato de entrada (el mismo que ya enviaban las herramientas):
//   crear:     { companyId, action: 'crear_orden', customer_name, customer_phone,
//                items: [{name, qty, price, notes?}], delivery_type, delivery_address?, notes? }
//   consultar: { companyId, action: 'consultar_estado', customer_phone }
// ============================================================================

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAgentAuth } from '../_auth'
import { checkRateLimit, clientKey, rateLimitHeaders, RATE_LIMITS } from '../../../../lib/rateLimit'
import {
  isUuid,
  sanitizeSearchTerm,
  normalizeOrderItems,
  calculateOrderTotal,
  normalizeDeliveryType,
  buildOrderNumber,
} from '../../../../lib/agentCatalog'

export const dynamic = 'force-dynamic'

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
    const accion = String(body.action || '').toLowerCase()
    const telefono = sanitizeSearchTerm(body.customer_phone, 20).replace(/\D/g, '')

    // ── Consultar el estado de la última orden ──────────────────────────────
    if (accion === 'consultar_estado' || accion === 'consultar') {
      if (!telefono) {
        return NextResponse.json({ error: 'Falta customer_phone' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('orders')
        .select('order_number, status_label, status_semantic, delivery_type, total, tracking_token, public_token, estimated_ready_at, created_at')
        .eq('company_id', companyId)
        .eq('contact_phone', telefono)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        return NextResponse.json({ error: 'Error al consultar la orden' }, { status: 500 })
      }
      if (!data) {
        return NextResponse.json({
          success: true,
          encontrada: false,
          mensaje: 'No encontré ninguna orden reciente con ese número.',
        })
      }

      const token = data.tracking_token || data.public_token
      return NextResponse.json({
        success: true,
        encontrada: true,
        orden: {
          numero: data.order_number,
          estado: data.status_label || data.status_semantic,
          entrega: data.delivery_type,
          total: data.total,
          lista_estimada: data.estimated_ready_at,
          url_seguimiento: token ? `${baseUrl}/tracking/${token}` : null,
        },
      })
    }

    // ── Crear una orden ─────────────────────────────────────────────────────
    if (accion === 'crear_orden' || accion === 'crear') {
      const items = normalizeOrderItems(body.items)
      if (items.length === 0) {
        return NextResponse.json(
          { error: 'La orden no tiene items válidos', success: false },
          { status: 400 }
        )
      }

      const nombre = sanitizeSearchTerm(body.customer_name, 120) || 'Cliente'
      const tipoEntrega = normalizeDeliveryType(body.delivery_type)
      const direccion = sanitizeSearchTerm(body.delivery_address, 300)

      // Una entrega a domicilio sin dirección no se puede cumplir: es mejor
      // decirlo ahora que dejar al restaurante con una orden imposible.
      if (tipoEntrega === 'delivery' && !direccion) {
        return NextResponse.json({
          success: false,
          error: 'falta_direccion',
          mensaje: 'Para entrega a domicilio necesito la dirección completa.',
        }, { status: 400 })
      }

      const ahora = new Date()
      const fila: Record<string, unknown> = {
        company_id: companyId,
        order_number: buildOrderNumber(ahora, ahora.getTime()),
        contact_name: nombre,
        contact_phone: telefono || null,
        items,
        total: calculateOrderTotal(items),
        delivery_type: tipoEntrega,
        delivery_address: direccion || null,
        notes: sanitizeSearchTerm(body.notes, 300) || null,
      }

      const { data, error } = await supabase
        .from('orders')
        .insert([fila])
        .select('id, order_number, total, tracking_token, public_token')
        .single()

      if (error || !data) {
        return NextResponse.json({
          success: false,
          error: 'No se pudo registrar la orden',
          details: error?.message,
        }, { status: 500 })
      }

      const token = data.tracking_token || data.public_token
      return NextResponse.json({
        success: true,
        orden: {
          id: data.id,
          numero: data.order_number,
          total: data.total,
          items: items.length,
          url_seguimiento: token ? `${baseUrl}/tracking/${token}` : null,
        },
      })
    }

    return NextResponse.json({ error: `Acción no reconocida: ${accion}` }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error inesperado', details: err?.message },
      { status: 500 }
    )
  }
}

