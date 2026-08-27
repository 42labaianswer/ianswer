 

// src/app/api/whatsapp-profile/photo/route.ts
// ----------------------------------------------------------------------------
// Sprint W · Subir la foto de perfil de WhatsApp Business.
//
// Meta requiere un flujo de 2 pasos para la foto:
//   1. Subir el archivo a la Resumable Upload API → obtienes un "handle"
//   2. Asignar ese handle al perfil (POST whatsapp_business_profile con
//      profile_picture_handle)
//
// Recibe el archivo como base64 en el body (viene del navegador).
// ----------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const maxDuration = 60

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0'
const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID

async function getCompanyMeta() {
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
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).maybeSingle()
  if (!profile?.company_id) return null
  const { data: company } = await supabase
    .from('companies').select('system_user_access_token, meta_token, business_phone_id')
    .eq('id', profile.company_id).maybeSingle()
  // Fuente de verdad del token = system_user_access_token; meta_token es legacy
  // (mismo fix que en whatsapp-profile/route.ts).
  const token = company?.system_user_access_token || company?.meta_token
  if (!token || !company?.business_phone_id) return null
  return { token, phoneId: company.business_phone_id }
}

export async function POST(req: NextRequest) {
  try {
    const meta = await getCompanyMeta()
    if (!meta) {
      return NextResponse.json({ error: 'WhatsApp no está conectado' }, { status: 400 })
    }
    if (!APP_ID) {
      return NextResponse.json({ error: 'Falta NEXT_PUBLIC_META_APP_ID' }, { status: 500 })
    }

    const body = await req.json()
    const base64: string = body.image_base64
    const mimeType: string = body.mime_type || 'image/jpeg'
    if (!base64) {
      return NextResponse.json({ error: 'Falta la imagen' }, { status: 400 })
    }

    const buffer = Buffer.from(base64, 'base64')
    const fileLength = buffer.length

    // ── Paso 1a: crear sesión de upload ──
    const startUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${APP_ID}/uploads?file_length=${fileLength}&file_type=${encodeURIComponent(mimeType)}`
    const startRes = await fetch(startUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${meta.token}` },
    })
    const startData = await startRes.json()
    if (!startRes.ok || !startData.id) {
      return NextResponse.json(
        { error: startData?.error?.message || 'No se pudo iniciar la subida' },
        { status: 400 }
      )
    }

    // ── Paso 1b: subir los bytes ──
    const uploadUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${startData.id}`
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${meta.token}`,
        file_offset: '0',
        'Content-Type': mimeType,
      },
      body: buffer,
    })
    const uploadData = await uploadRes.json()
    if (!uploadRes.ok || !uploadData.h) {
      return NextResponse.json(
        { error: uploadData?.error?.message || 'No se pudo subir la imagen' },
        { status: 400 }
      )
    }

    // ── Paso 2: asignar el handle al perfil ──
    const profileUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${meta.phoneId}/whatsapp_business_profile`
    const assignRes = await fetch(profileUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${meta.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        profile_picture_handle: uploadData.h,
      }),
    })
    const assignData = await assignRes.json()
    if (!assignRes.ok) {
      return NextResponse.json(
        { error: assignData?.error?.message || 'No se pudo asignar la foto' },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error inesperado' },
      { status: 500 }
    )
  }
}
