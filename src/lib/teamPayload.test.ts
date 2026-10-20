import { describe, expect, it } from 'vitest'
import { TEAM_VERTICAL_ARRAY_FIELDS, TEAM_VERTICAL_TEXT_FIELDS, normalizeTeamPayload } from './teamPayload'

describe('normalizeTeamPayload', () => {
  it('rellena los campos de industria que faltan con vacío, nunca null', () => {
    const out = normalizeTeamPayload({ full_name: 'Ana' }) as Record<string, unknown>
    for (const k of TEAM_VERTICAL_TEXT_FIELDS) expect(out[k]).toBe('')
    for (const k of TEAM_VERTICAL_ARRAY_FIELDS) expect(out[k]).toEqual([])
  })

  it('cambia null por vacío', () => {
    const out = normalizeTeamPayload({ specialty: null, zones_covered: null })
    expect(out.specialty).toBe('')
    expect(out.zones_covered).toEqual([])
  })

  it('no deja que title caiga al default "Dr." de la base', () => {
    expect(normalizeTeamPayload<Record<string, unknown>>({}).title).toBe('')
    expect(normalizeTeamPayload({ title: 'Lic.' }).title).toBe('Lic.')
  })

  it('conserva los valores existentes y quita espacios de las cadenas', () => {
    const out = normalizeTeamPayload({ full_name: '  Ana  ', specialty: ' Pediatría ', zones_covered: ['Norte'] })
    expect(out.full_name).toBe('Ana')
    expect(out.specialty).toBe('Pediatría')
    expect(out.zones_covered).toEqual(['Norte'])
  })

  it('deja years_experience vacío como null (0 años no es lo mismo que no capturado)', () => {
    expect(normalizeTeamPayload({ years_experience: null }).years_experience).toBeNull()
  })

  it('no modifica el objeto original', () => {
    const input = { full_name: ' Ana ' }
    normalizeTeamPayload(input)
    expect(input).toEqual({ full_name: ' Ana ' })
  })
})
