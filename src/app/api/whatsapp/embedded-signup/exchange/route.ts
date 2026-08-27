 

// ============================================================================
// src/app/api/whatsapp/embedded-signup/exchange/route.ts
// ----------------------------------------------------------------------------
// Endpoint que el frontend llama después del FB.login callback de Embedded Signup.
//
// Pasos:
//   1. Validar input (code, phone_number_id, waba_id)
//   2. Obtener el companyId del usuario autenticado (cookie de Supabase SSR)
//   3. Intercambiar `code` por Business Integration Token (long-lived)
//   4. Obtener info del WABA: display_phone, verified_name, quality, tier
//   5. Suscribir nuestra app al webhook
//   6. Guardar todo en companies (vía service role para saltar RLS write)
//   7. Devolver success al frontend
// ============================================================================

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const META_APP_ID                = process.env.NEXT_PUBLIC_META_APP_ID
const META_APP_SECRET            = process.env.META_APP_SECRET
const META_GRAPH_VERSION         = process.env.META_GRAPH_VERSION || 'v22.0'
const SUPABASE_URL               = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY          = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function OPTIONS() {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  })
}

export async function POST(req: Request) {
  try {
    // ── 1. Validar configuración del servidor ──
    if (!META_APP_ID || !META_APP_SECRET) {
      return NextResponse.json(
        { success: false, error: 'Servidor mal configurado: faltan credenciales de Meta' },
        { status: 500 }
      )
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { success: false, error: 'Servidor mal configurado: faltan credenciales de Supabase' },
        { status: 500 }
      )
    }

    // ── 2. Validar input ──
    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 })
    }
    const { code, phone_number_id, waba_id } = body
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ success: false, error: 'Falta el campo "code"' }, { status: 400 })
    }
    if (!phone_number_id || typeof phone_number_id !== 'string') {
      return NextResponse.json({ success: false, error: 'Falta phone_number_id' }, { status: 400 })
    }
    if (!waba_id || typeof waba_id !== 'string') {
      return NextResponse.json({ success: false, error: 'Falta waba_id' }, { status: 400 })
    }

    // ── 3. Auth: obtener user vía cookies SSR ──
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

    // Cliente con service role para escribir en companies sin RLS friction
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // ── 4. Intercambiar code → Business Integration Token (long-lived) ──
    const exchangeUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`)
    exchangeUrl.searchParams.set('client_id',     META_APP_ID)
    exchangeUrl.searchParams.set('client_secret', META_APP_SECRET)
    exchangeUrl.searchParams.set('code',          code)

    const exchangeRes = await fetch(exchangeUrl.toString(), { method: 'GET' })
    const exchangeData = await exchangeRes.json()

    if (!exchangeRes.ok || !exchangeData.access_token) {
      console.error('[ExchangeError]', exchangeData)
      return NextResponse.json({
        success: false,
        error:   'Error al intercambiar código con Meta',
        details: exchangeData?.error?.message || 'desconocido'
      }, { status: 502 })
    }

    const businessIntegrationToken: string = exchangeData.access_token

    // ── 5. Consultar info del número en Meta ──
    const phoneInfoUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status`
    const phoneInfoRes = await fetch(phoneInfoUrl, {
      headers: { Authorization: `Bearer ${businessIntegrationToken}` }
    })
    const phoneInfo = await phoneInfoRes.json()

    if (!phoneInfoRes.ok) {
      console.error('[PhoneInfoError]', phoneInfo)
      return NextResponse.json({
        success: false,
        error:   'Error al consultar el número en Meta',
        details: phoneInfo?.error?.message
      }, { status: 502 })
    }

    const displayPhone:  string | null = phoneInfo.display_phone_number || null
    const verifiedName:  string | null = phoneInfo.verified_name || null
    const qualityRating: string        = phoneInfo.quality_rating || 'UNKNOWN'
    const messagingTier: string        = mapMessagingLimitTier(phoneInfo.messaging_limit_tier)

    // ── 6. Suscribir nuestra app al webhook del WABA ──
    const subscribeUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${waba_id}/subscribed_apps`
    const subscribeRes = await fetch(subscribeUrl, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${businessIntegrationToken}`,
        'Content-Type': 'application/json'
      }
    })
    const subscribeData = await subscribeRes.json()

    if (!subscribeRes.ok || subscribeData.success !== true) {
      console.error('[SubscribeError]', subscribeData)
      // No abortar: el cliente puede suscribir manualmente luego
    }

    // ── 6b. REGISTRAR el número en Cloud API ──
    // Paso obligatorio y fácil de olvidar: tras el Embedded Signup, el número
    // queda asociado al WABA pero en estado "No registrado" y NO puede enviar
    // ni recibir hasta que se llama a /register con un PIN de verificación en
    // dos pasos. Si ya estaba registrado, Meta responde error y lo ignoramos.
    const registerPin = process.env.META_WA_REGISTER_PIN || '000000'
    let numeroRegistrado = false
    let registroError: string | null = null

    try {
      const regRes = await fetch(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${phone_number_id}/register`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${businessIntegrationToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ messaging_product: 'whatsapp', pin: registerPin })
        }
      )
      const regData = await regRes.json()
      if (regRes.ok && regData?.success !== false) {
        numeroRegistrado = true
      } else {
        const msg: string = regData?.error?.message || ''
        // Si ya estaba registrado, lo damos por bueno.
        if (/already registered/i.test(msg)) numeroRegistrado = true
        else registroError = msg || 'Meta rechazó el registro del número'
      }
    } catch (e: any) {
      registroError = e?.message || 'Error de red al registrar el número'
    }

    // ── 7. Guardar todo en companies (via service role) ──
    const nowIso = new Date().toISOString()
    const payload: any = {
      business_phone_id:        phone_number_id,
      waba_id:                  waba_id,
      waba_display_phone:       displayPhone,
      waba_verified_name:       verifiedName,
      waba_quality_rating:      qualityRating,
      waba_messaging_tier:      messagingTier,
      waba_connected_at:        nowIso,
      waba_last_verified_at:    nowIso,
      meta_business_verified:   false,
      system_user_access_token: businessIntegrationToken
    }
    const { error: updateErr } = await supabaseAdmin
      .from('companies')
      .update(payload)
      .eq('id', companyId)

    if (updateErr) {
      console.error('[DBUpdateError]', updateErr)
      return NextResponse.json({
        success: false,
        error:   'Error guardando configuración en base de datos',
        details: updateErr.message
      }, { status: 500 })
    }

    // ── 8. Registrar quality event histórico inicial ──
    try {
      await (supabaseAdmin.rpc as any)('register_quality_event', {
        p_business_phone_id:  phone_number_id,
        p_event_type:         'phone_number_status',
        p_new_quality_rating: qualityRating,
        p_new_messaging_tier: messagingTier,
        p_metadata:           { source: 'embedded_signup', display_phone: displayPhone, verified_name: verifiedName },
        p_raw_webhook:        null,
        p_meta_event_time:    nowIso
      })
    } catch (rpcErr) {
      // No crítico, solo log
      console.warn('[QualityEventWarn]', rpcErr)
    }

    return NextResponse.json({
      success: true,
      message: 'WhatsApp Business conectado exitosamente',
      data: {
        phone_number_id,
        waba_id,
        display_phone:      displayPhone,
        verified_name:      verifiedName,
        quality_rating:     qualityRating,
        messaging_tier:     messagingTier,
        webhook_subscribed: subscribeData?.success === true,
        // Si esto viene en false, el número aparecerá como "No registrado" en
        // Meta y no podrá enviar ni recibir hasta completar el registro.
        numero_registrado:  numeroRegistrado,
        registro_error:     registroError
      }
    })

  } catch (err: any) {
    console.error('[EmbeddedSignupExchangeError]', err)
    return NextResponse.json({
      success: false,
      error:   'Error inesperado en el servidor',
      details: err?.message || 'desconocido'
    }, { status: 500 })
  }
}

function mapMessagingLimitTier(metaTier?: string): string {
  if (!metaTier) return 'TIER_TEST'
  const map: Record<string, string> = {
    TIER_50:        'TIER_TEST',
    TIER_250:       'TIER_250',
    TIER_1K:        'TIER_1K',
    TIER_10K:       'TIER_10K',
    TIER_100K:      'TIER_100K',
    TIER_UNLIMITED: 'UNLIMITED'
  }
  return map[metaTier] || 'TIER_TEST'
}
