import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  adminClient, getCampaignUsage, getWhatsAppCredentials, isCampaignLimitDbError,
  listMarketingTemplates, loadAudience, sanitizeAudience,
} from './campaignsServer'
import type { MetaTemplate } from './campaigns'

// Cliente de Supabase simulado: cada consulta guarda sus filtros y, al
// resolverse, pide la respuesta a `respond` con la tabla y esos filtros.
type Query = { table: string; calls: Array<[string, unknown[]]> }
type Response = { data: unknown; error: unknown }

function fakeAdmin(respond: (q: Query) => Response, rpc?: (fn: string, args: unknown) => Response) {
  const queries: Query[] = []
  const admin = {
    from(table: string) {
      const q: Query = { table, calls: [] }
      queries.push(q)
      const builder: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'or', 'order', 'range']) {
        builder[m] = (...args: unknown[]) => { q.calls.push([m, args]); return builder }
      }
      builder.maybeSingle = async () => respond(q)
      builder.then = (resolve: (r: Response) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(respond(q)).then(resolve, reject)
      return builder
    },
    rpc: async (fn: string, args: unknown) => rpc!(fn, args),
  }
  return { admin: admin as unknown as SupabaseClient, queries }
}

const arg = (q: Query, method: string) => q.calls.find(c => c[0] === method)?.[1]
const rangeFrom = (q: Query) => (arg(q, 'range') as [number, number] | undefined)?.[0] ?? 0

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('adminClient', () => {
  it('crea un cliente con la llave de servicio', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://demo.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key')
    expect(typeof adminClient().from).toBe('function')
    vi.unstubAllEnvs()
  })
})

describe('getCampaignUsage', () => {
  it('devuelve lo que regresa get_campaign_usage', async () => {
    const usage = { used: 3, limit: 50, remaining: 47, period_start: '2026-11-01' }
    const { admin } = fakeAdmin(() => ({ data: null, error: null }), (fn, args) => {
      expect(fn).toBe('get_campaign_usage')
      expect(args).toEqual({ p_company_id: 'c1' })
      return { data: usage, error: null }
    })
    expect(await getCampaignUsage(admin, 'c1')).toEqual(usage)
  })

  it('lanza el error de la base', async () => {
    const err = { message: 'boom' }
    const { admin } = fakeAdmin(() => ({ data: null, error: null }), () => ({ data: null, error: err }))
    await expect(getCampaignUsage(admin, 'c1')).rejects.toBe(err)
  })
})

describe('getWhatsAppCredentials', () => {
  it('devuelve WABA, número y token', async () => {
    const { admin } = fakeAdmin(() => ({
      data: { waba_id: 'w1', business_phone_id: 'p1', system_user_access_token: 't1' }, error: null,
    }))
    expect(await getWhatsAppCredentials(admin, 'c1')).toEqual({ wabaId: 'w1', phoneId: 'p1', token: 't1' })
  })

  it('devuelve null si WhatsApp no está conectado', async () => {
    const { admin } = fakeAdmin(() => ({ data: { waba_id: 'w1', business_phone_id: null, system_user_access_token: 't1' }, error: null }))
    expect(await getWhatsAppCredentials(admin, 'c1')).toBeNull()
    const vacio = fakeAdmin(() => ({ data: null, error: null }))
    expect(await getWhatsAppCredentials(vacio.admin, 'c1')).toBeNull()
  })
})

describe('listMarketingTemplates', () => {
  const creds = { wabaId: 'w1', phoneId: 'p1', token: 't1' }
  const tpl = (name: string, extra: Partial<MetaTemplate> = {}): MetaTemplate => ({
    name, language: 'es_MX', status: 'APPROVED', category: 'MARKETING',
    components: [{ type: 'BODY', text: 'Hola' }], ...extra,
  })

  it('junta las páginas y deja solo marketing aprobadas, ordenadas', async () => {
    const pages: Record<string, unknown> = {
      first: { data: [tpl('zeta'), tpl('util', { category: 'UTILITY' })], paging: { next: 'page2' } },
      page2: { data: [tpl('alfa'), tpl('pendiente', { status: 'PENDING' })] },
    }
    const fetchFn = vi.fn(async (url: string) => ({
      ok: true, json: async () => (url === 'page2' ? pages.page2 : pages.first),
    }))
    vi.stubGlobal('fetch', fetchFn)

    const list = await listMarketingTemplates(creds)
    expect(list.map(t => t.name)).toEqual(['alfa', 'zeta'])
    expect(fetchFn).toHaveBeenCalledTimes(2)
    const firstUrl = fetchFn.mock.calls[0][0]
    expect(firstUrl).toContain('/w1/message_templates?')
    expect(firstUrl).toContain('status=APPROVED')
    expect(firstUrl).not.toContain('name=')
  })

  it('filtra por nombre exacto', async () => {
    const fetchFn = vi.fn<(url: string) => Promise<unknown>>(async () => ({ ok: true, json: async () => ({ data: [tpl('promo'), tpl('promo_2')] }) }))
    vi.stubGlobal('fetch', fetchFn)
    const list = await listMarketingTemplates(creds, 'promo')
    expect(list.map(t => t.name)).toEqual(['promo'])
    expect(fetchFn.mock.calls[0][0]).toContain('name=promo')
  })

  it('pide reconectar si no hay WABA', async () => {
    await expect(listMarketingTemplates({ ...creds, wabaId: null })).rejects.toThrow('Vuelve a conectar WhatsApp')
  })

  it('usa el mensaje de error de Meta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: { error_user_msg: 'Token vencido' } }) })))
    await expect(listMarketingTemplates(creds)).rejects.toThrow('Token vencido')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ error: { message: 'Bad' } }) })))
    await expect(listMarketingTemplates(creds)).rejects.toThrow('Bad')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => { throw new Error('no json') } })))
    await expect(listMarketingTemplates(creds)).rejects.toThrow('Meta no devolvió las plantillas')
  })

  it('tolera páginas sin data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    expect(await listMarketingTemplates(creds)).toEqual([])
  })
})

