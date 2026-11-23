// Consumo del periodo de cobro (get_usage_summary). Lo usan el medidor de
// Mi Plan y el panel admin.

export type UsageMetricKey = 'ai_replies' | 'reminders' | 'campaign_messages'

export type UsageMetric = { used: number; limit: number | null }

export type UsageSummary = {
  period_start: string
  period_end: string
  metrics: Partial<Record<UsageMetricKey, UsageMetric>>
}

export const USAGE_METRICS: { key: UsageMetricKey; label: string; inSentence: string; atLimit: string }[] = [
  {
    key: 'ai_replies',
    label: 'Respuestas de IA',
    inSentence: 'respuestas de IA',
    atLimit: 'Tu asistente dejó de contestar y las conversaciones nuevas pasan a tu equipo.',
  },
  {
    key: 'reminders',
    label: 'Recordatorios',
    inSentence: 'recordatorios',
    atLimit: 'Los recordatorios de cita están en pausa.',
  },
  {
    key: 'campaign_messages',
    label: 'Mensajes de marketing',
    inSentence: 'mensajes de marketing',
    atLimit: 'Ya no puedes enviar más campañas en este periodo.',
  },
]

export type MeterLevel = 'ok' | 'near' | 'full'

export type MeterState = {
  used: number
  limit: number
  remaining: number
  /** 0–100, para el ancho de la barra. */
  pct: number
  level: MeterLevel
}

/** null cuando la métrica no tiene límite (no se muestra la barra). */
export function meterState(metric: UsageMetric | undefined): MeterState | null {
  if (!metric || !metric.limit || metric.limit <= 0) return null
  const used = Math.max(metric.used || 0, 0)
  const limit = metric.limit
  const pct = Math.min((used / limit) * 100, 100)
  return {
    used,
    limit,
    remaining: Math.max(limit - used, 0),
    pct,
    level: used >= limit ? 'full' : pct >= 80 ? 'near' : 'ok',
  }
}

/** Días que faltan para que se reinicie el periodo (mínimo 0). */
export function daysUntil(iso: string, now: Date = new Date()): number {
  return Math.max(Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000), 0)
}
