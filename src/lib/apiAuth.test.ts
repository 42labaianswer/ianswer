import { describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }))

import { companyHasFeature } from './apiAuth'

type Rpc = (fn: string, args?: unknown) => Promise<{ data: unknown }>

function fakeClient(isAdmin: boolean, features: Record<string, unknown> | null) {
  const rpc = vi.fn<Rpc>(async (fn) => {
    if (fn === 'is_platform_admin') return { data: isAdmin }
    if (fn === 'get_company_entitlements') return { data: features ? { features } : null }
    return { data: null }
  })
  return { client: { rpc } as unknown as Parameters<typeof companyHasFeature>[0], rpc }
}

describe('companyHasFeature', () => {
  it('es true si el plan o un add-on trae el flag', async () => {
    const { client } = fakeClient(false, { menu_pdf_import: true })
    expect(await companyHasFeature(client, 'c1', 'menu_pdf_import')).toBe(true)
  })

  it('es false si el flag falta o no es true', async () => {
    const { client } = fakeClient(false, { menu_pdf_import: false })
    expect(await companyHasFeature(client, 'c1', 'menu_pdf_import')).toBe(false)
    expect(await companyHasFeature(client, 'c1', 'ai_pdf_wizard_properties')).toBe(false)
  })

  it('es false si no hay entitlements', async () => {
    const { client } = fakeClient(false, null)
    expect(await companyHasFeature(client, 'c1', 'menu_pdf_import')).toBe(false)
  })

  it('los admins de plataforma pasan sin revisar el plan', async () => {
    const { client, rpc } = fakeClient(true, {})
    expect(await companyHasFeature(client, 'c1', 'menu_pdf_import')).toBe(true)
    expect(rpc).not.toHaveBeenCalledWith('get_company_entitlements', expect.anything())
  })
})
