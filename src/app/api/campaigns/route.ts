import { NextResponse } from 'next/server'
import { requireActiveCompany } from '../../../lib/apiAuth'
import { GRAPH, postGraphMessage } from '../../../lib/metaGraph'
import {
  buildTemplateMessage, errorMessage, renderTemplateText, templateParamsError,
  type TemplateParams,
} from '../../../lib/campaigns'
import {
  adminClient, getCampaignUsage, getWhatsAppCredentials, isCampaignLimitDbError,
  listMarketingTemplates, loadAudience, sanitizeAudience,
} from '../../../lib/campaignsServer'

// ============================================================================
// src/app/api/campaigns/route.ts
// ----------------------------------------------------------------------------
// GET  → uso del mes, últimas campañas y etiquetas para el filtro.
// POST → manda una plantilla de marketing aprobada a los contactos de WhatsApp
//        sin baja que cumplan el filtro. Si viene dry_run solo cuenta
//        destinatarios.
//
// El límite mensual se aparta en la base antes de enviar
// (reserve_campaign_messages) y lo que Meta rechaza se devuelve
// (release_campaign_messages): solo cuentan los envíos aceptados.
//
// Entrada POST: { name, template_name, template_language, params, audience, dry_run? }
// ============================================================================

export const maxDuration = 300

const CONCURRENCY = 10

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status })
}

