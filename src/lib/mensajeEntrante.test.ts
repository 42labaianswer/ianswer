import { afterEach, describe, expect, it } from 'vitest'
import { debeAvisar, setChatAbierto, vistaPreviaMensaje } from './mensajeEntrante'

afterEach(() => setChatAbierto(null))

describe('vistaPreviaMensaje', () => {
  it('texto: junta espacios y saltos de línea', () => {
    expect(vistaPreviaMensaje({ content: '  Hola\n\n¿tienen   lugar? ', message_type: 'text' })).toBe('Hola ¿tienen lugar?')
  })

  it('texto largo: lo corta con puntos suspensivos', () => {
    const v = vistaPreviaMensaje({ content: 'a'.repeat(300) })
    expect(v).toHaveLength(120)
    expect(v.endsWith('…')).toBe(true)
  })

  it('sin texto', () => {
    expect(vistaPreviaMensaje({ content: '   ' })).toBe('Mensaje nuevo')
    expect(vistaPreviaMensaje({})).toBe('Mensaje nuevo')
  })

  it('audio e imagen', () => {
    expect(vistaPreviaMensaje({ message_type: 'audio', content: '🎤 [Nota de voz] hola' })).toBe('Nota de voz')
    expect(vistaPreviaMensaje({ message_type: 'image', media_caption: ' Mi pedido ' })).toBe('Mi pedido')
    expect(vistaPreviaMensaje({ message_type: 'image' })).toBe('Imagen')
  })
})

describe('debeAvisar', () => {
  it('solo mensajes del cliente', () => {
    expect(debeAvisar({ sender: 'patient', patient_id: '521999' })).toBe(true)
    expect(debeAvisar({ sender: 'asistente', patient_id: '521999' })).toBe(false)
    expect(debeAvisar({ sender: 'admin', patient_id: '521999' })).toBe(false)
    expect(debeAvisar({ sender: 'patient', patient_id: null })).toBe(false)
  })

  it('no avisa del chat que está abierto', () => {
    setChatAbierto('521999')
    expect(debeAvisar({ sender: 'patient', patient_id: '521999' })).toBe(false)
    expect(debeAvisar({ sender: 'patient', patient_id: '521888' })).toBe(true)
  })
})
