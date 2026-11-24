import { describe, expect, it } from 'vitest'
import { publicBrandColors, tint } from './publicBrand'

describe('publicBrandColors', () => {
  it('sin colores propios usa los de iAnswer', () => {
    expect(publicBrandColors(null, null)).toEqual({ primary: 'var(--ia-theme)', accent: 'var(--ia-accent)' })
    expect(publicBrandColors('#0f172a', '#64748b')).toEqual({ primary: 'var(--ia-theme)', accent: 'var(--ia-accent)' })
    expect(publicBrandColors('#0F172A', '')).toEqual({ primary: 'var(--ia-theme)', accent: 'var(--ia-accent)' })
  })
  it('con colores propios usa los del negocio', () => {
    expect(publicBrandColors('#b91c1c', '#facc15')).toEqual({ primary: '#b91c1c', accent: '#facc15' })
  })
  it('si solo eligió el principal, lo usa también de acento', () => {
    expect(publicBrandColors('#b91c1c', '#64748b')).toEqual({ primary: '#b91c1c', accent: '#b91c1c' })
  })
})

describe('tint', () => {
  it('arma un color-mix que sirve con hex y con var()', () => {
    expect(tint('#b91c1c')).toBe('color-mix(in srgb, #b91c1c 12%, transparent)')
    expect(tint('var(--ia-accent)', 20)).toBe('color-mix(in srgb, var(--ia-accent) 20%, transparent)')
  })
})
