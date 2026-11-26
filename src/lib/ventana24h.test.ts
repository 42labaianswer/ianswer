import { describe, expect, it } from 'vitest'
import { estadoVentana, ultimoMensajeDelCliente } from './ventana24h'

const H = 3_600_000
const ahora = Date.parse('2026-11-26T19:00:00Z')

describe('ultimoMensajeDelCliente', () => {
  it('toma el mensaje más reciente del cliente e ignora los del negocio', () => {
    const t = ultimoMensajeDelCliente([
      { sender: 'patient', created_at: '2026-11-25T10:00:00Z' },
      { sender: 'admin', created_at: '2026-11-26T18:00:00Z' },
      { sender: 'patient', created_at: '2026-11-26T08:00:00Z' },
      { sender: 'asistente', created_at: '2026-11-26T18:30:00Z' },
    ])
    expect(t).toBe(Date.parse('2026-11-26T08:00:00Z'))
  })

  it('usa last_inbound_at si es más reciente que el historial cargado', () => {
    const t = ultimoMensajeDelCliente([{ sender: 'patient', created_at: '2026-11-20T10:00:00Z' }], '2026-11-26T12:00:00Z')
    expect(t).toBe(Date.parse('2026-11-26T12:00:00Z'))
  })

  it('sin mensajes del cliente devuelve null', () => {
    expect(ultimoMensajeDelCliente([{ sender: 'admin', created_at: '2026-11-26T10:00:00Z' }])).toBeNull()
    expect(ultimoMensajeDelCliente([], 'fecha inválida')).toBeNull()
    expect(ultimoMensajeDelCliente([{ sender: 'patient', created_at: null }])).toBeNull()
  })
})

describe('estadoVentana', () => {
  it('abierta con las horas que faltan (redondeadas hacia arriba)', () => {
    expect(estadoVentana(ahora - 2 * H, ahora)).toEqual({ abierta: true, horasRestantes: 22 })
    expect(estadoVentana(ahora - 23.5 * H, ahora)).toEqual({ abierta: true, horasRestantes: 1 })
  })

  it('cerrada pasadas 24 h o sin mensajes del cliente', () => {
    expect(estadoVentana(ahora - 24 * H, ahora)).toEqual({ abierta: false, horasRestantes: 0 })
    expect(estadoVentana(ahora - 72 * H, ahora)).toEqual({ abierta: false, horasRestantes: 0 })
    expect(estadoVentana(null, ahora)).toEqual({ abierta: false, horasRestantes: 0 })
  })
})
