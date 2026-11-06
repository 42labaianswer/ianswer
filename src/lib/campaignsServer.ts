// Parte de servidor de las campañas: plantillas del WABA, destinatarios y uso
// del mes. Requiere un cliente con service_role.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { GRAPH } from './metaGraph'
import {
  CAMPAIGN_STAGES, toCampaignTemplate,
  type CampaignAudience, type CampaignTemplate, type MetaTemplate,
} from './campaigns'

export function adminClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

export interface CampaignUsage {
  used: number
  limit: number
  remaining: number
  period_start: string
}

export async function getCampaignUsage(admin: SupabaseClient, companyId: string): Promise<CampaignUsage> {
  const { data, error } = await admin.rpc('get_campaign_usage', { p_company_id: companyId })
  if (error) throw error
  return data as CampaignUsage
}

export interface WhatsAppCredentials {
  wabaId: string | null
  phoneId: string
  token: string
}

export async function getWhatsAppCredentials(admin: SupabaseClient, companyId: string): Promise<WhatsAppCredentials | null> {
  const { data } = await admin
    .from('companies')
    .select('waba_id, business_phone_id, system_user_access_token')
    .eq('id', companyId)
    .maybeSingle()
  if (!data?.business_phone_id || !data?.system_user_access_token) return null
  return { wabaId: data.waba_id, phoneId: data.business_phone_id, token: data.system_user_access_token }
}

/** Plantillas de marketing aprobadas del WABA. Lanza Error con mensaje para el usuario. */
export async function listMarketingTemplates(creds: WhatsAppCredentials, name?: string): Promise<CampaignTemplate[]> {
  if (!creds.wabaId) throw new Error('No encontramos la cuenta de WhatsApp Business. Vuelve a conectar WhatsApp en Conectividad.')

  const params = new URLSearchParams({
    fields: 'name,language,status,category,parameter_format,components',
    status: 'APPROVED',
    limit: '200',
    access_token: creds.token,
  })
  if (name) params.set('name', name)

  const templates: MetaTemplate[] = []
  let url: string | null = `${GRAPH}/${creds.wabaId}/message_templates?${params}`
  for (let page = 0; url && page < 10; page++) {
    const res: Response = await fetch(url)
    const json = await res.json().catch(() => null)
    if (!res.ok || json?.error) {
      throw new Error(json?.error?.error_user_msg || json?.error?.message || 'Meta no devolvió las plantillas')
    }
    templates.push(...(json?.data ?? []))
    url = json?.paging?.next ?? null
  }

  return templates
    .filter(t => t.status === 'APPROVED' && t.category === 'MARKETING')
    .filter(t => !name || t.name === name)
    .map(toCampaignTemplate)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface AudienceContact {
  id: string
  phone: string
  name: string | null
}

export function sanitizeAudience(raw: unknown): CampaignAudience {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  return {
    tag_ids: strings(a.tag_ids),
    stages: strings(a.stages).filter(s => (CAMPAIGN_STAGES as readonly string[]).includes(s)),
  }
}

/**
 * Contactos de WhatsApp sin baja de la empresa que cumplen el filtro: si hay
 * etiquetas, que tengan al menos una; si hay etapas, que estén en alguna.
 * Un renglón por número.
 */
export async function loadAudience(admin: SupabaseClient, companyId: string, audience: CampaignAudience): Promise<AudienceContact[]> {
  let allowedIds: Set<string> | null = null
  if (audience.tag_ids && audience.tag_ids.length > 0) {
    const { data: tags, error: tagsError } = await admin
      .from('tags').select('id').eq('company_id', companyId).in('id', audience.tag_ids)
    if (tagsError) throw tagsError
    const tagIds = (tags ?? []).map(t => t.id as string)
    allowedIds = new Set()
    for (let from = 0; tagIds.length > 0; from += 1000) {
      const { data, error } = await admin
        .from('contact_tags').select('contact_id').in('tag_id', tagIds).range(from, from + 999)
      if (error) throw error
      for (const r of data ?? []) allowedIds.add(r.contact_id as string)
      if (!data || data.length < 1000) break
    }
    if (allowedIds.size === 0) return []
  }

  const contacts: AudienceContact[] = []
  const seen = new Set<string>()
  for (let from = 0; ; from += 1000) {
    let q = admin
      .from('contacts')
      .select('id, external_id, name')
      .eq('company_id', companyId)
      .eq('platform', 'whatsapp')
      .or('opted_out.is.null,opted_out.eq.false')
      .order('created_at', { ascending: true })
      .range(from, from + 999)
    if (audience.stages && audience.stages.length > 0) q = q.in('lifecycle_stage', audience.stages)
    const { data, error } = await q
    if (error) throw error
    for (const c of data ?? []) {
      const phone = String(c.external_id || '').replace(/\D/g, '')
      if (!phone || seen.has(phone)) continue
      if (allowedIds && !allowedIds.has(c.id as string)) continue
      seen.add(phone)
      contacts.push({ id: c.id as string, phone, name: (c.name as string | null) ?? null })
    }
    if (!data || data.length < 1000) break
  }
  return contacts
}

/** true si el error de Supabase viene de reserve_campaign_messages por falta de cupo. */
export function isCampaignLimitDbError(error: { hint?: string | null } | null | undefined): boolean {
  return error?.hint === 'campaign_limit'
}
