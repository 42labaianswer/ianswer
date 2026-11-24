import { describe, expect, it } from 'vitest'
import {
  avatarColor, greeting, greetingName, gridHours, initials, isActiveAppointment, recentConversations,
  startsIn, timeAgo, upcomingAppointments, weekDays, ymd, type AppointmentRow,
} from './dashboardHome'

const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi)

describe('greeting', () => {
  it('cambia según la hora', () => {
    expect(greeting(local(2026, 11, 24, 9))).toBe('Buen día')
    expect(greeting(local(2026, 11, 24, 15))).toBe('Buenas tardes')
    expect(greeting(local(2026, 11, 24, 21))).toBe('Buenas noches')
  })
})

describe('initials y avatarColor', () => {
  it('toma primera y última palabra', () => {
    expect(initials('Olivia Bennett')).toBe('OB')
    expect(initials('Ana María López')).toBe('AL')
    expect(initials('Pepe')).toBe('P')
    expect(initials('')).toBe('?')
  })
  it('el color es estable para el mismo nombre', () => {
    expect(avatarColor('Olivia')).toBe(avatarColor('Olivia'))
    expect(avatarColor(null)).toMatch(/^#/)
  })
})

describe('timeAgo', () => {
  const now = new Date('2026-11-24T18:00:00Z')
  it('minutos, horas y días', () => {
    expect(timeAgo('2026-11-24T17:59:40Z', now)).toBe('ahora')
    expect(timeAgo('2026-11-24T17:55:00Z', now)).toBe('hace 5 min')
    expect(timeAgo('2026-11-24T15:00:00Z', now)).toBe('hace 3 h')
    expect(timeAgo('2026-11-23T15:00:00Z', now)).toBe('ayer')
    expect(timeAgo('2026-11-20T15:00:00Z', now)).toBe('hace 4 días')
  })
})

describe('recentConversations', () => {
  it('una por contacto, la más nueva, y marca si espera respuesta', () => {
    const rows = [
      { patient_id: 'a', content: 'Hola', sender: 'patient', created_at: '3' },
      { patient_id: 'a', content: 'viejo', sender: 'asistente', created_at: '2' },
      { patient_id: 'b', content: 'Listo', sender: 'asistente', created_at: '1' },
      { patient_id: null, content: 'x', sender: 'patient', created_at: '0' },
    ]
    expect(recentConversations(rows)).toEqual([
      { patientId: 'a', lastMessage: 'Hola', lastAt: '3', waitingReply: true },
      { patientId: 'b', lastMessage: 'Listo', lastAt: '1', waitingReply: false },
    ])
    expect(recentConversations(rows, 1)).toHaveLength(1)
  })
})

describe('semana y fechas', () => {
  it('ymd usa la fecha local', () => {
    expect(ymd(local(2026, 1, 5))).toBe('2026-01-05')
  })
  it('weekDays va de lunes a domingo', () => {
    const days = weekDays(local(2026, 11, 26)) // jueves
    expect(days).toHaveLength(7)
    expect(ymd(days[0])).toBe('2026-11-23')
    expect(ymd(days[6])).toBe('2026-11-29')
    expect(ymd(weekDays(local(2026, 11, 29))[0])).toBe('2026-11-23') // domingo
  })
})

const appt = (over: Partial<AppointmentRow>): AppointmentRow => ({
  id: Math.random().toString(), appointment_date: '2026-11-24', appointment_time: '10:00:00',
  status: 'scheduled', patient_name: 'X', notes: null, ...over,
})

describe('citas', () => {
  const now = local(2026, 11, 24, 9, 40)
  it('no cuenta canceladas ni completadas', () => {
    expect(isActiveAppointment(appt({ status: 'cancelled' }))).toBe(false)
    expect(isActiveAppointment(appt({ status: 'completed' }))).toBe(false)
    expect(isActiveAppointment(appt({ status: null }))).toBe(true)
  })
  it('próximas en orden, desde ahora', () => {
    const rows = [
      appt({ id: 'tarde', appointment_time: '16:00:00' }),
      appt({ id: 'pasada', appointment_time: '08:00:00' }),
      appt({ id: 'pronto', appointment_time: '10:00:00' }),
      appt({ id: 'cancelada', appointment_time: '11:00:00', status: 'cancelled' }),
      appt({ id: 'manana', appointment_date: '2026-11-25', appointment_time: '09:00:00' }),
    ]
    expect(upcomingAppointments(rows, now).map(a => a.id)).toEqual(['pronto', 'tarde', 'manana'])
  })
  it('startsIn', () => {
    expect(startsIn(local(2026, 11, 24, 10, 0), now)).toBe('En 20 minutos')
    expect(startsIn(local(2026, 11, 24, 13, 0), now)).toBe('En 3 h')
    expect(startsIn(local(2026, 11, 25, 9, 0), now)).toBe('Mañana')
    expect(startsIn(local(2026, 11, 24, 9, 0), now)).toBe('Ahora')
  })
  it('gridHours va de 8 a 16 y se amplía con las citas', () => {
    expect(gridHours([])).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16])
    const h = gridHours([appt({ appointment_time: '07:30:00' }), appt({ appointment_time: '18:00:00' })])
    expect(h[0]).toBe(7)
    expect(h[h.length - 1]).toBe(18)
  })
})

describe('greetingName', () => {
  it('usa el primer nombre', () => {
    expect(greetingName('xavier Toledo')).toBe('Xavier')
  })
  it('descarta nombres con forma de correo o vacíos', () => {
    expect(greetingName('ianswer.ai.dev')).toBe('')
    expect(greetingName('ruben@ianswer.pro')).toBe('')
    expect(greetingName(null)).toBe('')
  })
})
