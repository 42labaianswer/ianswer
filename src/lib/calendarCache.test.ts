import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import {
  eventFromAppointment,
  mapEvents,
  rescheduledEvent,
  restoreCalendar,
  snapshotCalendar,
  updateCalendarEvents,
  withEvent,
  type CalendarCache,
  type CalendarEvent,
} from './calendarCache'

const row = {
  id: 'apt1',
  patient_id: 'c1',
  appointment_date: '2026-12-01',
  appointment_time: '09:05:00',
  status: 'confirmed',
  duration_minutes: 45,
  notes: 'Revisión',
  google_event_id: null,
  google_sync: 'pending' as const,
}

describe('eventFromAppointment', () => {
  it('arma el evento con horas, duración y estado de Google', () => {
    const ev = eventFromAppointment(row, { name: 'Ana', phone: '5219991234567' })
    expect(ev).toMatchObject({
      id: 'apt1', appointmentId: 'apt1', date: '2026-12-01', time: '09:05',
      startMins: 545, endMins: 590, duration: 45, title: 'Ana', motivo: 'Revisión',
      patientPhone: '5219991234567', source: 'supabase', googleSync: 'pending',
    })
  })

  it('usa respaldos cuando faltan datos', () => {
    const ev = eventFromAppointment({ ...row, duration_minutes: null, google_event_id: 'g1' }, null)
    expect(ev).toMatchObject({ title: 'Paciente', duration: 30, patientPhone: 'c1', source: 'both' })
  })
})

describe('eventFromAppointment con filas incompletas', () => {
  it('usa medianoche, confirmed y sin teléfono cuando faltan', () => {
    const ev = eventFromAppointment(
      { ...row, appointment_time: null, status: null, patient_id: null, google_sync: undefined },
      { name: null, phone: null }
    )
    expect(ev).toMatchObject({ time: '00:00', startMins: 0, status: 'confirmed', title: 'Paciente', googleSync: null })
    expect(ev.patientId).toBeUndefined()
    expect(ev.patientPhone).toBeUndefined()
  })
})

describe('withEvent / mapEvents / rescheduledEvent', () => {
  const temp: CalendarEvent = { ...eventFromAppointment(row, null), id: 'temp-1', appointmentId: undefined, optimistic: true }

  it('reemplaza el evento temporal por el guardado', () => {
    const saved = eventFromAppointment(row, null)
    const events = withEvent(withEvent([], temp), saved, 'temp-1')
    expect(events.map(e => e.id)).toEqual(['apt1'])
  })

  it('mueve solo la cita indicada', () => {
    const other = { ...eventFromAppointment(row, null), id: 'apt2', appointmentId: 'apt2' }
    const events = mapEvents([eventFromAppointment(row, null), other], 'apt1', ev => rescheduledEvent(ev, '2026-12-03', '11:00', 30))
    expect(events[0]).toMatchObject({ date: '2026-12-03', time: '11:00', startMins: 660, endMins: 690, duration: 30 })
    expect(events[1].date).toBe('2026-12-01')
  })
})

describe('caché de calendarSpecifics', () => {
  it('agrega a todos los meses de la agenda y se puede deshacer', async () => {
    const qc = new QueryClient()
    const empty: CalendarCache = { workingHours: [], disabledSlots: [], events: [] }
    qc.setQueryData(['calendarSpecifics', 'ag1', 2026, 11], empty)
    qc.setQueryData(['calendarSpecifics', 'ag2', 2026, 11], empty)

    const snapshot = await snapshotCalendar(qc, 'ag1')
    updateCalendarEvents(qc, 'ag1', evs => withEvent(evs, eventFromAppointment(row, null)))

    expect(qc.getQueryData<CalendarCache>(['calendarSpecifics', 'ag1', 2026, 11])?.events).toHaveLength(1)
    expect(qc.getQueryData<CalendarCache>(['calendarSpecifics', 'ag2', 2026, 11])?.events).toHaveLength(0)

    updateCalendarEvents(qc, 'ag3', evs => withEvent(evs, eventFromAppointment(row, null)))
    expect(qc.getQueryData(['calendarSpecifics', 'ag3', 2026, 11])).toBeUndefined()
    restoreCalendar(qc, undefined)

    restoreCalendar(qc, snapshot)
    expect(qc.getQueryData<CalendarCache>(['calendarSpecifics', 'ag1', 2026, 11])?.events).toHaveLength(0)
  })
})
