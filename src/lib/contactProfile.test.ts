import { describe, expect, it } from 'vitest'
import {
  esAvatarPropio, esNombreProvisional, necesitaEnriquecer, nombreDesdePerfilMeta, rutaAvatar,
} from './contactProfile'

describe('esNombreProvisional', () => {
  it.each(['', '  ', null, undefined, 'Cliente', 'SIN NOMBRE', 'anónimo', '1234567', 12345678])(
    '%j es provisional',
    nombre => expect(esNombreProvisional(nombre)).toBe(true)
  )

  it.each(['Ana López', 'Cliente Frecuente', '12345', 'Usuario 2'])('%j es un nombre real', nombre => {
    expect(esNombreProvisional(nombre)).toBe(false)
  })
})

describe('esAvatarPropio', () => {
  it('una URL nuestra es definitiva', () => {
    expect(esAvatarPropio('https://xyz.supabase.co/storage/v1/object/public/avatars/a.jpg')).toBe(true)
  })

  it.each([
    'https://scontent.xx.fbcdn.net/v/t1/abc.jpg',
    'https://scontent.cdninstagram.com/abc.jpg',
    'https://lookaside.fbsbx.com/abc',
    'https://graph.facebook.com/123/picture',
  ])('una URL de Meta caduca: %s', url => {
    expect(esAvatarPropio(url)).toBe(false)
  })

  it.each(['', null, undefined, 'avatars/a.jpg', 'ftp://x/a.jpg'])('%j no es un avatar utilizable', url => {
    expect(esAvatarPropio(url)).toBe(false)
  })
})

describe('necesitaEnriquecer', () => {
  const avatarPropio = 'https://xyz.supabase.co/a.jpg'

  it('no consulta Graph API si ya tiene nombre real y avatar propio', () => {
    expect(necesitaEnriquecer('Ana', avatarPropio)).toBe(false)
  })

  it('consulta si falta el nombre o el avatar es de Meta', () => {
    expect(necesitaEnriquecer('Cliente', avatarPropio)).toBe(true)
    expect(necesitaEnriquecer('Ana', 'https://a.fbcdn.net/x.jpg')).toBe(true)
    expect(necesitaEnriquecer('Ana', null)).toBe(true)
  })
})

describe('nombreDesdePerfilMeta', () => {
  it('prefiere name (Instagram)', () => {
    expect(nombreDesdePerfilMeta({ name: ' Ana López ', username: 'ana' })).toBe('Ana López')
  })

  it('arma first_name + last_name (Messenger)', () => {
    expect(nombreDesdePerfilMeta({ first_name: 'Ana', last_name: 'López' })).toBe('Ana López')
    expect(nombreDesdePerfilMeta({ first_name: 'Ana' })).toBe('Ana')
  })

  it('usa @username como último recurso', () => {
    expect(nombreDesdePerfilMeta({ username: 'ana_mx' })).toBe('@ana_mx')
  })

  it('devuelve null si no hay nada aprovechable', () => {
    expect(nombreDesdePerfilMeta(null)).toBeNull()
    expect(nombreDesdePerfilMeta(undefined)).toBeNull()
    expect(nombreDesdePerfilMeta({ name: '  ', first_name: '' })).toBeNull()
  })

  it('recorta a 120 caracteres', () => {
    expect(nombreDesdePerfilMeta({ name: 'a'.repeat(200) })).toHaveLength(120)
  })
})

describe('rutaAvatar', () => {
  it('agrupa por empresa y canal', () => {
    expect(rutaAvatar('comp-1', 'instagram', '1789')).toBe('comp-1/instagram/1789.jpg')
  })

  it('limpia el id externo para que no salga del prefijo', () => {
    expect(rutaAvatar('comp-1', 'messenger', '../../otro/123')).toBe('comp-1/messenger/otro123.jpg')
  })
})
