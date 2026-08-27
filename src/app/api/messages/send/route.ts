 

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

// ============================================================================
// src/app/api/messages/send/route.ts
// ----------------------------------------------------------------------------
// Envía un mensaje escrito por una persona del negocio desde la bandeja de
// Mensajes, por el canal que corresponda al contacto.
//
// Antes esto pasaba por un webhook de n8n que solo sabía enviar por WhatsApp,
// así que responderle a un cliente de Messenger o Instagram no le llegaba.
// Ahora se resuelve aquí: se detecta el canal del contacto y se envía por la
// Graph API correspondiente.
//
// Entrada: { patient_id, content, message_type?, media_url?, media_caption? }
// ============================================================================

const GRAPH = 'https://graph.facebook.com/' + (process.env.META_GRAPH_VERSION || 'v22.0')

type Canal = 'whatsapp' | 'messenger' | 'instagram'

interface Payload {
  patient_id: string
  content: string
  message_type?: 'text' | 'image' | 'audio'
  media_url?: string | null
  media_caption?: string | null
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Payload
    const { patient_id, content } = body
    const tipo = body.message_type || 'text'
    const mediaUrl = body.media_url || null
    const mediaCaption = body.media_caption || null

    if (!patient_id) {
      return NextResponse.json({ success: false, error: 'Falta el destinatario' }, { status: 400 })
    }
    if (tipo === 'text' && !content?.trim()) {
      return NextResponse.json({ success: false, error: 'El mensaje está vacío' }, { status: 400 })
    }
    if (tipo !== 'text' && !mediaUrl) {
      return NextResponse.json({ success: false, error: 'Falta el archivo a enviar' }, { status: 400 })
    }

    // ── Sesión y empresa ──────────────────────────────────────────────────
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value },
          set() { /* no aplica */ },
          remove() { /* no aplica */ }
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
    const companyId = profile.company_id

    // ── Contacto y canal ──────────────────────────────────────────────────
    const { data: contacto } = await supabase
      .from('contacts')
      .select('id, external_id, platform')
      .eq('company_id', companyId)
      .or(`id.eq.${patient_id},external_id.eq.${patient_id}`)
      .maybeSingle()

    const canal: Canal = ((contacto?.platform as Canal) || 'whatsapp')
    const destinatario = contacto?.external_id || contacto?.id || patient_id

    // ── Credenciales del canal ────────────────────────────────────────────
    let endpoint = ''
    let token = ''
    let cuerpo: any = {}

    if (canal === 'whatsapp') {
      const { data: company } = await supabase
        .from('companies')
        .select('business_phone_id, system_user_access_token')
        .eq('id', companyId).maybeSingle()

      if (!company?.business_phone_id || !company?.system_user_access_token) {
        return NextResponse.json(
          { success: false, error: 'WhatsApp no está conectado. Revísalo en Conectividad.' },
          { status: 400 }
        )
      }
      endpoint = `${GRAPH}/${company.business_phone_id}/messages`
      token = company.system_user_access_token

      if (tipo === 'text') {
        cuerpo = { messaging_product: 'whatsapp', to: destinatario, type: 'text', text: { body: content } }
      } else if (tipo === 'image') {
        cuerpo = { messaging_product: 'whatsapp', to: destinatario, type: 'image', image: { link: mediaUrl, caption: mediaCaption || undefined } }
      } else {
        cuerpo = { messaging_product: 'whatsapp', to: destinatario, type: 'audio', audio: { link: mediaUrl } }
      }
    } else {
      const { data: integracion } = await supabase
        .from('integrations')
        .select('access_token, page_id, account_id')
        .eq('company_id', companyId)
        .eq('platform', canal)
        .maybeSingle()

      if (!integracion?.access_token) {
        return NextResponse.json(
          { success: false, error: `${canal === 'messenger' ? 'Facebook' : 'Instagram'} no está conectado. Revísalo en Conectividad.` },
          { status: 400 }
        )
      }
      const origen = canal === 'instagram'
        ? (integracion.account_id || integracion.page_id)
        : integracion.page_id

      endpoint = `${GRAPH}/${origen}/messages`
      token = integracion.access_token

      if (tipo === 'text') {
        cuerpo = { recipient: { id: destinatario }, message: { text: content }, messaging_type: 'RESPONSE' }
      } else {
        cuerpo = {
          recipient: { id: destinatario },
          message: { attachment: { type: tipo === 'image' ? 'image' : 'audio', payload: { url: mediaUrl, is_reusable: false } } },
          messaging_type: 'RESPONSE'
        }
      }
    }

    // ── Envío ─────────────────────────────────────────────────────────────
    const res = await fetch(`${endpoint}?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    })
    const respuesta = await res.json()

    if (!res.ok || respuesta?.error) {
      const detalle = respuesta?.error?.message || 'Meta rechazó el envío'
      const esVentana = /24|outside|window|re-engagement/i.test(detalle)
      return NextResponse.json(
        {
          success: false,
          error: esVentana
            ? 'Pasaron más de 24 horas desde el último mensaje del cliente. Meta no permite escribirle fuera de esa ventana.'
            : detalle
        },
        { status: 400 }
      )
    }

    // ── Registrar en el historial ─────────────────────────────────────────
    await supabase.from('messages').insert({
      company_id: companyId,
      patient_id: contacto?.id || patient_id,
      content: tipo === 'text' ? content : (mediaCaption || content),
      sender: 'admin',
      message_type: tipo,
      media_url: mediaUrl,
      media_caption: mediaCaption,
      channel: canal
    })

    await supabase
      .from('contacts')
      .update({ last_outbound_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('id', contacto?.id || patient_id)

    return NextResponse.json({ success: true, canal })
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Error inesperado al enviar' },
      { status: 500 }
    )
  }
}
