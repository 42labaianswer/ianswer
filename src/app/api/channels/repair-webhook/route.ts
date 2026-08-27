 

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

// ============================================================================
// src/app/api/channels/repair-webhook/route.ts
// ----------------------------------------------------------------------------
// Re-suscribe la página de Facebook a nuestra app con los campos correctos.
//
// La causa #1 de "conecté Facebook/Instagram pero no llegan los mensajes" es
// que la página quedó suscrita SIN el campo `messages`. Meta acepta la
// suscripción igual, pero nunca entrega los mensajes entrantes.
//
// Este endpoint hace el POST a {page_id}/subscribed_apps con los campos que
// necesita el asistente, y devuelve cómo quedó para mostrarlo en el
// diagnóstico. Sirve para Messenger e Instagram (ambos van por la página).
// ============================================================================

const GRAPH = 'https://graph.facebook.com/' + (process.env.META_GRAPH_VERSION || 'v22.0')

// Campos mínimos para que el asistente reciba y pueda responder.
const CAMPOS = [
  'messages',
  'messaging_postbacks',
  'messaging_optins',
  'message_reactions',
  'messaging_referrals',
]

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const canal = String(body?.canal || '')
    if (!['messenger', 'instagram'].includes(canal)) {
      return NextResponse.json(
        { success: false, error: 'Canal no válido. Solo messenger o instagram.' },
        { status: 400 }
      )
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value },
          set() { /* solo lectura */ },
          remove() { /* solo lectura */ }
        }
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles').select('company_id').eq('id', user.id).maybeSingle()

    if (!profile?.company_id) {
      return NextResponse.json({ success: false, error: 'Sin empresa asociada' }, { status: 400 })
    }

    const { data: integracion } = await supabase
      .from('integrations')
      .select('access_token, page_id')
      .eq('company_id', profile.company_id)
      .eq('platform', canal)
      .maybeSingle()

    const token = integracion?.access_token
    const pageId = integracion?.page_id

    if (!token || !pageId) {
      return NextResponse.json(
        { success: false, error: 'Este canal no tiene token o página guardados. Vuelve a conectarlo.' },
        { status: 400 }
      )
    }

    // ── Suscribir la página con los campos correctos ──
    const subUrl = `${GRAPH}/${pageId}/subscribed_apps`
    const subRes = await fetch(subUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscribed_fields: CAMPOS,
        access_token: token
      }),
      cache: 'no-store'
    })
    const subData = await subRes.json()

    if (!subRes.ok || subData?.error) {
      return NextResponse.json({
        success: false,
        error: subData?.error?.message || 'Meta rechazó la suscripción',
        hint: 'Revisa que el token de la página siga vigente y que tu usuario sea admin de la página.'
      }, { status: 400 })
    }

    // ── Confirmar cómo quedó ──
    const checkRes = await fetch(
      `${GRAPH}/${pageId}/subscribed_apps?fields=subscribed_fields&access_token=${encodeURIComponent(token)}`,
      { cache: 'no-store' }
    )
    const checkData = await checkRes.json()
    const apps: any[] = Array.isArray(checkData?.data) ? checkData.data : []
    const campos: string[] = apps.flatMap(a => Array.isArray(a?.subscribed_fields) ? a.subscribed_fields : [])

    return NextResponse.json({
      success: true,
      canal,
      page_id: pageId,
      campos,
      tiene_messages: campos.includes('messages'),
      mensaje: campos.includes('messages')
        ? 'Webhook reparado. La página ya está suscrita al campo "messages".'
        : 'La suscripción se envió, pero Meta no reporta el campo "messages". Revisa los permisos de la app.'
    })
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Error inesperado al reparar el webhook' },
      { status: 500 }
    )
  }
}

