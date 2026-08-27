 

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

// ============================================================================
// src/app/api/channels/diagnostics/route.ts
// ----------------------------------------------------------------------------
// Diagnostica el estado real de cada canal conectado. Para cada uno revisa:
//   1. Credenciales guardadas    -> lectura de base de datos
//   2. Token válido              -> se le pregunta a la Graph API de Meta
//   3. Webhook suscrito          -> se consulta subscribed_apps en Meta
//   4. Actividad reciente        -> último mensaje recibido en ese canal
//
// Devuelve un semáforo por canal para que el usuario sepa si funciona, en vez
// de enterarse porque dejaron de llegar mensajes.
// ============================================================================

const GRAPH = 'https://graph.facebook.com/' + (process.env.META_GRAPH_VERSION || 'v22.0')

type EstadoCheck = 'ok' | 'error' | 'aviso' | 'desconocido'

interface Check {
  id: string
  titulo: string
  estado: EstadoCheck
  detalle: string
}

interface CanalDiagnostico {
  canal: 'whatsapp' | 'messenger' | 'instagram'
  nombre: string
  conectado: boolean
  estadoGeneral: EstadoCheck
  checks: Check[]
  ultimoMensaje: string | null
  /** true si el canal se puede intentar reparar (re-suscribir el webhook) */
  reparable?: boolean
}

// ── Helper: llamada a Graph con tolerancia a fallos ─────────────────────────
async function graph(path: string, token: string): Promise<{ ok: boolean; data: any }> {
  try {
    const sep = path.includes('?') ? '&' : '?'
    const res = await fetch(`${GRAPH}/${path}${sep}access_token=${encodeURIComponent(token)}`, {
      cache: 'no-store'
    })
    const data = await res.json()
    return { ok: res.ok && !data?.error, data }
  } catch (e: any) {
    return { ok: false, data: { error: { message: e?.message || 'Error de red' } } }
  }
}

