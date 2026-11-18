import { describe, expect, it } from 'vitest'
import {
  aiRepliesOf, usersOf, compareGroups, compareRows, ownFeatureLines, featureLines, formatMXN, pricePerMonthCents, yearlyDiscountPct,
  type ComparablePlan,
} from './planCompare'

const plan = (over: Partial<ComparablePlan> = {}): ComparablePlan => ({
  slug: 'start', tier: 'start', name: 'Start', description: null,
  price_monthly_cents: 150000, price_yearly_cents: 1494000,
  max_sessions_per_month: 300, max_ai_replies_per_month: 1500, max_reminders_per_month: 500,
  max_internal_users: 3, max_team_members: 3, max_channels: 1,
  max_agendas: 3, max_campaign_messages_per_month: 50,
  feature_flags: { agent_training_pro: false, ai_voice_notes: true }, features: null,
  ...over,
})

describe('precios', () => {
  it('mensual usa el precio mensual', () => {
    expect(pricePerMonthCents(plan(), 'monthly')).toBe(150000)
  })
  it('anual divide el total entre 12', () => {
    expect(pricePerMonthCents(plan(), 'yearly')).toBe(124500)
  })
  it('anual sin precio anual cae al mensual', () => {
    expect(pricePerMonthCents(plan({ price_yearly_cents: null }), 'yearly')).toBe(150000)
  })
  it('calcula el descuento anual', () => {
    expect(yearlyDiscountPct(plan())).toBe(17)
    expect(yearlyDiscountPct(plan({ price_yearly_cents: null }))).toBe(0)
    expect(yearlyDiscountPct(plan({ price_monthly_cents: 0 }))).toBe(0)
  })
  it('formatea en pesos sin decimales', () => {
    expect(formatMXN(49900)).toMatch(/\$\s?499$/)
  })
})

describe('featureLines', () => {
  it('separa por línea, también con CRLF, y quita vacías', () => {
    expect(featureLines(plan({ features: '1 canal\r\n\r\n CRM completo \nReportes' }))).toEqual(['1 canal', 'CRM completo', 'Reportes'])
  })
  it('sin features devuelve vacío', () => {
    expect(featureLines(plan({ features: null }))).toEqual([])
  })
})

describe('compareRows', () => {
  const lite = plan({ slug: 'lite', max_ai_replies_per_month: 500, max_reminders_per_month: 100, max_internal_users: 1, max_team_members: 1, max_agendas: 1, max_campaign_messages_per_month: 0 })
  const growth = plan({ slug: 'growth', max_internal_users: 10, max_team_members: 10, feature_flags: { agent_training_pro: true, ai_voice_notes: true } })

  it('una celda por plan, en el mismo orden', () => {
    const rows = compareRows([lite, growth])
    const users = rows.find(r => r.key === 'users')!
    expect(users.cells).toEqual([{ kind: 'text', value: '1' }, { kind: 'text', value: '10' }])
  })
  it('respuestas de IA caen a conversaciones si la columna nueva no tiene valor', () => {
    const rows = compareRows([plan({ max_ai_replies_per_month: 0, max_sessions_per_month: 300 })])
    expect(rows.find(r => r.key === 'ai_replies')!.cells[0]).toEqual({ kind: 'text', value: '300' })
  })
  it('usuarios caen a miembros del equipo si no hay usuarios internos', () => {
    expect(usersOf(plan({ max_internal_users: 0, max_team_members: 7 }))).toBe(7)
    expect(aiRepliesOf(lite)).toBe(500)
  })
  it('0 o vacío se muestra como no incluido', () => {
    const rows = compareRows([lite, growth])
    expect(rows.find(r => r.key === 'campaigns')!.cells[0]).toEqual({ kind: 'no' })
  })
  it('los flags salen como sí o no', () => {
    const rows = compareRows([lite, growth])
    expect(rows.find(r => r.key === 'training')!.cells).toEqual([{ kind: 'no' }, { kind: 'yes' }])
  })
  it('oculta filas iguales en todos los planes, salvo las de capacidad', () => {
    const keys = compareRows([lite, growth]).map(r => r.key)
    expect(keys).not.toContain('voice')
    expect(keys).toContain('channels')
  })
  it('formatea miles', () => {
    const rows = compareRows([plan({ max_ai_replies_per_month: 2000 })])
    expect(rows.find(r => r.key === 'ai_replies')!.cells[0]).toEqual({ kind: 'text', value: (2000).toLocaleString('es-MX') })
  })
})

