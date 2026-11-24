import { describe, expect, it } from 'vitest'
import { calendarVerifyUrl, defaultWeek, parseVerifyResponse } from './agendaSetup'

describe('defaultWeek', () => {
  it('abre de lunes a viernes de 9 a 6', () => {
    const week = defaultWeek()
    expect(week).toHaveLength(7)
    expect(week.filter(d => d.is_active).map(d => d.day_of_week)).toEqual([1, 2, 3, 4, 5])
    expect(week[1]).toMatchObject({ start_time: '09:00', end_time: '18:00', slot_duration: 30 })
  })
})

describe('calendarVerifyUrl', () => {
  it('prefiere la URL de verificación configurada', () => {
    expect(calendarVerifyUrl({ n8n_webhook_calendar_verify: ' https://n8n/x/verificar ', n8n_webhook_calendar: 'https://n8n/obtener-calendario' }))
      .toBe('https://n8n/x/verificar')
  })

  it('la deriva de la de obtener calendario si no hay', () => {
    expect(calendarVerifyUrl({ n8n_webhook_calendar: 'https://n8n/webhook/obtener-calendario' }))
      .toBe('https://n8n/webhook/verificar-calendario')
  })

  it('sin forma de derivarla no inventa una', () => {
    expect(calendarVerifyUrl({ n8n_webhook_calendar: 'https://n8n/webhook/otra-cosa' })).toBe('')
    expect(calendarVerifyUrl({})).toBe('')
  })
})

describe('parseVerifyResponse', () => {
  it('ok cuando n8n responde status ok', () => {
    expect(parseVerifyResponse(200, '{"status":"ok"}')).toEqual({ ok: true })
    expect(parseVerifyResponse(200, 'ok')).toEqual({ ok: true })
  })

  it('usa la pista de n8n cuando Google niega el acceso', () => {
    expect(parseVerifyResponse(400, '{"status":"error","hint":"Sin permisos. Comparte el calendario con la cuenta de servicio"}'))
      .toEqual({ ok: false, message: 'Sin permisos. Comparte el calendario con la cuenta de servicio.' })
  })

  it('distingue el webhook caído de un permiso negado', () => {
    const down = parseVerifyResponse(404, 'not registered')
    const denied = parseVerifyResponse(500, '')
    expect(down.ok).toBe(false)
    expect(denied.ok).toBe(false)
    if (!down.ok && !denied.ok) {
      expect(down.message).toMatch(/no está disponible/)
      expect(denied.message).toMatch(/compartido/)
    }
  })

  it('un 200 sin status ok no cuenta como verificado', () => {
    expect(parseVerifyResponse(200, '{"status":"error"}').ok).toBe(false)
  })
})