describe('sanitizeAudience', () => {
  it('deja solo textos y etapas válidas', () => {
    expect(sanitizeAudience({ tag_ids: ['t1', 2, null], stages: ['hot_lead', 'otra', 5] }))
      .toEqual({ tag_ids: ['t1'], stages: ['hot_lead'] })
  })

  it('acepta valores vacíos o raros', () => {
    expect(sanitizeAudience(null)).toEqual({ tag_ids: [], stages: [] })
    expect(sanitizeAudience('x')).toEqual({ tag_ids: [], stages: [] })
    expect(sanitizeAudience({ tag_ids: 'x' })).toEqual({ tag_ids: [], stages: [] })
  })
})

describe('loadAudience', () => {
  const contact = (id: string, external_id: string | null, name: string | null = null) => ({ id, external_id, name })

  it('sin filtros trae contactos de WhatsApp sin baja, uno por número', async () => {
    const { admin, queries } = fakeAdmin(q => ({
      data: q.table === 'contacts'
        ? [contact('a', '+52 999 111', 'Ana'), contact('b', '52999111'), contact('c', null), contact('d', '52999222')]
        : [],
      error: null,
    }))
    const list = await loadAudience(admin, 'c1', {})
    expect(list).toEqual([
      { id: 'a', phone: '52999111', name: 'Ana' },
      { id: 'd', phone: '52999222', name: null },
    ])
    const q = queries[0]
    expect(arg(q, 'or')).toEqual(['opted_out.is.null,opted_out.eq.false'])
    expect(q.calls.some(c => c[0] === 'in')).toBe(false)
  })

  it('filtra por etapa', async () => {
    const { admin, queries } = fakeAdmin(() => ({ data: [contact('a', '1')], error: null }))
    await loadAudience(admin, 'c1', { stages: ['customer'] })
    expect(arg(queries[0], 'in')).toEqual(['lifecycle_stage', ['customer']])
  })

  it('con etiquetas deja solo contactos que tengan alguna', async () => {
    const { admin } = fakeAdmin(q => {
      if (q.table === 'tags') return { data: [{ id: 't1' }], error: null }
      if (q.table === 'contact_tags') return { data: [{ contact_id: 'b' }], error: null }
      return { data: [contact('a', '1'), contact('b', '2')], error: null }
    })
    expect(await loadAudience(admin, 'c1', { tag_ids: ['t1', 'ajena'] })).toEqual([{ id: 'b', phone: '2', name: null }])
  })

  it('regresa vacío si las etiquetas no tienen contactos', async () => {
    const { admin, queries } = fakeAdmin(q => ({ data: q.table === 'tags' ? [] : null, error: null }))
    expect(await loadAudience(admin, 'c1', { tag_ids: ['t1'] })).toEqual([])
    expect(queries.some(q => q.table === 'contacts')).toBe(false)
  })

  it('pagina de 1000 en 1000', async () => {
    const page = (n: number, offset: number) => Array.from({ length: n }, (_, i) => contact(`c${offset + i}`, String(offset + i + 1)))
    const { admin, queries } = fakeAdmin(q => {
      if (q.table === 'tags') return { data: [{ id: 't1' }], error: null }
      if (q.table === 'contact_tags') {
        const from = rangeFrom(q)
        return { data: from === 0 ? page(1000, 0).map(c => ({ contact_id: c.id })) : [{ contact_id: 'c1000' }], error: null }
      }
      return { data: rangeFrom(q) === 0 ? page(1000, 0) : page(5, 1000), error: null }
    })
    const list = await loadAudience(admin, 'c1', { tag_ids: ['t1'] })
    expect(list).toHaveLength(1001)
    expect(queries.filter(q => q.table === 'contacts')).toHaveLength(2)
    expect(queries.filter(q => q.table === 'contact_tags')).toHaveLength(2)
  })

  it('lanza los errores de la base', async () => {
    const err = { message: 'x' }
    const tagsErr = fakeAdmin(() => ({ data: null, error: err }))
    await expect(loadAudience(tagsErr.admin, 'c1', { tag_ids: ['t1'] })).rejects.toBe(err)

    const linkErr = fakeAdmin(q => (q.table === 'tags' ? { data: [{ id: 't1' }], error: null } : { data: null, error: err }))
    await expect(loadAudience(linkErr.admin, 'c1', { tag_ids: ['t1'] })).rejects.toBe(err)

    const contactsErr = fakeAdmin(() => ({ data: null, error: err }))
    await expect(loadAudience(contactsErr.admin, 'c1', {})).rejects.toBe(err)
  })
})

describe('isCampaignLimitDbError', () => {
  it('reconoce el hint de cupo agotado', () => {
    expect(isCampaignLimitDbError({ hint: 'campaign_limit' })).toBe(true)
    expect(isCampaignLimitDbError({ hint: 'otro' })).toBe(false)
    expect(isCampaignLimitDbError(null)).toBe(false)
  })
})
