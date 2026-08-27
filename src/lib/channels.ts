 

// ============================================================================
// src/lib/channels.ts
// ----------------------------------------------------------------------------
// Lógica pura de canal, sin JSX ni dependencias de React, para que pueda
// probarse de forma unitaria y reutilizarse desde el servidor.
//
// Vocabularios que conviven en el sistema:
//   · `messages.channel`    → 'whatsapp' | 'messenger' | 'instagram'  (lo escribe n8n)
//   · `contacts.platform`   → enum channel_platform: 'whatsapp' | 'facebook' | 'instagram'
//   · frontend / envío      → 'whatsapp' | 'messenger' | 'instagram'
//
// normalizeChannel() unifica los tres a un solo vocabulario.
// ============================================================================

export type ChannelKey = 'whatsapp' | 'messenger' | 'instagram'

/** Valor del enum `channel_platform` en la base de datos. */
export type ChannelPlatform = 'whatsapp' | 'facebook' | 'instagram'

export interface ChannelIdentity {
  waba_display_phone?: string | null
  waba_verified_name?: string | null
  fb_page_name?: string | null
  ig_username?: string | null
}

/**
 * Normaliza cualquier valor de canal al vocabulario del frontend.
 * 'facebook' → 'messenger'. Ante un valor desconocido o vacío: 'whatsapp'.
 */
export function normalizeChannel(value?: string | null): ChannelKey {
  const v = (value || '').toLowerCase().trim()
  if (v === 'instagram' || v === 'ig') return 'instagram'
  if (v === 'messenger' || v === 'facebook' || v === 'fb') return 'messenger'
  return 'whatsapp'
}

/**
 * Convierte al vocabulario que acepta el enum de la base de datos.
 * El enum NO tiene 'messenger', por eso hay que mapear a 'facebook'.
 */
export function toChannelPlatform(value?: string | null): ChannelPlatform {
  const canal = normalizeChannel(value)
  return canal === 'messenger' ? 'facebook' : canal
}

/**
 * Identidad de la página o cuenta del negocio por la que se responde.
 * Ej.: '@mi_negocio' (IG), '#Mi Página' (FB), '+52 999…' (WA).
 */
export function channelIdentityLabel(
  channel: ChannelKey,
  identity?: ChannelIdentity | null
): string {
  if (channel === 'instagram') {
    return identity?.ig_username ? `@${identity.ig_username}` : 'Instagram'
  }
  if (channel === 'messenger') {
    return identity?.fb_page_name ? `#${identity.fb_page_name}` : 'Facebook'
  }
  return identity?.waba_display_phone || identity?.waba_verified_name || 'WhatsApp'
}

/**
 * Identificador de la empresa por el que se ENVÍA en cada canal.
 *
 * Messenger e Instagram se envían SIEMPRE por el `page_id`. Usar el id de la
 * cuenta de Instagram provoca:
 *   (#3) Application does not have the capability to make this API call
 */
export function resolveSenderId(
  channel: ChannelKey,
  opts: { pageId?: string | null; businessPhoneId?: string | null }
): string | null {
  if (channel === 'whatsapp') return opts.businessPhoneId || null
  return opts.pageId || null
}

