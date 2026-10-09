 

// ============================================================================
// src/app/api/meta/connect/exchange/route.ts
// ----------------------------------------------------------------------------
// Endpoint que el frontend llama después del FB.login para Facebook/Instagram.
//
// Flujo:
//   1. Recibe el access_token de usuario (short-lived) del FB.login
//   2. Lo cambia por uno long-lived
//   3. Lista las páginas de Facebook que administra el usuario
//   4. Sin page_id: devuelve las páginas (con su Instagram, si tiene) y el uso
//      de canales, para que el usuario elija qué conectar
//   5. Con page_id: conecta solo los canales pedidos en `channels`
//      ('messenger' y/o 'instagram'; por defecto solo 'messenger'), si caben en
//      el límite de canales del plan
//   6. Suscribe la app a los webhooks de la página
//   7. Guarda en integrations y en companies los canales conectados
// ============================================================================

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getChannelUsage, channelLimitError, isChannelLimitDbError, type Channel } from '../../../../../lib/channelLimits'

const META_APP_ID               = process.env.NEXT_PUBLIC_META_APP_ID
const META_APP_SECRET           = process.env.META_APP_SECRET
const META_GRAPH_VERSION        = process.env.META_GRAPH_VERSION || 'v22.0'
const SUPABASE_URL              = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY         = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

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
    const { access_token, page_id } = body
    if (!access_token || typeof access_token !== 'string') {
      return NextResponse.json({ success: false, error: 'Falta el access_token' }, { status: 400 })
    }
    const pedidos: Channel[] = Array.isArray(body.channels) && body.channels.length
      ? body.channels.filter((c: unknown): c is Channel => c === 'messenger' || c === 'instagram')
      : ['messenger']
    if (!pedidos.length) {
      return NextResponse.json({ success: false, error: 'Canales inválidos' }, { status: 400 })
    }
    const wantMessenger = pedidos.includes('messenger')
    const wantInstagram = pedidos.includes('instagram')

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

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const usage = await getChannelUsage(supabaseAdmin, companyId)

    // ── 4. Cambiar token de usuario short-lived → long-lived ──
    const llUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`)
    llUrl.searchParams.set('grant_type',        'fb_exchange_token')
    llUrl.searchParams.set('client_id',         META_APP_ID)
    llUrl.searchParams.set('client_secret',     META_APP_SECRET)
    llUrl.searchParams.set('fb_exchange_token', access_token)

    const llRes  = await fetch(llUrl.toString())
    const llData = await llRes.json()
    const userToken: string = llData?.access_token || access_token

    // ── 5. Listar páginas que administra el usuario ──
    const pagesUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${userToken}`
    const pagesRes  = await fetch(pagesUrl)
    const pagesData = await pagesRes.json()

    if (!pagesRes.ok || !Array.isArray(pagesData?.data) || pagesData.data.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No encontramos páginas de Facebook que administres. Asegúrate de tener una página y de haber dado los permisos.' },
        { status: 400 }
      )
    }

    // Siempre devolvemos las páginas antes de conectar, aunque solo haya una.
    // Así el usuario ve exactamente qué se va a conectar (y si se detectó
    // Instagram) y lo confirma, en vez de que el sistema decida por él.
    if (!page_id) {
      return NextResponse.json({
        success: false,
        needsPageSelection: true,
        pages: pagesData.data.map((p: any) => ({
          id: p.id,
          name: p.name || 'Página sin nombre',
          has_instagram: !!p.instagram_business_account,
          instagram_username: p.instagram_business_account?.username || null
        })),
        channel_usage: usage
      })
    }

    // Conectar la página que el usuario confirmó
    const page = pagesData.data.find((p: any) => p.id === page_id)

    if (!page) {
      return NextResponse.json(
        { success: false, error: 'No encontramos la página seleccionada entre las que administras.' },
        { status: 400 }
      )
    }

    const pageId: string          = page.id
    const pageName: string        = page.name || ''
    const pageAccessToken: string = page.access_token
    const igAccount               = page.instagram_business_account // { id, username } o undefined

    if (wantInstagram && !igAccount?.id) {
      return NextResponse.json(
        { success: false, error: 'Esa página no tiene una cuenta de Instagram Business vinculada.' },
        { status: 400 }
      )
    }
    const limitError = channelLimitError(usage, pedidos)
    if (limitError) {
      return NextResponse.json({ success: false, error: limitError, code: 'channel_limit' }, { status: 403 })
    }

    // ── 6. Suscribir la app a los webhooks de la página (Messenger + Instagram) ──
    // ⚠️ Si Meta rechaza esta suscripción, la página queda "conectada" pero los
    // mensajes NUNCA llegan. Por eso se verifica el resultado y se devuelve
    // para poder avisarlo en pantalla.
    let webhookSubscribed = false
    let webhookFields: string[] = []
    let webhookError: string | null = null

    try {
      const subUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${pageId}/subscribed_apps`
      const subRes = await fetch(subUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscribed_fields: [
            'messages', 'messaging_postbacks', 'messaging_optins',
            'message_reactions', 'messaging_referrals'
          ],
          access_token: pageAccessToken
        })
      })
      const subData = await subRes.json()
      if (!subRes.ok || subData?.error) {
        webhookError = subData?.error?.message || 'Meta rechazó la suscripción del webhook'
      } else {
        // Confirmar qué campos quedaron realmente suscritos: Meta puede aceptar
        // la llamada y aun así no dejar `messages`, y sin ese campo no llega nada.
        const checkRes = await fetch(
          `https://graph.facebook.com/${META_GRAPH_VERSION}/${pageId}/subscribed_apps?fields=subscribed_fields&access_token=${encodeURIComponent(pageAccessToken)}`,
          { cache: 'no-store' }
        )
        const checkData = await checkRes.json()
        const apps: any[] = Array.isArray(checkData?.data) ? checkData.data : []
        webhookFields = apps.flatMap(a => Array.isArray(a?.subscribed_fields) ? a.subscribed_fields : [])
        webhookSubscribed = webhookFields.includes('messages')
        if (!webhookSubscribed) {
          webhookError = 'La página quedó suscrita pero sin el campo "messages"'
        }
      }
    } catch (e: any) {
      webhookError = e?.message || 'Error de red al suscribir el webhook'
    }

    // ── 7. Guardar los canales pedidos ──
    const nowIso = new Date().toISOString()
    const limitResponse = (message: string) =>
      NextResponse.json({ success: false, error: message, code: 'channel_limit' }, { status: 403 })

    if (wantMessenger) {
      const { error: fbErr } = await supabaseAdmin
        .from('integrations')
        .upsert({
          company_id:   companyId,
          platform:     'messenger',
          access_token: pageAccessToken,
          page_id:      pageId,
          status:       'connected',
          updated_at:   nowIso
        }, { onConflict: 'company_id,platform' })
      if (fbErr) {
        if (isChannelLimitDbError(fbErr)) return limitResponse(fbErr.message)
        return NextResponse.json(
          { success: false, error: 'Error guardando Facebook: ' + fbErr.message },
          { status: 500 }
        )
      }
    }

    if (wantInstagram) {
      const { error: igErr } = await supabaseAdmin
        .from('integrations')
        .upsert({
          company_id:   companyId,
          platform:     'instagram',
          access_token: pageAccessToken, // IG usa el token de la página vinculada
          page_id:      pageId,
          account_id:   igAccount.id,
          status:       'connected',
          updated_at:   nowIso
        }, { onConflict: 'company_id,platform' })
      if (igErr) {
        if (isChannelLimitDbError(igErr)) return limitResponse(igErr.message)
        return NextResponse.json(
          { success: false, error: 'Error guardando Instagram: ' + igErr.message },
          { status: 500 }
        )
      }
    }

    // n8n identifica la empresa por estos ids cuando llega un mensaje. Solo se
    // tocan los del canal que se conectó; el otro canal se queda como estaba.
    const companyUpdate: Record<string, string | null> = {}
    if (wantMessenger) {
      companyUpdate.fb_page_id = pageId
      companyUpdate.fb_page_name = pageName || null
    }
    if (wantInstagram) {
      companyUpdate.ig_account_id = igAccount.id
      companyUpdate.ig_username = igAccount.username || null
    }
    const { error: companyErr } = await supabaseAdmin
      .from('companies')
      .update(companyUpdate)
      .eq('id', companyId)
    if (companyErr) {
      if (isChannelLimitDbError(companyErr)) return limitResponse(companyErr.message)
      return NextResponse.json(
        { success: false, error: 'Error guardando el canal: ' + companyErr.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      facebook:  wantMessenger ? { page_id: pageId, page_name: pageName } : null,
      instagram: wantInstagram ? { account_id: igAccount.id, username: igAccount.username } : null,
      // Estado real del webhook: si esto viene en false, el canal quedará
      // conectado pero NO recibirá mensajes hasta repararlo.
      webhook: {
        subscribed: webhookSubscribed,
        fields: webhookFields,
        error: webhookError
      }
    })

  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'Error inesperado: ' + (err?.message || 'desconocido') },
      { status: 500 }
    )
  }
}
