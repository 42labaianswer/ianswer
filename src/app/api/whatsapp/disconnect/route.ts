 

// ============================================================================
// src/app/api/whatsapp/disconnect/route.ts
// ----------------------------------------------------------------------------
// Desconecta el WhatsApp Business de la company actual:
//   1. Dar de baja el número de la Cloud API (salvo en coexistencia), para
//      que el cliente pueda volver a usarlo en la app de WhatsApp Business.
//   2. Desuscribir app del webhook del WABA en Meta
//   3. Limpiar las columnas de companies
//
// Si Meta no deja dar de baja el número, no se borra nada (el token guardado
// es lo único con lo que se puede liberar después) y se responde 409 con
// needsForce. Con { force: true } se desconecta igual.
// ============================================================================

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { deregisterNumber, unsubscribeWebhook } from '../../../../lib/whatsappRelease'

const SUPABASE_URL             = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY         = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(req: Request) {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ success: false, error: 'Servidor mal configurado' }, { status: 500 })
    }

    const cookieStore = await cookies()
    const supabaseAuth = createServerClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        cookies: {
          get: (n: string) => cookieStore.get(n)?.value,
          set: () => {},
          remove: () => {},
        },
      }
    )

    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser()
    if (userErr || !user) {
      return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })
    }

    const { data: profile } = await supabaseAuth
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!(profile as any)?.company_id) {
      return NextResponse.json({ success: false, error: 'Profile sin company_id' }, { status: 400 })
    }
    const companyId: string = (profile as any).company_id

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Leer config actual
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('waba_id, system_user_access_token, business_phone_id, waba_coexistence')
      .eq('id', companyId)
      .single()

    const c = company as {
      waba_id: string | null
      system_user_access_token: string | null
      business_phone_id: string | null
      waba_coexistence: boolean | null
    } | null
    const force = (await req.json().catch(() => ({})))?.force === true
    const connection = {
      phoneNumberId: c?.business_phone_id ?? null,
      wabaId:        c?.waba_id ?? null,
      token:         c?.system_user_access_token ?? null,
      coexistence:   c?.waba_coexistence === true,
    }

    const deregister = await deregisterNumber(connection)
    if (deregister.status === 'error' && !force) {
      return NextResponse.json({
        success:    false,
        needsForce: true,
        error:      `Meta no liberó el número: ${deregister.error}`,
      }, { status: 409 })
    }

    const unsubscribe = await unsubscribeWebhook(connection)
    if (unsubscribe.status === 'error') {
      console.warn('[DisconnectWarning] No se pudo desuscribir webhook:', unsubscribe.error)
    }

    // Limpiar DB
    const payload: any = {
      business_phone_id:        null,
      waba_id:                  null,
      waba_display_phone:       null,
      waba_verified_name:       null,
      waba_quality_rating:      null,
      waba_messaging_tier:      null,
      waba_connected_at:        null,
      waba_last_verified_at:    null,
      meta_business_verified:   false,
      system_user_access_token: null,
      waba_coexistence:           false,
      waba_coexistence_synced_at: null
    }
    const { error: updateErr } = await supabaseAdmin
      .from('companies')
      .update(payload)
      .eq('id', companyId)

    if (updateErr) {
      return NextResponse.json({
        success: false,
        error:   'Error limpiando base de datos',
        details: updateErr.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success:     true,
      message:     'WhatsApp desconectado',
      released:    deregister.status === 'ok',
      coexistence: connection.coexistence,
      warning:     deregister.status === 'error'
        ? `El número sigue registrado en Meta (${deregister.error}). Para usarlo en la app de WhatsApp Business hay que liberarlo desde Meta.`
        : null,
    })

  } catch (err: any) {
    console.error('[DisconnectError]', err)
    return NextResponse.json({
      success: false,
      error:   'Error inesperado',
      details: err?.message
    }, { status: 500 })
  }
}
