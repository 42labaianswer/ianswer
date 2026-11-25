// Forma de los eventos del calendario y operaciones sobre el caché de TanStack
// Query ('calendarSpecifics'), para que el BookingModal pinte la cita al
// instante y la quite si el servidor la rechaza.

import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { fromMinutes, toMinutes, type GoogleSyncStatus } from './appointments'

export type CalendarEvent = {
  id: string
  date: string
  time: string
  rawTime: string
  startMins: number
  endMins: number
  title: string
  status: string
  motivo: string
  appointmentId?: string
  patientId?: string
  patientPhone?: string
  duration?: number
  source?: 'google_only' | 'supabase' | 'both'
  googleSync?: GoogleSyncStatus | null
  /** Pintada en el navegador mientras el servidor confirma. */
  optimistic?: boolean
}

export type CalendarCache = { workingHours: unknown[]; disabledSlots: unknown[]; events: CalendarEvent[] }

export type AppointmentRow = {
  id: string
  patient_id: string | null
  appointment_date: string
  appointment_time: string | null
  status: string | null
  duration_minutes: number | null
  notes: string | null
  google_event_id: string | null
  google_sync?: GoogleSyncStatus | null
}

/** Fila de appointments -> evento del calendario. */
export function eventFromAppointment(
  a: AppointmentRow,
  contact: { name: string | null; phone: string | null } | null
): CalendarEvent {
  const startMins = toMinutes(a.appointment_time || '00:00:00')
  const duration = a.duration_minutes || 30
  const time = fromMinutes(startMins)
  return {
    id: a.id,
    date: a.appointment_date,
    time,
    rawTime: time,
    startMins,
    endMins: startMins + duration,
    title: contact?.name || 'Paciente',
    status: a.status || 'confirmed',
    motivo: a.notes || '',
    appointmentId: a.id,
    patientId: a.patient_id ?? undefined,
    patientPhone: contact?.phone || a.patient_id || undefined,
    duration,
    source: a.google_event_id ? 'both' : 'supabase',
    googleSync: a.google_sync ?? null,
  }
}

/** Mueve el evento a otra fecha/hora/duración. */
export function rescheduledEvent(ev: CalendarEvent, date: string, time: string, duration: number): CalendarEvent {
  const startMins = toMinutes(time)
  return { ...ev, date, time, rawTime: time, startMins, endMins: startMins + duration, duration }
}

/** Agrega el evento o reemplaza el que tenga `replaceId` (o su mismo id). */
export function withEvent(events: CalendarEvent[], ev: CalendarEvent, replaceId?: string): CalendarEvent[] {
  const target = replaceId ?? ev.id
  const rest = events.filter(e => e.id !== target)
  return [...rest, ev]
}

export function mapEvents(
  events: CalendarEvent[],
  appointmentId: string,
  update: (ev: CalendarEvent) => CalendarEvent
): CalendarEvent[] {
  return events.map(e => (e.appointmentId === appointmentId ? update(e) : e))
}

export type CalendarSnapshot = Array<[QueryKey, CalendarCache | undefined]>

const agendaKey = (agendaId: string) => ['calendarSpecifics', agendaId]

/** Detiene los refetch en curso y guarda el caché de la agenda para poder deshacer. */
export async function snapshotCalendar(qc: QueryClient, agendaId: string): Promise<CalendarSnapshot> {
  await qc.cancelQueries({ queryKey: agendaKey(agendaId) })
  return qc.getQueriesData<CalendarCache>({ queryKey: agendaKey(agendaId) })
}

export function restoreCalendar(qc: QueryClient, snapshot: CalendarSnapshot | undefined) {
  snapshot?.forEach(([key, data]) => qc.setQueryData(key, data))
}

export function updateCalendarEvents(
  qc: QueryClient,
  agendaId: string,
  update: (events: CalendarEvent[]) => CalendarEvent[]
) {
  qc.setQueriesData<CalendarCache>({ queryKey: agendaKey(agendaId) }, old => (old ? { ...old, events: update(old.events) } : old))
}
