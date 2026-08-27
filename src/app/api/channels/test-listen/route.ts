 

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

// ============================================================================
// src/app/api/channels/test-listen/route.ts
// ----------------------------------------------------------------------------
// Prueba de punta a punta de un canal. El usuario manda un mensaje real desde
// su teléfono y esta ruta responde si:
//   a) el mensaje llegó al sistema (lo recibió el webhook y n8n lo guardó)
//   b) el asistente contestó
//
// La página la consulta cada pocos segundos mientras dura la prueba. Es la
// única comprobación que confirma la cadena completa: Meta -> n8n -> IA -> Meta.
//
// Parámetros: ?canal=whatsapp|messenger|instagram&desde=<ISO 8601>
// ============================================================================

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const canal = searchParams.get('canal') || 'whatsapp'
    const desde = searchParams.get('desde')

    if (!['whatsapp', 'messenger', 'instagram'].includes(canal)) {
      return NextResponse.json({ success: false, error: 'Canal no válido' }, { status: 400 })
    }
    if (!desde || isNaN(Date.parse(desde))) {
      return NextResponse.json({ success: false, error: 'Falta la marca de tiempo de inicio' }, { status: 400 })
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

    // Mensajes de este canal posteriores al inicio de la prueba
    const { data: mensajes, error } = await supabase
      .from('messages')
      .select('sender, content, created_at, channel, patient_id')
      .eq('company_id', profile.company_id)
      .gte('created_at', desde)
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) throw error

    const delCanal = (mensajes || []).filter((m: any) => (m.channel || 'whatsapp') === canal)
    const entrante = delCanal.find((m: any) => m.sender === 'patient')
    const respuesta = entrante
      ? delCanal.find((m: any) => m.sender === 'asistente' && m.created_at >= entrante.created_at)
      : null

    return NextResponse.json({
      success: true,
      recibido: !!entrante,
      respondido: !!respuesta,
      mensajeRecibido: entrante
        ? { texto: entrante.content, en: entrante.created_at }
        : null,
      mensajeRespuesta: respuesta
        ? { texto: respuesta.content, en: respuesta.created_at }
        : null
    })
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Error inesperado' },
      { status: 500 }
    )
  }
}
