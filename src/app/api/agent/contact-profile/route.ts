 

// ============================================================================
// src/app/api/agent/contact-profile/route.ts
// ----------------------------------------------------------------------------
// Nombre y foto real de los contactos de Facebook Messenger e Instagram.
//
// El problema: Meta no manda el nombre del usuario en el webhook de FB/IG
// —solo su identificador—, así que los contactos entraban a la bandeja como
// «Cliente» y sin avatar.
//
// La solución obvia sería consultar Graph API y guardar la URL de la foto.
// No sirve: **las URLs de foto de Meta expiran**. Guardarlas produce avatares
// que funcionan hoy y salen rotos la semana que viene.
//
// Aquí la foto se **descarga una vez y se guarda en Supabase Storage**. La URL
// resultante es nuestra y no caduca, y de paso se deja de golpear Graph API en
// cada mensaje.
//
// Entrada:  { companyId, externalId, channel }
// Es idempotente: si el contacto ya tiene nombre y avatar propios, no hace
// nada y responde de inmediato.
// ============================================================================

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAgentAuth } from '../_auth'
import { checkRateLimit, clientKey, rateLimitHeaders, RATE_LIMITS } from '../../../../lib/rateLimit'
import { isUuid } from '../../../../lib/agentCatalog'
import { normalizeChannel, toChannelPlatform } from '../../../../lib/channels'
import { nombreDesdePerfilMeta, necesitaEnriquecer, rutaAvatar } from '../../../../lib/contactProfile'

export const dynamic = 'force-dynamic'

const BUCKET = 'avatars'
const GRAPH = process.env.META_GRAPH_VERSION || 'v22.0'

export async function POST(req: Request) {
  const noAutorizado = checkAgentAuth(req)
  if (noAutorizado) return noAutorizado

  const rl = await checkRateLimit('agent-catalog', clientKey(req))
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas consultas seguidas', success: false },
      { status: 429, headers: rateLimitHeaders(rl, RATE_LIMITS['agent-catalog']) }
    )
  }

  try {
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

    const companyId = body.companyId
    const externalId = String(body.externalId || '').trim()
    const canal = normalizeChannel(body.channel)

    if (!isUuid(companyId)) {
      return NextResponse.json({ error: 'companyId inválido' }, { status: 400 })
    }
    if (!externalId) {
      return NextResponse.json({ error: 'Falta externalId' }, { status: 400 })
    }
    // WhatsApp sí manda el nombre en el propio webhook: no hay nada que buscar.
    if (canal === 'whatsapp') {
      return NextResponse.json({ success: true, omitido: 'whatsapp' })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // ── ¿Hace falta? ────────────────────────────────────────────────────────
    const { data: contacto } = await supabase
      .from('contacts')
      .select('id, name, avatar_url')
      .eq('company_id', companyId)
      .eq('external_id', externalId)
      .maybeSingle()

    if (!contacto) {
      return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 })
    }
    if (!necesitaEnriquecer(contacto.name, contacto.avatar_url)) {
      return NextResponse.json({ success: true, omitido: 'ya_enriquecido' })
    }

    // ── Token de la página ──────────────────────────────────────────────────
    // Messenger e Instagram comparten página y token, y la fila se guarda a
    // veces bajo un `platform` y a veces bajo el otro. Se prefiere la del canal
    // y se acepta cualquiera con token, igual que hace el envío en n8n: un
    // criterio más estricto aquí solo produciría contactos sin nombre.
    const { data: integraciones } = await supabase
      .from('integrations')
      .select('platform, access_token')
      .eq('company_id', companyId)

    const filas = (integraciones || []).filter((i: any) => i?.access_token)
    const token =
      filas.find((i: any) => i.platform === canal)?.access_token ||
      filas.find((i: any) => i.platform === toChannelPlatform(canal))?.access_token ||
      filas[0]?.access_token
    if (!token) {
      return NextResponse.json({ success: false, error: 'Canal sin token' }, { status: 200 })
    }

    // ── Perfil en Graph API ─────────────────────────────────────────────────
    const campos = canal === 'instagram'
      ? 'name,username,profile_pic'
      : 'first_name,last_name,profile_pic'

    const resp = await fetch(
      `https://graph.facebook.com/${GRAPH}/${encodeURIComponent(externalId)}?fields=${campos}&access_token=${encodeURIComponent(token)}`
    )
    if (!resp.ok) {
      // Meta rechaza el perfil en varios casos legítimos: el usuario bloqueó
      // el acceso, o la app no tiene el permiso todavía. No es un error del
      // sistema, así que no se propaga como tal.
      return NextResponse.json({ success: false, error: 'Perfil no disponible' }, { status: 200 })
    }

    const perfil = await resp.json()
    const nombre = nombreDesdePerfilMeta(perfil)
    let avatarUrl: string | null = null

    // ── La foto se guarda, no se enlaza ─────────────────────────────────────
    if (perfil.profile_pic) {
      try {
        const img = await fetch(perfil.profile_pic)
        if (img.ok) {
          const bytes = new Uint8Array(await img.arrayBuffer())
          const ruta = rutaAvatar(companyId, canal, externalId)
          const { error: upErr } = await supabase.storage
            .from(BUCKET)
            .upload(ruta, bytes, {
              contentType: img.headers.get('content-type') || 'image/jpeg',
              upsert: true,
            })
          if (!upErr) {
            const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(ruta)
            avatarUrl = pub?.publicUrl || null
          }
        }
      } catch {
        // Sin foto se sigue adelante: el nombre por sí solo ya mejora la bandeja.
      }
    }

    // ── Guardar ─────────────────────────────────────────────────────────────
    const cambios: Record<string, unknown> = { platform: toChannelPlatform(canal) }
    if (nombre) cambios.name = nombre
    if (avatarUrl) cambios.avatar_url = avatarUrl

    const { error: updErr } = await supabase
      .from('contacts')
      .update(cambios)
      .eq('company_id', companyId)
      .eq('external_id', externalId)

    if (updErr) {
      return NextResponse.json({ success: false, error: 'No se pudo actualizar el contacto' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      nombre: nombre || null,
      avatar: avatarUrl,
      username: perfil.username || null,
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'Error inesperado', details: err?.message },
      { status: 500 }
    )
  }
}

