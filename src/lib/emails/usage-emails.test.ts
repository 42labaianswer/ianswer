import { describe, expect, it } from 'vitest'
import { buildUsageAlertEmail, type UsageAlertEmailParams } from './usage-emails'

const base: UsageAlertEmailParams = {
  recipientEmail: 'dueno@negocio.mx',
  companyName: 'Clínica <Sonrisa>',
  metric: 'ai_replies',
  threshold: 80,
  used: 1200,
  limit: 1500,
  periodEnd: '2026-11-28T18:00:00Z',
  plansUrl: 'https://www.ianswer.pro/dashboard/plans',
}

describe('buildUsageAlertEmail', () => {
  it('al 80% avisa lo que pasará al llegar al 100%', () => {
    const email = buildUsageAlertEmail(base)
    expect(email.subject).toBe('Llevas el 80% de tus respuestas de IA')
    expect(email.text).toContain('Usaste 1,200 de 1,500 respuestas de IA de este periodo.')
    expect(email.text).toContain('Al llegar al 100%, tu asistente deja de contestar')
    expect(email.text).toContain(base.plansUrl)
    expect(email.html).toContain(base.plansUrl)
  })

  it('al 100% dice qué se detuvo y hasta cuándo', () => {
    const email = buildUsageAlertEmail({ ...base, threshold: 100, used: 1500 })
    expect(email.subject).toBe('Se acabaron tus respuestas de IA del periodo')
    expect(email.text).toContain('dejó de contestar')
    expect(email.text).toContain('hasta el 28 de noviembre')
  })

  it('sin fecha de fin dice que sigue hasta el reinicio', () => {
    const email = buildUsageAlertEmail({ ...base, threshold: 100, periodEnd: null })
    expect(email.text).toContain('hasta que se reinicie tu periodo')
  })

  it('usa el texto de cada métrica', () => {
    const reminders = buildUsageAlertEmail({ ...base, metric: 'reminders', threshold: 100 })
    expect(reminders.subject).toBe('Se acabaron tus recordatorios del periodo')
    expect(reminders.text).toContain('Los recordatorios de cita quedaron en pausa.')

    const marketing = buildUsageAlertEmail({ ...base, metric: 'campaign_messages' })
    expect(marketing.subject).toBe('Llevas el 80% de tus mensajes de marketing')
    expect(marketing.text).toContain('ya no se podrán enviar más campañas')
  })

  it('la nota del inbox solo sale en respuestas de IA', () => {
    expect(buildUsageAlertEmail(base).html).toContain('desde el inbox no cuentan')
    expect(buildUsageAlertEmail({ ...base, metric: 'reminders' }).html).not.toContain('desde el inbox')
  })

  it('escapa el nombre de la empresa en el HTML', () => {
    const email = buildUsageAlertEmail(base)
    expect(email.html).not.toContain('<Sonrisa>')
    expect(email.text).toContain('Clínica <Sonrisa>')
  })
})
