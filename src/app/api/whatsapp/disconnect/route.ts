 

// ============================================================================
// src/app/api/whatsapp/disconnect/route.ts
// ----------------------------------------------------------------------------
// Desconecta el WhatsApp Business de la company actual:
//   1. Desuscribir app del webhook del WABA en Meta
//   2. Limpiar las columnas de companies
// ============================================================================

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const META_GRAPH_VERSION        = process.env.META_GRAPH_VERSION || 'v22.0'
const SUPABASE_URL              = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY         = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(_req: Request) {
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
      .select('waba_id, system_user_access_token, business_phone_id')
      .eq('id', companyId)
      .single()

    const c = company as any

    // Desuscribir webhook (best-effort)
    if (c?.waba_id && c?.system_user_access_token) {
      try {
        const unsubUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${c.waba_id}/subscribed_apps`
        await fetch(unsubUrl, {
          method:  'DELETE',
          headers: { Authorization: `Bearer ${c.system_user_access_token}` }
        })
      } catch (e) {
        console.warn('[DisconnectWarning] No se pudo desuscribir webhook:', e)
      }
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
      system_user_access_token: null
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

    return NextResponse.json({ success: true, message: 'WhatsApp desconectado' })

  } catch (err: any) {
    console.error('[DisconnectError]', err)
    return NextResponse.json({
      success: false,
      error:   'Error inesperado',
      details: err?.message
    }, { status: 500 })
  }
}
