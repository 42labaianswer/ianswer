// Reglas de la pantalla de inicio del panel (diseño de Figma, nov 2026):
// saludo, tiempo relativo, conversaciones recientes, semana del calendario y
// próximas citas. Sin React para poder probarlas.

export function greeting(now: Date = new Date()): string {
  const h = now.getHours()
  if (h < 12) return 'Buen día'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

/**
 * Primer nombre para el saludo, o '' si el nombre guardado no sirve (vacío o
 * con forma de correo, como "ianswer.ai.dev"): entonces se usa el del negocio.
 */
export function greetingName(fullName: string | null | undefined): string {
  const first = (fullName || '').trim().split(/\s+/)[0] || ''
  if (!first || /[@.\d_]/.test(first)) return ''
  return first.charAt(0).toUpperCase() + first.slice(1)
}

export function initials(name: string | null | undefined): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Color de avatar estable por nombre (paleta de iconos del sistema de diseño). */
const AVATAR_COLORS = ['#5A89F0', '#5ACAF0', '#F0C35A', '#B66748', '#2B606F', '#1D571A']
export function avatarColor(seed: string | null | undefined): string {
  const s = seed || ''
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime())
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'ayer' : `hace ${days} días`
}

export type MessageRow = { patient_id: string | null; content: string | null; sender: string | null; created_at: string }
export type Conversation = { patientId: string; lastMessage: string; lastAt: string; waitingReply: boolean }

/**
 * Conversaciones más recientes a partir de mensajes ordenados del más nuevo
 * al más viejo: una por contacto. waitingReply = el último mensaje es del
 * cliente (nadie le ha contestado).
 */
export function recentConversations(messages: MessageRow[], limit = 3): Conversation[] {
  const seen = new Set<string>()
  const out: Conversation[] = []
  for (const m of messages) {
    if (!m.patient_id || seen.has(m.patient_id)) continue
    seen.add(m.patient_id)
    out.push({
      patientId: m.patient_id,
      lastMessage: (m.content || '').trim(),
      lastAt: m.created_at,
      waitingReply: m.sender === 'patient',
    })
    if (out.length >= limit) break
  }
  return out
}

/** Fecha local como AAAA-MM-DD (así guarda la base appointment_date). */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Los 7 días de la semana (lunes a domingo) que contiene `now`. */
export function weekDays(now: Date = new Date()): Date[] {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i))
}

export type AppointmentRow = {
  id: string
  appointment_date: string
  appointment_time: string
  status: string | null
  patient_name: string | null
  notes: string | null
  duration_minutes?: number | null
}

const INACTIVE = new Set(['cancelled', 'canceled', 'no_show', 'completed'])

export function isActiveAppointment(a: AppointmentRow): boolean {
  return !INACTIVE.has((a.status || '').toLowerCase())
}

function startOf(a: AppointmentRow): Date {
  const [y, mo, d] = a.appointment_date.split('-').map(Number)
  const [h, mi] = a.appointment_time.split(':').map(Number)
  return new Date(y, mo - 1, d, h, mi || 0)
}

/** Próximas citas activas desde ahora, en orden. */
export function upcomingAppointments(rows: AppointmentRow[], now: Date = new Date(), limit = 3) {
  return rows
    .filter(isActiveAppointment)
    .map(a => ({ ...a, start: startOf(a) }))
    .filter(a => a.start.getTime() >= now.getTime() - 5 * 60_000)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, limit)
}

/** "En 20 minutos", "En 2 h", "Mañana", "Jue 28 nov". */
export function startsIn(start: Date, now: Date = new Date()): string {
  const min = Math.round((start.getTime() - now.getTime()) / 60_000)
  if (min <= 0) return 'Ahora'
  if (min < 60) return `En ${min} minutos`
  if (ymd(start) === ymd(now)) return `En ${Math.round(min / 60)} h`
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  if (ymd(start) === ymd(tomorrow)) return 'Mañana'
  return start.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Horas que muestra la cuadrícula: de 8 a 16 como mínimo, ampliando a las citas de la semana. */
export function gridHours(rows: AppointmentRow[]): number[] {
  let from = 8
  let to = 16
  for (const a of rows) {
    const h = Number(a.appointment_time.split(':')[0])
    if (Number.isFinite(h)) { from = Math.min(from, h); to = Math.max(to, h) }
  }
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}