export async function GET() {
  const auth = await requireActiveCompany()
  if (!auth.ok) return auth.response
  const { supabase, companyId } = auth

  try {
    const admin = adminClient()
    const [usage, campaigns, tags, creds] = await Promise.all([
      getCampaignUsage(admin, companyId),
      supabase
        .from('campaigns')
        .select('id, name, template_name, status, total_recipients, sent_count, failed_count, created_at, finished_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('tags')
        .select('id, name, color')
        .eq('company_id', companyId)
        .order('display_order'),
      getWhatsAppCredentials(admin, companyId),
    ])

    return json(200, {
      success: true,
      usage,
      campaigns: campaigns.data ?? [],
      tags: tags.data ?? [],
      whatsapp_connected: !!creds,
    })
  } catch (e) {
    return json(500, { success: false, error: errorMessage(e, 'No se pudieron cargar las campañas') })
  }
}

export async function POST(request: Request) {
  const auth = await requireActiveCompany()
  if (!auth.ok) return auth.response
  const { userId, companyId } = auth

  let body: Record<string, unknown>
  try {
    body = (await request.json()) ?? {}
  } catch {
    return json(400, { success: false, error: 'Solicitud inválida' })
  }

  const admin = adminClient()
  const audience = sanitizeAudience(body.audience)

  try {
    const contacts = await loadAudience(admin, companyId, audience)

    if (body.dry_run) {
      const usage = await getCampaignUsage(admin, companyId)
      return json(200, { success: true, recipients: contacts.length, usage })
    }

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : ''
    const templateName = typeof body.template_name === 'string' ? body.template_name : ''
    const templateLanguage = typeof body.template_language === 'string' ? body.template_language : ''
    const params = (body.params && typeof body.params === 'object' ? body.params : {}) as TemplateParams

    if (!name) return json(400, { success: false, error: 'Ponle un nombre a la campaña' })
    if (!templateName || !templateLanguage) return json(400, { success: false, error: 'Elige una plantilla' })
    if (contacts.length === 0) return json(400, { success: false, error: 'No hay contactos que cumplan el filtro' })

    const creds = await getWhatsAppCredentials(admin, companyId)
    if (!creds) return json(400, { success: false, error: 'WhatsApp no está conectado. Revísalo en Conectividad.' })

    // La plantilla se vuelve a leer de Meta: no se confía en la del navegador.
    const template = (await listMarketingTemplates(creds, templateName))
      .find(t => t.language === templateLanguage)
    if (!template) {
      return json(400, { success: false, error: 'La plantilla ya no está aprobada como marketing en tu cuenta de WhatsApp' })
    }
    const paramsError = templateParamsError(template, params)
    if (paramsError) return json(400, { success: false, error: paramsError })

    // ── Apartar cupo del mes ──────────────────────────────────────────────
    const { data: reserva, error: reservaError } = await admin.rpc('reserve_campaign_messages', {
      p_company_id: companyId,
      p_count: contacts.length,
    })
    if (reservaError) {
      if (isCampaignLimitDbError(reservaError)) return json(403, { success: false, error: reservaError.message })
      throw reservaError
    }
    const periodStart = (reserva as { period_start: string }).period_start

    const { data: campaign, error: campaignError } = await admin
      .from('campaigns')
      .insert({
        company_id: companyId,
        name,
        template_name: template.name,
        template_language: template.language,
        template_params: params,
        audience,
        status: 'sending',
        total_recipients: contacts.length,
        created_by: userId,
      })
      .select('id')
      .single()
    if (campaignError || !campaign) {
      await admin.rpc('release_campaign_messages', { p_company_id: companyId, p_period_start: periodStart, p_count: contacts.length })
      throw campaignError || new Error('No se pudo crear la campaña')
    }

    const recipients = contacts.map(c => ({
      campaign_id: campaign.id,
      company_id: companyId,
      contact_id: c.id,
      phone: c.phone,
      status: 'pending' as 'pending' | 'sent' | 'failed',
      wa_message_id: null as string | null,
      error: null as string | null,
      sent_at: null as string | null,
    }))
    await admin.from('campaign_recipients').insert(recipients)

    // ── Envío ─────────────────────────────────────────────────────────────
    const endpoint = `${GRAPH}/${creds.phoneId}/messages`
    let next = 0
    const worker = async () => {
      while (next < recipients.length) {
        const r = recipients[next++]
        const result = await postGraphMessage(endpoint, creds.token, buildTemplateMessage(template, params, r.phone))
        if (result.ok) {
          r.status = 'sent'
          r.wa_message_id = result.messageId
          r.sent_at = new Date().toISOString()
        } else {
          r.status = 'failed'
          r.error = result.error.slice(0, 500)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, recipients.length) }, worker))

    const sent = recipients.filter(r => r.status === 'sent')
    const failed = recipients.length - sent.length

    // ── Registro ──────────────────────────────────────────────────────────
    if (failed > 0) {
      await admin.rpc('release_campaign_messages', { p_company_id: companyId, p_period_start: periodStart, p_count: failed })
    }
    await admin.from('campaign_recipients').upsert(recipients, { onConflict: 'campaign_id,contact_id' })
    await admin
      .from('campaigns')
      .update({
        status: sent.length > 0 ? 'completed' : 'failed',
        sent_count: sent.length,
        failed_count: failed,
        finished_at: new Date().toISOString(),
      })
      .eq('id', campaign.id)

    if (sent.length > 0) {
      const texto = renderTemplateText(template, params)
      await admin.from('messages').insert(sent.map(r => ({
        company_id: companyId,
        patient_id: r.contact_id,
        content: texto,
        sender: 'admin',
        message_type: 'text',
        channel: 'whatsapp',
      })))
      const ahora = new Date().toISOString()
      for (let i = 0; i < sent.length; i += 200) {
        await admin
          .from('contacts')
          .update({ last_outbound_at: ahora })
          .eq('company_id', companyId)
          .in('id', sent.slice(i, i + 200).map(r => r.contact_id))
      }
    }

    const usage = await getCampaignUsage(admin, companyId)
    const firstError = recipients.find(r => r.status === 'failed')?.error ?? null
    return json(200, {
      success: true,
      campaign_id: campaign.id,
      sent: sent.length,
      failed,
      first_error: firstError,
      usage,
    })
  } catch (e) {
    return json(500, { success: false, error: errorMessage(e, 'Error inesperado al enviar la campaña') })
  }
}
