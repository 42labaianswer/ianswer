// Límite de canales por plan, visto desde el servidor. La regla vive en la base
// (database/add_channel_limit.sql): las rutas la consultan antes de llamar a
// Meta para no dejar nada a medias, y el trigger la vuelve a aplicar al guardar.

import type { SupabaseClient } from '@supabase/supabase-js'

export type Channel = 'whatsapp' | 'messenger' | 'instagram'

export interface ChannelUsage {
  connected: Channel[]
  max: number
}

/** Requiere un cliente con service_role. */
export async function getChannelUsage(admin: SupabaseClient, companyId: string): Promise<ChannelUsage> {
  const [channelsRes, limitRes] = await Promise.all([
    admin.rpc('company_connected_channels', { p_company_id: companyId }),
    admin.rpc('company_channel_limit', { p_company_id: companyId }),
  ])
  if (channelsRes.error) throw channelsRes.error
  if (limitRes.error) throw limitRes.error
  return {
    connected: (channelsRes.data as Channel[] | null) ?? [],
    max: typeof limitRes.data === 'number' ? limitRes.data : 1,
  }
}

/** Mensaje de error si conectar `wanted` pasa del límite; null si cabe. */
export function channelLimitError(usage: ChannelUsage, wanted: Channel[]): string | null {
  const nuevos = wanted.filter(c => !usage.connected.includes(c))
  if (usage.connected.length + nuevos.length <= usage.max) return null
  return `Tu plan permite ${usage.max} ${usage.max === 1 ? 'canal' : 'canales'} y ya tienes ${usage.connected.length} conectado${usage.connected.length === 1 ? '' : 's'}. Cambia de plan para conectar otro.`
}

/** true si el error de Supabase viene del trigger de límite de canales. */
export function isChannelLimitDbError(error: { hint?: string | null } | null | undefined): boolean {
  return error?.hint === 'channel_limit'
}
