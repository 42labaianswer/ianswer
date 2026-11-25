// Reglas de las citas que agenda el equipo desde el dashboard. Las usa la API
// (/api/appointments) y el BookingModal, para que el navegador y el servidor
// validen lo mismo.

export type GoogleSyncStatus = 'pending' | 'synced' | 'failed' | 'skipped'

export const MAX_DURATION_MINUTES = 8 * 60

/** Columnas de appointments que devuelve la API al dashboard. */
export const APPOINTMENT_FIELDS =
  'id, agenda_id, patient_id, appointment_date, appointment_time, status, duration_minutes, notes, google_event_id, google_sync, source'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** 'HH:MM' o 'HH:MM:SS' -> minutos desde medianoche. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** minutos desde medianoche -> 'HH:MM'. */
export function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60).toString().padStart(2, '0')
  const m = (mins % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

export function isValidDate(date: unknown): date is string {
  if (typeof date !== 'string' || !DATE_RE.test(date)) return false
  const d = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(date)
}

export function isValidTime(time: unknown): time is string {
  return typeof time === 'string' && TIME_RE.test(time)
}

export interface ExistingSlot {
  id: string
  appointment_time: string
  duration_minutes: number | null
}

/** Primera cita del mismo día que se encima con el bloque pedido, o null. */
export function findConflict(
  existing: ExistingSlot[],
  time: string,
  duration: number,
  ignoreId?: string
): ExistingSlot | null {
  const start = toMinutes(time)
  const end = start + duration
  return existing.find(a => {
    if (ignoreId && a.id === ignoreId) return false
    const aStart = toMinutes(a.appointment_time)
    const aEnd = aStart + (a.duration_minutes || 30)
    return aStart < end && aEnd > start
  }) ?? null
}

export function conflictMessage(slot: ExistingSlot): string {
  return `El bloque elegido choca con la cita de las ${fromMinutes(toMinutes(slot.appointment_time))}. Cambia la hora o reduce la duración.`
}

export type NewClient = { name: string; phone: string }

export interface CreateAppointmentInput {
  agendaId: string
  date: string
  time: string
  duration: number
  notes: string
  contactId: string | null
  newClient: NewClient | null
}

export interface RescheduleAppointmentInput {
  date: string
  time: string
  duration: number
  notifyPatient: boolean
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

function parseSlot(body: Record<string, unknown>): Parsed<{ date: string; time: string; duration: number }> {
  if (!isValidDate(body.date)) return { ok: false, error: 'Selecciona una fecha válida' }
  if (!isValidTime(body.time)) return { ok: false, error: 'Selecciona una hora válida' }
  const duration = Number(body.duration)
  if (!Number.isInteger(duration) || duration < 5 || duration > MAX_DURATION_MINUTES) {
    return { ok: false, error: 'La duración debe estar entre 5 minutos y 8 horas' }
  }
  if (toMinutes(body.time) + duration > 24 * 60) {
    return { ok: false, error: 'La cita no puede terminar después de la medianoche' }
  }
  return { ok: true, value: { date: body.date, time: body.time, duration } }
}

export function parseCreateAppointment(raw: unknown): Parsed<CreateAppointmentInput> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (typeof body.agendaId !== 'string' || !body.agendaId) return { ok: false, error: 'Falta la agenda' }

  const slot = parseSlot(body)
  if (!slot.ok) return slot

  const contactId = typeof body.contactId === 'string' && body.contactId ? body.contactId : null
  let newClient: NewClient | null = null
  if (!contactId) {
    const nc = (body.newClient && typeof body.newClient === 'object' ? body.newClient : {}) as Record<string, unknown>
    const name = typeof nc.name === 'string' ? nc.name.trim() : ''
    const phone = typeof nc.phone === 'string' ? nc.phone.replace(/\D/g, '') : ''
    if (!name) return { ok: false, error: 'Escribe el nombre del nuevo cliente' }
    if (phone.length !== 10) return { ok: false, error: 'El WhatsApp del nuevo cliente debe tener 10 dígitos' }
    newClient = { name: name.slice(0, 120), phone }
  }

  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : ''
  return { ok: true, value: { agendaId: body.agendaId, ...slot.value, notes, contactId, newClient } }
}

export function parseRescheduleAppointment(raw: unknown): Parsed<RescheduleAppointmentInput> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const slot = parseSlot(body)
  if (!slot.ok) return slot
  return { ok: true, value: { ...slot.value, notifyPatient: body.notifyPatient === true } }
}

/** Estado inicial de la sincronización con Google según la agenda. */
export function initialGoogleSync(agendaHasGoogle: boolean): GoogleSyncStatus {
  return agendaHasGoogle ? 'pending' : 'skipped'
}

function formatLongDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('es-MX', {
    weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC',
  })
}

/** Mensaje de WhatsApp que recibe el cliente cuando el equipo mueve su cita. */
export function buildRescheduleMessage(input: {
  patientName: string | null
  brandName: string | null
  oldDate: string
  oldTime: string
  newDate: string
  newTime: string
}): string {
  const firstName = (input.patientName || '').trim().split(/\s+/)[0] || 'Hola'
  const brand = (input.brandName || '').trim() || 'el equipo'
  const greeting = firstName === 'Hola' ? 'Hola' : `Hola ${firstName}`
  return [
    `${greeting}, ${brand} ha movido tu cita.`,
    '',
    `Antes: ${formatLongDate(input.oldDate)} a las ${input.oldTime.slice(0, 5)}`,
    `Ahora: ${formatLongDate(input.newDate)} a las ${input.newTime.slice(0, 5)}`,
    '',
    '¿Confirmas? Si tienes alguna duda, contáctanos.',
  ].join('\n')
}
