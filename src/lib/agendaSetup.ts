// Horario inicial de una agenda y verificación de acceso a Google Calendar.

export const DAYS_OF_WEEK = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export const DEFAULT_HOURS = {
  start_time: '09:00',
  end_time: '18:00',
  slot_duration: 30,
  has_break: false,
  break_start_time: '13:00',
  break_end_time: '14:00',
}

/** Semana de lunes a viernes de 9 a 6; sábado y domingo cerrados. */
export function defaultWeek() {
  return DAYS_OF_WEEK.map((_, day) => ({
    day_of_week: day,
    ...DEFAULT_HOURS,
    is_active: day > 0 && day < 6,
  }))
}

/**
 * URL del webhook que verifica el acceso. Usa la configurada en Panel Admin y,
 * si no hay, la deriva de la de obtener calendario (mismo servidor de n8n).
 */
export function calendarVerifyUrl(settings: { n8n_webhook_calendar_verify?: string | null, n8n_webhook_calendar?: string | null }) {
  const verify = settings.n8n_webhook_calendar_verify?.trim()
  if (verify) return verify
  const calendar = settings.n8n_webhook_calendar?.trim()
  if (calendar?.includes('obtener-calendario')) return calendar.replace('obtener-calendario', 'verificar-calendario')
  return ''
}

export type VerifyResult = { ok: true } | { ok: false, message: string }

const GENERIC_DENIED = 'Google no dio acceso al calendario. Revisa que esté compartido con el correo de iAnswer con permiso de Realizar cambios en los eventos y que el ID sea correcto.'

/** Interpreta la respuesta del flujo "Verificador de Calendarios" de n8n. */
export function parseVerifyResponse(status: number, text: string): VerifyResult {
  let body: { status?: string, hint?: string } | null = null
  try { body = JSON.parse(text) } catch { body = null }

  if (status >= 200 && status < 300 && (body?.status === 'ok' || (!body && text.includes('ok')))) return { ok: true }
  if (body?.hint) return { ok: false, message: `${body.hint}.` }
  if (status === 404) return { ok: false, message: 'El servicio de verificación no está disponible en este momento. Intenta más tarde.' }
  return { ok: false, message: GENERIC_DENIED }
}
