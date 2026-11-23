import { describe, expect, it } from 'vitest'
import { daysUntil, meterState } from './usageSummary'

describe('meterState', () => {
  it('sin límite no muestra barra', () => {
    expect(meterState(undefined)).toBeNull()
    expect(meterState({ used: 10, limit: null })).toBeNull()
    expect(meterState({ used: 10, limit: 0 })).toBeNull()
  })
  it('por debajo del 80% está ok', () => {
    expect(meterState({ used: 100, limit: 500 })).toMatchObject({ pct: 20, remaining: 400, level: 'ok' })
  })
  it('desde el 80% avisa', () => {
    expect(meterState({ used: 400, limit: 500 })?.level).toBe('near')
  })
  it('al 100% o más queda lleno y la barra no pasa de 100', () => {
    expect(meterState({ used: 500, limit: 500 })).toMatchObject({ level: 'full', remaining: 0, pct: 100 })
    expect(meterState({ used: 520, limit: 500 })).toMatchObject({ level: 'full', remaining: 0, pct: 100 })
  })
})

describe('daysUntil', () => {
  const now = new Date('2026-11-20T12:00:00Z')
  it('redondea hacia arriba', () => {
    expect(daysUntil('2026-11-21T00:00:00Z', now)).toBe(1)
    expect(daysUntil('2026-11-30T12:00:00Z', now)).toBe(10)
  })
  it('nunca es negativo', () => {
    expect(daysUntil('2026-11-01T00:00:00Z', now)).toBe(0)
  })
})
