 

// ============================================================================
// src/app/api/data-deletion/request/route.ts
// ----------------------------------------------------------------------------
// Endpoint público para recibir solicitudes de borrado del formulario web.
// No requiere autenticación.
// ============================================================================

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, clientKey, rateLimitHeaders, RATE_LIMITS } from '../../../../lib/rateLimit'

const SUPABASE_URL              = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  })
}

export async function POST(req: Request) {
  try {
  // Límite de tasa: esta ruta es pública y cada llamada registra una solicitud.
  const rl = await checkRateLimit('data-deletion', clientKey(req))
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Inténtalo más tarde.' },
      { status: 429, headers: rateLimitHeaders(rl, RATE_LIMITS['data-deletion']) }
    )
  }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { success: false, error: 'Servidor mal configurado' },
        { status: 500 }
      )
    }

    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 })
    }

    const email:  string | null = body.email?.trim?.() || null
    const phone:  string | null = body.phone?.trim?.() || null
    const reason: string | null = body.reason?.trim?.() || null
    const scope:  string        = body.scope === 'messages_only' ? 'messages_only' : 'full'

    if (!email && !phone) {
      return NextResponse.json(
        { success: false, error: 'Se requiere email o teléfono' },
        { status: 400 }
      )
    }

    // Validar email básico
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Email inválido' },
        { status: 400 }
      )
    }

    // Normalizar teléfono (solo dígitos)
    const normalizedPhone = phone ? phone.replace(/\D/g, '') : null
    if (normalizedPhone && normalizedPhone.length < 10) {
      return NextResponse.json(
        { success: false, error: 'Teléfono debe tener al menos 10 dígitos' },
        { status: 400 }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: result, error } = await (supabase.rpc as any)('register_data_deletion_request', {
      p_requester_email: email,
      p_requester_phone: normalizedPhone,
      p_reason:          reason,
      p_scope:           scope,
      p_source:          'web_form'
    })

    if (error) {
      console.error('[DataDeletionRPCError]', error)
      return NextResponse.json(
        { success: false, error: 'Error registrando la solicitud', details: error.message },
        { status: 500 }
      )
    }

    if (!result?.success) {
      return NextResponse.json(
        { success: false, error: result?.error || 'Error desconocido' },
        { status: 400 }
      )
    }

    //       (requiere configurar email transactional — out-of-scope de este sprint)

    return NextResponse.json({
      success:           true,
      request_id:        result.request_id,
      confirmation_code: result.confirmation_code,
      message:           result.message
    })

  } catch (err: any) {
    console.error('[DataDeletionRequestError]', err)
    return NextResponse.json(
      { success: false, error: 'Error inesperado', details: err?.message },
      { status: 500 }
    )
  }
}
