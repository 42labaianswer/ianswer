 

'use client'

// ============================================================================
// src/components/ChannelBadge.tsx
// ----------------------------------------------------------------------------
// Metadatos e íconos de canal para el buzón multicanal (WhatsApp, Facebook
// Messenger, Instagram Direct).
//
// Fuente de verdad del canal por conversación = `messages.channel`, que n8n
// escribe como 'whatsapp' | 'messenger' | 'instagram'. `contacts.platform`
// usa el enum channel_platform ('whatsapp' | 'facebook' | 'instagram'), por
// eso normalizeChannel mapea 'facebook' -> 'messenger' para tener un solo
// vocabulario en el frontend.
// ============================================================================

import type { ReactElement } from 'react'

import type { ChannelKey } from '../lib/channels'
export type { ChannelKey }

export const WhatsAppGlyph = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
)

export const FacebookGlyph = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 3.657 10.99 8.438 12.83l-.001-9.294H5.898v-3.536h2.539V9.845c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562v1.877h2.773l-.443 3.536h-2.33v9.294C20.343 23.063 24 18.062 24 12.073z" />
  </svg>
)

export const InstagramGlyph = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
)

export interface ChannelMeta {
  key: ChannelKey
  label: string
  /** Prefijo de identidad de la página/cuenta del negocio: '#', '@' o '' */
  handlePrefix: string
  color: string       // texto/acento
  bg: string          // fondo suave
  Icon: (p: { size?: number; className?: string }) => ReactElement
}

export const CHANNELS: Record<ChannelKey, ChannelMeta> = {
  whatsapp: {
    key: 'whatsapp',
    label: 'WhatsApp',
    handlePrefix: '',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    Icon: WhatsAppGlyph,
  },
  messenger: {
    key: 'messenger',
    label: 'Messenger',
    handlePrefix: '#',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    Icon: FacebookGlyph,
  },
  instagram: {
    key: 'instagram',
    label: 'Instagram',
    handlePrefix: '@',
    color: 'text-fuchsia-600',
    bg: 'bg-fuchsia-50',
    Icon: InstagramGlyph,
  },
}

// La lógica pura de canal vive en src/lib/channels.ts (sin JSX) para poder
// probarla de forma unitaria. Se reexporta aquí para no romper los imports
// existentes de los componentes.
export { normalizeChannel, channelIdentityLabel, toChannelPlatform, resolveSenderId } from '../lib/channels'

/** Chip pequeño con ícono + etiqueta del canal. */
export function ChannelBadge({ channel, className = '' }: { channel: ChannelKey; className?: string }) {
  const meta = CHANNELS[channel]
  const Icon = meta.Icon
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide border border-slate-200 ${meta.bg} ${meta.color} ${className}`}>
      <Icon size={11} /> {meta.label}
    </span>
  )
}

/**
 * Ícono de canal circular pequeño, pensado para incrustarse como "glyph" sobre
 * el avatar del contacto (esquina inferior derecha).
 */
export function ChannelGlyph({ channel, size = 16, ring = true }: { channel: ChannelKey; size?: number; ring?: boolean }) {
  const meta = CHANNELS[channel]
  const Icon = meta.Icon
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-white ${meta.color} ${ring ? 'ring-2 ring-white' : ''}`}
      style={{ width: size, height: size }}
      title={meta.label}
    >
      <Icon size={Math.round(size * 0.68)} />
    </span>
  )
}

