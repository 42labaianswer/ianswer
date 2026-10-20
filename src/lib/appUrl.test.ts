import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAppBaseUrl } from './appUrl'

const setEnv = (env: Partial<Record<'VERCEL_ENV' | 'NEXT_PUBLIC_BASE_URL' | 'NEXT_PUBLIC_SITE_URL' | 'NEXT_PUBLIC_APP_URL', string>>) => {
  for (const k of ['VERCEL_ENV', 'NEXT_PUBLIC_BASE_URL', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_APP_URL'] as const) {
    vi.stubEnv(k, env[k] ?? '')
  }
}

afterEach(() => vi.unstubAllEnvs())

describe('getAppBaseUrl', () => {
  it('quita la "/" final de NEXT_PUBLIC_SITE_URL', () => {
    setEnv({ VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://www.ianswer.pro/' })
    expect(getAppBaseUrl()).toBe('https://www.ianswer.pro')
  })

  it('respeta el orden BASE_URL → SITE_URL → APP_URL', () => {
    setEnv({ NEXT_PUBLIC_BASE_URL: 'https://a.test', NEXT_PUBLIC_SITE_URL: 'https://b.test' })
    expect(getAppBaseUrl()).toBe('https://a.test')
  })

  it('ignora valores sin http(s)', () => {
    setEnv({ NEXT_PUBLIC_BASE_URL: 'ianswer.pro', NEXT_PUBLIC_APP_URL: 'https://c.test' })
    expect(getAppBaseUrl()).toBe('https://c.test')
  })

  it('en producción nunca devuelve localhost', () => {
    setEnv({ VERCEL_ENV: 'production', NEXT_PUBLIC_BASE_URL: 'http://localhost:3000' })
    expect(getAppBaseUrl()).toBe('https://ianswer.pro')
  })

  it('fuera de producción acepta localhost y su fallback es localhost', () => {
    setEnv({ NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3000' })
    expect(getAppBaseUrl()).toBe('http://127.0.0.1:3000')
    setEnv({})
    expect(getAppBaseUrl()).toBe('http://localhost:3000')
  })
})