function resumen(checks: Check[]): EstadoCheck {
  if (checks.some(c => c.estado === 'error')) return 'error'
  if (checks.some(c => c.estado === 'aviso')) return 'aviso'
  if (checks.every(c => c.estado === 'ok')) return 'ok'
  return 'desconocido'
}

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value },
          set() { /* no aplica en route handler de solo lectura */ },
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

    const { data: company } = await supabase
      .from('companies').select('*').eq('id', companyId).maybeSingle()

    const { data: integraciones } = await supabase
      .from('integrations').select('*').eq('company_id', companyId)

    // Último mensaje entrante por canal
    const { data: ultimos } = await supabase
      .from('messages')
      .select('channel, created_at')
      .eq('company_id', companyId)
      .eq('sender', 'patient')
      .order('created_at', { ascending: false })
      .limit(200)

    const ultimoPorCanal: Record<string, string> = {}
    for (const m of ultimos || []) {
      const canal = (m as any).channel || 'whatsapp'
      if (!ultimoPorCanal[canal]) ultimoPorCanal[canal] = (m as any).created_at
    }

    const resultados: CanalDiagnostico[] = []

    // ─────────────────────────────────────────────────────────────────────
    // WHATSAPP
    // ─────────────────────────────────────────────────────────────────────
    {
      const checks: Check[] = []
      const phoneId = company?.business_phone_id
      const wabaId = company?.waba_id
      const token = company?.system_user_access_token
      const conectado = !!(phoneId && token)

      checks.push({
        id: 'credenciales',
        titulo: 'Credenciales guardadas',
        estado: conectado ? 'ok' : 'error',
        detalle: conectado
          ? 'Número y token registrados'
          : 'Falta el Phone Number ID o el token de acceso'
      })

      if (conectado) {
        const r = await graph(`${phoneId}?fields=display_phone_number,verified_name`, token)
        checks.push({
          id: 'token',
          titulo: 'Token válido',
          estado: r.ok ? 'ok' : 'error',
          detalle: r.ok
            ? `Número activo: ${r.data.verified_name || ''} ${r.data.display_phone_number || ''}`.trim()
            : `Meta rechazó el token: ${r.data?.error?.message || 'sin detalle'}`
        })

        if (wabaId) {
          const s = await graph(`${wabaId}/subscribed_apps`, token)
          const suscrito = s.ok && Array.isArray(s.data?.data) && s.data.data.length > 0
          checks.push({
            id: 'webhook',
            titulo: 'Webhook suscrito',
            estado: suscrito ? 'ok' : 'aviso',
            detalle: suscrito
              ? 'Meta enviará los mensajes entrantes'
              : 'No se pudo confirmar la suscripción. Revisa la configuración del webhook en tu app de Meta.'
          })
        } else {
          checks.push({
            id: 'webhook',
            titulo: 'Webhook suscrito',
            estado: 'desconocido',
            detalle: 'Falta el WABA ID para poder comprobarlo'
          })
        }
      }

      resultados.push({
        canal: 'whatsapp',
        nombre: 'WhatsApp Business',
        conectado,
        estadoGeneral: conectado ? resumen(checks) : 'error',
        checks,
        ultimoMensaje: ultimoPorCanal['whatsapp'] || null
      })
    }

    // ─────────────────────────────────────────────────────────────────────
    // MESSENGER e INSTAGRAM
    // ─────────────────────────────────────────────────────────────────────
    const canales: Array<{ key: 'messenger' | 'instagram'; nombre: string }> = [
      { key: 'messenger', nombre: 'Facebook Messenger' },
      { key: 'instagram', nombre: 'Instagram Direct' }
    ]

    for (const { key, nombre } of canales) {
      const checks: Check[] = []
      const integracion = (integraciones || []).find((i: any) => i.platform === key)
      const token = integracion?.access_token
      const pageId = integracion?.page_id
      const destino = key === 'instagram' ? (integracion?.account_id || pageId) : pageId
      const conectado = !!(token && destino)

      checks.push({
        id: 'credenciales',
        titulo: 'Credenciales guardadas',
        estado: conectado ? 'ok' : 'error',
        detalle: conectado
          ? 'Token e identificador registrados'
          : 'Este canal todavía no está conectado'
      })

      if (conectado) {
        const r = await graph(`${destino}?fields=name,username`, token)
        checks.push({
          id: 'token',
          titulo: 'Token válido',
          estado: r.ok ? 'ok' : 'error',
          detalle: r.ok
            ? `Cuenta activa: ${r.data.name || r.data.username || destino}`
            : `Meta rechazó el token: ${r.data?.error?.message || 'sin detalle'}`
        })

        if (pageId) {
          // No basta con que exista la suscripción: hay que confirmar que
          // incluya el campo 'messages' (y 'messaging_postbacks'). Sin ese
          // campo Meta acepta la suscripción pero NUNCA manda los mensajes,
          // que es la causa #1 de "no me llegan los mensajes de FB/IG".
          const s = await graph(`${pageId}/subscribed_apps?fields=subscribed_fields`, token)
          const apps: any[] = Array.isArray(s.data?.data) ? s.data.data : []
          const campos: string[] = apps.flatMap(a => Array.isArray(a?.subscribed_fields) ? a.subscribed_fields : [])
          const suscrito = apps.length > 0
          const tieneMessages = campos.includes('messages')

          checks.push({
            id: 'webhook',
            titulo: 'Webhook suscrito',
            estado: !suscrito ? 'error' : tieneMessages ? 'ok' : 'error',
            detalle: !suscrito
              ? 'La página no está suscrita a la app. Usa "Reparar webhook" para suscribirla.'
              : tieneMessages
                ? `Meta enviará los mensajes entrantes (campos: ${campos.join(', ')})`
                : `La página está suscrita pero SIN el campo "messages" — por eso no llegan los mensajes. Campos actuales: ${campos.join(', ') || 'ninguno'}. Usa "Reparar webhook".`
          })
        }

        // Identificador de canal guardado en companies (lo usa el flujo de n8n)
        const guardado = key === 'instagram' ? company?.ig_account_id : company?.fb_page_id
        checks.push({
          id: 'ruteo',
          titulo: 'Identificador para el asistente',
          estado: guardado ? 'ok' : 'error',
          detalle: guardado
            ? 'El asistente puede identificar a tu empresa con este canal'
            : 'Falta guardar el identificador. Vuelve a conectar el canal para completarlo.'
        })
      }

      resultados.push({
        canal: key,
        nombre,
        conectado,
        estadoGeneral: conectado ? resumen(checks) : 'error',
        checks,
        ultimoMensaje: ultimoPorCanal[key] || null,
        // Con token + página podemos re-suscribir el webhook desde la app
        reparable: !!(token && pageId)
      })
    }

    return NextResponse.json({ success: true, canales: resultados, revisadoEn: new Date().toISOString() })
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Error inesperado al diagnosticar' },
      { status: 500 }
    )
  }
}
