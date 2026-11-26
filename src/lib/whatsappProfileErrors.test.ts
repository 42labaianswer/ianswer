import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { META_PERMISSIONS_CODE, whatsappProfileError } from './whatsappProfileErrors'

describe('whatsappProfileError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('usa el mensaje de respaldo si la respuesta no trae error de Meta', () => {
    expect(whatsappProfileError(null, 'Error al guardar')).toEqual({ error: 'Error al guardar' })
    expect(whatsappProfileError({ success: false }, 'Error al guardar')).toEqual({ error: 'Error al guardar' })
    expect(console.error).not.toHaveBeenCalled()
  })

  it('marca los errores de permisos de Meta (200-299) con un mensaje corto', () => {
    for (const code of [200, 250, 299]) {
      expect(
        whatsappProfileError({ error: { message: '(#200) Permissions error', code } }, 'x', 'update')
      ).toEqual({ error: 'Meta no dio permiso para editar el perfil.', code: META_PERMISSIONS_CODE })
    }
  })

  it('devuelve el mensaje de Meta para otros errores', () => {
    expect(
      whatsappProfileError({ error: { message: 'Invalid parameter', code: 100 } }, 'x')
    ).toEqual({ error: 'Invalid parameter' })
    expect(whatsappProfileError({ error: { code: 300 } }, 'Error al guardar')).toEqual({
      error: 'Error al guardar',
    })
  })

  it('registra el error completo de Meta con el paso que falló', () => {
    const graphError = { message: 'boom', code: 190, error_subcode: 463, fbtrace_id: 'abc' }
    whatsappProfileError({ error: graphError }, 'x', 'photo-assign')
    expect(console.error).toHaveBeenCalledWith('[whatsapp-profile] Graph API error', {
      step: 'photo-assign',
      ...graphError,
    })
  })
})