describe('compareGroups', () => {
  const lite = plan({ slug: 'lite', max_internal_users: 1, max_campaign_messages_per_month: 0 })
  const growth = plan({ slug: 'growth', max_internal_users: 10, feature_flags: { agent_training_pro: true, ai_voice_notes: true } })

  it('agrupa por tema y en orden', () => {
    const groups = compareGroups([lite, growth])
    expect(groups.map(g => g.key)).toEqual(['messages', 'capacity', 'ai'])
    expect(groups[0].rows.map(r => r.key)).toEqual(['ai_replies', 'reminders', 'campaigns'])
    expect(groups[1].rows.map(r => r.key)).toEqual(['users', 'channels'])
  })
  it('no muestra grupos sin filas', () => {
    const keys = compareGroups([lite, growth]).map(g => g.key)
    expect(keys).not.toContain('reports')
  })
})

describe('funciones del plan (features_jsonb)', () => {
  const lite = plan({ slug: 'lite', features_jsonb: { channels: ['whatsapp'], crm: 'basic', payment_links: false, questionnaire: false, team: false, escalation: true, addons: true, import_contacts: false, api: false } })
  const start = plan({ slug: 'start', features_jsonb: { channels: ['whatsapp', 'instagram', 'facebook'], crm: 'full', payment_links: true, questionnaire: 'addon', team: false, escalation: true, addons: true, import_contacts: false, api: false } })
  const pro = plan({ slug: 'scale', features_jsonb: { channels: ['whatsapp', 'instagram', 'facebook'], crm: 'full', payment_links: true, questionnaire: true, team: 'per_branch', escalation: true, addons: true, import_contacts: true, api: true } })
  const cells = (key: string) => compareRows([lite, start, pro]).find(r => r.key === key)?.cells

  it('canales por nombre', () => {
    expect(cells('channels')).toEqual([
      { kind: 'text', value: 'WhatsApp' },
      { kind: 'text', value: 'WhatsApp, Instagram, Facebook' },
      { kind: 'text', value: 'WhatsApp, Instagram, Facebook' },
    ])
  })
  it('valores de texto del documento', () => {
    expect(cells('crm')).toEqual([{ kind: 'text', value: 'Mensajes y calendario' }, { kind: 'text', value: 'Completo' }, { kind: 'text', value: 'Completo' }])
    expect(cells('payment_links')![0]).toEqual({ kind: 'text', value: 'Solo agenda' })
    expect(cells('questionnaire')).toEqual([{ kind: 'no' }, { kind: 'text', value: 'Add-on' }, { kind: 'yes' }])
    expect(cells('team')).toEqual([{ kind: 'no' }, { kind: 'no' }, { kind: 'text', value: 'Por sucursal' }])
  })
  it('escala a humano y add-ons salen aunque todos los tengan', () => {
    expect(cells('escalation')).toEqual([{ kind: 'yes' }, { kind: 'yes' }, { kind: 'yes' }])
    expect(cells('addons')).toBeDefined()
  })
  it('sin features_jsonb no salen esas filas', () => {
    const keys = compareRows([plan(), plan({ slug: 'growth' })]).map(r => r.key)
    expect(keys).not.toContain('escalation')
    expect(keys).not.toContain('team')
  })
})

describe('ownFeatureLines', () => {
  it('quita "Todo lo de X" sin importar mayúsculas', () => {
    expect(ownFeatureLines(plan({ features: 'Todo lo de Start, escalado\n3 canales\ntodo lo de Growth' }))).toEqual(['3 canales'])
  })
})
