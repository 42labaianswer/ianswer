import { describe, expect, it } from 'vitest'
import {
  buildTemplateMessage, renderTemplateText, templateParamsError, templateVars, toCampaignTemplate,
  type MetaTemplate,
} from './campaigns'

const promo: MetaTemplate = {
  name: 'promo_noviembre',
  language: 'es_MX',
  status: 'APPROVED',
  category: 'MARKETING',
  components: [
    { type: 'HEADER', format: 'TEXT', text: 'Hola {{1}}' },
    { type: 'BODY', text: 'Tenemos {{1}} de descuento hasta el {{2}}. {{1}} en todo.' },
    { type: 'FOOTER', text: 'Responde BAJA para no recibir más' },
    { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Me interesa' }] },
  ],
}

describe('templateVars', () => {
  it('devuelve cada variable una vez, en orden', () => {
    expect(templateVars('{{2}} y {{1}} y {{2}} y {{ nombre }}')).toEqual(['2', '1', 'nombre'])
    expect(templateVars(null)).toEqual([])
  })
})

describe('toCampaignTemplate', () => {
  it('saca encabezado, cuerpo, pie y botones', () => {
    const t = toCampaignTemplate(promo)
    expect(t.headerVars).toEqual(['1'])
    expect(t.bodyVars).toEqual(['1', '2'])
    expect(t.footerText).toBe('Responde BAJA para no recibir más')
    expect(t.buttons).toEqual(['Me interesa'])
    expect(t.unsupported).toBeNull()
  })

  it('marca como no compatible un botón con enlace variable', () => {
    const t = toCampaignTemplate({
      ...promo,
      components: [
        { type: 'BODY', text: 'Hola' },
        { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Ver', url: 'https://x.com/{{1}}' }] },
      ],
    })
    expect(t.unsupported).toMatch(/enlace variable/)
  })

  it('acepta un botón con enlace fijo', () => {
    const t = toCampaignTemplate({
      ...promo,
      components: [
        { type: 'BODY', text: 'Hola' },
        { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Ver', url: 'https://x.com/promo' }] },
      ],
    })
    expect(t.unsupported).toBeNull()
  })
})

describe('templateParamsError', () => {
  const t = toCampaignTemplate(promo)

  it('pide cada variable vacía', () => {
    expect(templateParamsError(t, {})).toMatch(/encabezado/)
    expect(templateParamsError(t, { header: { 1: 'Ana' }, body: { 1: '20%' } })).toMatch(/\{\{2\}\}/)
    expect(templateParamsError(t, { header: { 1: 'Ana' }, body: { 1: '20%', 2: 'viernes' } })).toBeNull()
  })

  it('pide enlace https en encabezados con imagen', () => {
    const img = toCampaignTemplate({ ...promo, components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Hola' }] })
    expect(templateParamsError(img, {})).toMatch(/enlace/)
    expect(templateParamsError(img, { header_media_url: 'http://x.com/a.png' })).toMatch(/enlace/)
    expect(templateParamsError(img, { header_media_url: 'https://x.com/a.png' })).toBeNull()
  })
})

describe('buildTemplateMessage', () => {
  it('arma parámetros posicionales', () => {
    const t = toCampaignTemplate(promo)
    const msg = buildTemplateMessage(t, { header: { 1: 'Ana' }, body: { 1: '20%', 2: 'viernes' } }, '5215512345678')
    expect(msg).toEqual({
      messaging_product: 'whatsapp',
      to: '5215512345678',
      type: 'template',
      template: {
        name: 'promo_noviembre',
        language: { code: 'es_MX' },
        components: [
          { type: 'header', parameters: [{ type: 'text', text: 'Ana' }] },
          { type: 'body', parameters: [{ type: 'text', text: '20%' }, { type: 'text', text: 'viernes' }] },
        ],
      },
    })
  })

  it('arma parámetros con nombre y encabezado de imagen', () => {
    const t = toCampaignTemplate({
      ...promo,
      parameter_format: 'NAMED',
      components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Hola {{nombre}}' }],
    })
    const msg = buildTemplateMessage(t, { header_media_url: 'https://x.com/a.png', body: { nombre: 'Ana' } }, '52155')
    expect(msg.template.components).toEqual([
      { type: 'header', parameters: [{ type: 'image', image: { link: 'https://x.com/a.png' } }] },
      { type: 'body', parameters: [{ type: 'text', parameter_name: 'nombre', text: 'Ana' }] },
    ])
  })

  it('no manda components si la plantilla no tiene variables', () => {
    const t = toCampaignTemplate({ ...promo, components: [{ type: 'BODY', text: 'Hola' }] })
    expect(buildTemplateMessage(t, {}, '52155').template).not.toHaveProperty('components')
  })
})

describe('renderTemplateText', () => {
  it('llena las variables para el historial', () => {
    const t = toCampaignTemplate(promo)
    expect(renderTemplateText(t, { header: { 1: 'Ana' }, body: { 1: '20%', 2: 'viernes' } }))
      .toBe('Hola Ana\n\nTenemos 20% de descuento hasta el viernes. 20% en todo.\n\nResponde BAJA para no recibir más')
  })
})
