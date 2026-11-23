import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAppBaseUrl } from '../../../../lib/appUrl'
import { sendEmail } from '../../../../lib/resend'
import { buildUsageAlertEmail, type UsageMetric } from '../../../../lib/emails/usage-emails'

// ============================================================================
// GET /api/cron/usage-alerts
// ----------------------------------------------------------------------------
// Manda por correo los avisos de consumo (80% y 100% de respuestas de IA,
// recordatorios y marketing) que la base dejó en usage_alerts. El aviso en
// el panel ya lo creó la base al momento; esto solo agrega el correo.
//
// Va al correo del primer usuario de la empresa (quien la registró).
// ============================================================================

export const dynamic = 'force-dynamic'

type AlertRow = {
  id: number
  company_id: string
  metric: UsageMetric
  threshold: 80 | 100
  used: number
  usage_limit: number
  period_start: string
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: alerts, error } = await supabase
    .from('usage_alerts')
    .select('id, company_id, metric, threshold, used, usage_limit, period_start')
    .is('emailed_at', null)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) {
    console.error('[Cron usage-alerts] Error leyendo avisos:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const plansUrl = `${getAppBaseUrl()}/dashboard/plans`
  let sent = 0
  let skipped = 0

  for (const alert of (alerts || []) as AlertRow[]) {
    // Si ya hay un aviso del 100% del mismo periodo, el del 80% sobra.
    const superseded = alert.threshold === 80 && (alerts as AlertRow[]).some(
      a => a.company_id === alert.company_id && a.metric === alert.metric
        && a.period_start === alert.period_start && a.threshold === 100,
    )

    const [{ data: company }, { data: owner }, { data: period }] = await Promise.all([
      supabase.from('companies').select('name').eq('id', alert.company_id).maybeSingle(),
      supabase.from('profiles').select('email').eq('company_id', alert.company_id)
        .not('email', 'is', null).order('created_at', { ascending: true }).limit(1).maybeSingle(),
      supabase.rpc('company_billing_period', { p_company_id: alert.company_id }),
    ])

    const email = (owner as { email: string | null } | null)?.email
    if (!superseded && email) {
      const periodRow = Array.isArray(period) ? period[0] : period
      const built = buildUsageAlertEmail({
        recipientEmail: email,
        companyName: (company as { name: string } | null)?.name || 'tu negocio',
        metric: alert.metric,
        threshold: alert.threshold,
        used: alert.used,
        limit: alert.usage_limit,
        periodEnd: periodRow?.period_end ?? null,
        plansUrl,
      })
      const result = await sendEmail({
        to: email,
        ...built,
        tags: [{ name: 'type', value: `usage_${alert.threshold}` }],
      })
      if (result.error) {
        console.error(`[Cron usage-alerts] No se mandó el aviso ${alert.id}:`, result.error)
        continue
      }
      sent++
    } else {
      skipped++
    }

    await supabase.from('usage_alerts').update({ emailed_at: new Date().toISOString() }).eq('id', alert.id)
  }

  return NextResponse.json({ ok: true, sent, skipped })
}
