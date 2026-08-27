 

// src/app/api/whatsapp-profile/route.ts
// ----------------------------------------------------------------------------
// Sprint W · Editar el perfil de WhatsApp Business desde la plataforma.
//
// En vez de que el cliente entre a Meta Business Manager, edita su perfil
// (foto, "acerca de", descripción, dirección, email, sitios web, categoría)
// desde nuestra página. Usamos la Graph API con el meta_token que ya tenemos.
//
// GET  → lee el perfil actual
// POST → actualiza campos de texto del perfil
//
// Nota: la FOTO de perfil requiere un flujo de 2 pasos (subir a resumable
// upload API → obtener handle → asignar). Eso va en un endpoint aparte para
// no complicar este. Aquí manejamos los campos de texto.
// ----------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { normalizeVertical, WHATSAPP_VERTICALS } from '../../../lib/whatsappVerticals'

export const runtime = 'nodejs'

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0'

async function getCompanyMeta(): Promise<
  | { ok: true; token: string; phoneId: string; companyId: string }
  | { ok: false; status: number; error: string }
> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => cookieStore.get(n)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'No autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.company_id) return { ok: false, status: 400, error: 'Sin company' }

  const { data: company } = await supabase
    .from('companies')
    .select('system_user_access_token, meta_token, business_phone_id')
    .eq('id', profile.company_id)
    .maybeSingle()

  // ⚠️ FIX token WhatsApp (Sprint Conectividad):
  // La fuente de verdad del token es `system_user_access_token` (la que escribe
  // el flujo de conexión y la que usan messages/send, disconnect y el
  // diagnóstico). `meta_token` es una columna legacy que casi siempre está
  // vacía. Antes esta ruta leía SOLO `meta_token`, por eso el editor de perfil
  // salía como "WhatsApp no conectado" aunque el canal sí estuviera conectado.
  const token = company?.system_user_access_token || company?.meta_token

  if (!token || !company?.business_phone_id) {
    return { ok: false, status: 400, error: 'WhatsApp no está conectado todavía' }
  }

  return {
    ok: true,
    token,
    phoneId: company.business_phone_id,
    companyId: profile.company_id,
  }
}

// ─── GET: leer el perfil actual ────────────────────────────────────────────
export async function GET() {
  try {
    const meta = await getCompanyMeta()
    if (!meta.ok) return NextResponse.json({ error: meta.error }, { status: meta.status })

    const fields = 'about,address,description,email,profile_picture_url,websites,vertical'
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${meta.phoneId}/whatsapp_business_profile?fields=${fields}`

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${meta.token}` },
    })

    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error?.message || 'Error al leer el perfil' },
        { status: res.status }
      )
    }

    // La Graph API devuelve { data: [ { ...perfil } ] }
    const profile = Array.isArray(data.data) ? data.data[0] : data.data
    return NextResponse.json({ ok: true, profile: profile || {} })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error inesperado' },
      { status: 500 }
    )
  }
}

// ─── POST: actualizar campos de texto del perfil ───────────────────────────
export async function POST(req: NextRequest) {
  try {
    const meta = await getCompanyMeta()
    if (!meta.ok) return NextResponse.json({ error: meta.error }, { status: meta.status })

    const body = await req.json()

    // Solo permitimos estos campos (los editables por texto)
    const allowed: Record<string, unknown> = { messaging_product: 'whatsapp' }
    if (typeof body.about === 'string') allowed.about = body.about
    if (typeof body.description === 'string') allowed.description = body.description
    if (typeof body.address === 'string') allowed.address = body.address
    if (typeof body.email === 'string') allowed.email = body.email
    // La categoría se valida contra la lista oficial de Meta. Si no es
    // válida, se OMITE en lugar de reenviarla: Meta rechaza la petición
    // completa por un solo campo malo, así que un valor inválido tumbaba
    // también el resto de los cambios del perfil.
    if (body.vertical !== undefined) {
      const vertical = normalizeVertical(body.vertical)
      if (vertical) {
        allowed.vertical = vertical
      } else if (String(body.vertical).trim()) {
        return NextResponse.json(
          {
            error: `Categoría de negocio no válida: "${body.vertical}".`,
            validValues: WHATSAPP_VERTICALS,
          },
          { status: 400 }
        )
      }
    }
    if (Array.isArray(body.websites)) allowed.websites = body.websites.slice(0, 2) // Meta permite máx 2

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${meta.phoneId}/whatsapp_business_profile`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${meta.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(allowed),
    })

    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error?.message || 'Error al actualizar el perfil' },
        { status: res.status }
      )
    }

    return NextResponse.json({ ok: true, success: data.success ?? true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error inesperado' },
      { status: 500 }
    )
  }
}
