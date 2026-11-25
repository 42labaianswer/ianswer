import { describe, expect, it } from 'vitest'
import {
  buildRescheduleMessage,
  conflictMessage,
  findConflict,
  fromMinutes,
  initialGoogleSync,
  isValidDate,
  isValidTime,
  parseCreateAppointment,
  parseRescheduleAppointment,
  toMinutes,
} from './appointments'

describe('toMinutes / fromMinutes', () => {
  it('convierte en ambos sentidos', () => {
    expect(toMinutes('09:30')).toBe(570)
    expect(toMinutes('09:30:00')).toBe(570)
    expect(fromMinutes(570)).toBe('09:30')
    expect(fromMinutes(5)).toBe('00:05')
  })
})

describe('isValidDate / isValidTime', () => {
  it('acepta solo fechas reales', () => {
    expect(isValidDate('2026-11-25')).toBe(true)
    expect(isValidDate('2026-02-30')).toBe(false)
    expect(isValidDate('25/11/2026')).toBe(false)
    expect(isValidDate(undefined)).toBe(false)
  })
  it('acepta HH:MM de 24 horas', () => {
    expect(isValidTime('00:00')).toBe(true)
    expect(isValidTime('23:59')).toBe(true)
    expect(isValidTime('24:00')).toBe(false)
    expect(isValidTime('9:00')).toBe(false)
    expect(isValidTime('09:00:00')).toBe(false)
  })
})

describe('findConflict', () => {
  const existing = [
    { id: 'a', appointment_time: '10:00:00', duration_minutes: 30 },
    { id: 'b', appointment_time: '12:00:00', duration_minutes: null },
  ]

  it('detecta bloques que se enciman', () => {
    expect(findConflict(existing, '10:15', 30)?.id).toBe('a')
    expect(findConflict(existing, '09:45', 30)?.id).toBe('a')
    expect(findConflict(existing, '12:20', 15)?.id).toBe('b')
  })

  it('permite bloques pegados', () => {
    expect(findConflict(existing, '10:30', 30)).toBeNull()
    expect(findConflict(existing, '09:30', 30)).toBeNull()
  })

  it('ignora la misma cita al reagendar', () => {
    expect(findConflict(existing, '10:00', 30, 'a')).toBeNull()
  })

  it('arma el mensaje con la hora de la cita que choca', () => {
    expect(conflictMessage(existing[0])).toContain('10:00')
  })
})

describe('parseCreateAppointment', () => {
  const base = { agendaId: 'ag1', date: '2026-12-01', time: '10:00', duration: 30 }

  it('acepta un cliente existente', () => {
    const r = parseCreateAppointment({ ...base, contactId: 'c1', notes: '  revisión  ' })
    expect(r).toEqual({ ok: true, value: { ...base, notes: 'revisión', contactId: 'c1', newClient: null } })
  })

  it('acepta un cliente nuevo y limpia el teléfono', () => {
    const r = parseCreateAppointment({ ...base, newClient: { name: ' Ana ', phone: '999-123-4567' } })
    expect(r.ok && r.value.newClient).toEqual({ name: 'Ana', phone: '9991234567' })
  })

  it('rechaza teléfonos que no son de 10 dígitos', () => {
    const r = parseCreateAppointment({ ...base, newClient: { name: 'Ana', phone: '529991234567' } })
    expect(r).toEqual({ ok: false, error: 'El WhatsApp del nuevo cliente debe tener 10 dígitos' })
  })

  it('pide nombre al cliente nuevo', () => {
    const r = parseCreateAppointment({ ...base, newClient: { name: ' ', phone: '9991234567' } })
    expect(r.ok).toBe(false)
  })

  it('valida agenda, fecha, hora y duración', () => {
    expect(parseCreateAppointment({ ...base, agendaId: '' , contactId: 'c1' }).ok).toBe(false)
    expect(parseCreateAppointment({ ...base, date: '2026-13-01', contactId: 'c1' }).ok).toBe(false)
    expect(parseCreateAppointment({ ...base, time: '25:00', contactId: 'c1' }).ok).toBe(false)
    expect(parseCreateAppointment({ ...base, duration: 0, contactId: 'c1' }).ok).toBe(false)
    expect(parseCreateAppointment({ ...base, time: '23:45', duration: 30, contactId: 'c1' }).ok).toBe(false)
    expect(parseCreateAppointment(null).ok).toBe(false)
  })
})

describe('parseRescheduleAppointment', () => {
  it('solo avisa al cliente si se pide explícitamente', () => {
    const r = parseRescheduleAppointment({ date: '2026-12-01', time: '11:00', duration: 45, notifyPatient: 'yes' })
    expect(r).toEqual({ ok: true, value: { date: '2026-12-01', time: '11:00', duration: 45, notifyPatient: false } })
  })
})

describe('initialGoogleSync', () => {
  it('marca pendiente solo si la agenda tiene Google', () => {
    expect(initialGoogleSync(true)).toBe('pending')
    expect(initialGoogleSync(false)).toBe('skipped')
  })
})

describe('buildRescheduleMessage', () => {
  it('usa el primer nombre, la marca y ambas fechas', () => {
    const msg = buildRescheduleMessage({
      patientName: 'Ana López', brandName: 'Clínica Sol',
      oldDate: '2026-12-01', oldTime: '10:00:00', newDate: '2026-12-02', newTime: '11:30',
    })
    expect(msg).toContain('Hola Ana, Clínica Sol ha movido tu cita.')
    expect(msg).toMatch(/Antes: .*1.*diciembre a las 10:00/)
    expect(msg).toMatch(/Ahora: .*2.*diciembre a las 11:30/)
  })

  it('tiene respaldo sin nombre ni marca', () => {
    const msg = buildRescheduleMessage({
      patientName: null, brandName: null,
      oldDate: '2026-12-01', oldTime: '10:00', newDate: '2026-12-02', newTime: '11:30',
    })
    expect(msg.startsWith('Hola, el equipo ha movido tu cita.')).toBe(true)
  })
})
