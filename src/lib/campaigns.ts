// Campañas de publicidad por WhatsApp: plantillas de marketing aprobadas en el
// WABA del cliente. Aquí vive lo que comparten la ruta /api/campaigns y la
// pantalla: qué plantillas se pueden mandar, sus variables y cómo se arma el
// mensaje para la Cloud API. El límite mensual vive en la base
// (database/add_campaigns.sql).

export type TemplateHeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION'

export interface MetaTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS'
  format?: TemplateHeaderFormat
  text?: string
  buttons?: Array<{ type: string; text?: string; url?: string }>
}

export interface MetaTemplate {
  id?: string
  name: string
  language: string
  status: string
  category: string
  parameter_format?: 'POSITIONAL' | 'NAMED'
  components: MetaTemplateComponent[]
}

/** Lo que la pantalla necesita de cada plantilla. */
export interface CampaignTemplate {
  name: string
  language: string
  named: boolean
  headerFormat: TemplateHeaderFormat | null
  headerText: string | null
  headerVars: string[]
  bodyText: string
  bodyVars: string[]
  footerText: string | null
  buttons: string[]
  /** Motivo por el que no se puede mandar desde iAnswer, o null si se puede. */
  unsupported: string | null
}

/** Valores que el usuario llena una vez por campaña. */
export interface TemplateParams {
  header?: Record<string, string>
  header_media_url?: string
  body?: Record<string, string>
}

export interface CampaignAudience {
  tag_ids?: string[]
  stages?: string[]
}

/** Mensaje legible de un error de JS o de Supabase. */
export function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' && e.message) return e.message
  return fallback
}

export const CAMPAIGN_STAGES = ['new_lead', 'hot_lead', 'payment', 'customer'] as const

const VAR_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g

export function templateVars(text: string | null | undefined): string[] {
  if (!text) return []
  const vars: string[] = []
  for (const m of text.matchAll(VAR_RE)) {
    if (!vars.includes(m[1])) vars.push(m[1])
  }
  return vars
}

export function fillVars(text: string, values: Record<string, string> | undefined): string {
  return text.replace(VAR_RE, (whole, key: string) => values?.[key]?.trim() || whole)
}

const MEDIA_FORMATS: TemplateHeaderFormat[] = ['IMAGE', 'VIDEO', 'DOCUMENT']

export function toCampaignTemplate(t: MetaTemplate): CampaignTemplate {
  const header = t.components.find(c => c.type === 'HEADER')
  const body = t.components.find(c => c.type === 'BODY')
  const footer = t.components.find(c => c.type === 'FOOTER')
  const buttons = t.components.find(c => c.type === 'BUTTONS')?.buttons ?? []

  let unsupported: string | null = null
  if (header?.format === 'LOCATION') {
    unsupported = 'Tiene encabezado de ubicación'
  }
  for (const b of buttons) {
    const tipo = b.type?.toUpperCase()
    if (tipo === 'URL' && templateVars(b.url).length > 0) unsupported = 'Tiene un botón con enlace variable'
    else if (tipo && !['QUICK_REPLY', 'URL', 'PHONE_NUMBER'].includes(tipo)) unsupported = 'Tiene un botón que iAnswer aún no maneja'
  }

  return {
    name: t.name,
    language: t.language,
    named: t.parameter_format === 'NAMED',
    headerFormat: header?.format ?? null,
    headerText: header?.format === 'TEXT' ? header.text ?? null : null,
    headerVars: header?.format === 'TEXT' ? templateVars(header.text) : [],
    bodyText: body?.text ?? '',
    bodyVars: templateVars(body?.text),
    footerText: footer?.text ?? null,
    buttons: buttons.map(b => b.text || '').filter(Boolean),
    unsupported,
  }
}

/** Mensaje de error si faltan datos para mandar la plantilla; null si está completa. */
export function templateParamsError(t: CampaignTemplate, p: TemplateParams): string | null {
  if (t.unsupported) return `La plantilla no se puede usar: ${t.unsupported.toLowerCase()}.`
  if (t.headerFormat && MEDIA_FORMATS.includes(t.headerFormat)) {
    const url = p.header_media_url?.trim() || ''
    if (!/^https:\/\/\S+$/i.test(url)) return 'Falta el enlace (https) del archivo del encabezado.'
  }
  for (const v of t.headerVars) {
    if (!p.header?.[v]?.trim()) return `Falta el valor de {{${v}}} en el encabezado.`
  }
  for (const v of t.bodyVars) {
    if (!p.body?.[v]?.trim()) return `Falta el valor de {{${v}}} en el mensaje.`
  }
  return null
}

function textParams(vars: string[], values: Record<string, string> | undefined, named: boolean) {
  return vars.map(v => named
    ? { type: 'text', parameter_name: v, text: values?.[v]?.trim() || '' }
    : { type: 'text', text: values?.[v]?.trim() || '' })
}

/** Cuerpo de POST /{phone_id}/messages para mandar la plantilla a `to`. */
export function buildTemplateMessage(t: CampaignTemplate, p: TemplateParams, to: string) {
  const components: Array<{ type: 'header' | 'body'; parameters: Array<Record<string, unknown>> }> = []
  if (t.headerFormat && MEDIA_FORMATS.includes(t.headerFormat)) {
    const kind = t.headerFormat.toLowerCase()
    components.push({ type: 'header', parameters: [{ type: kind, [kind]: { link: p.header_media_url!.trim() } }] })
  } else if (t.headerVars.length > 0) {
    components.push({ type: 'header', parameters: textParams(t.headerVars, p.header, t.named) })
  }
  if (t.bodyVars.length > 0) {
    components.push({ type: 'body', parameters: textParams(t.bodyVars, p.body, t.named) })
  }
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: t.name,
      language: { code: t.language },
      ...(components.length > 0 ? { components } : {}),
    },
  }
}

/** Texto que se guarda en el historial de Mensajes. */
export function renderTemplateText(t: CampaignTemplate, p: TemplateParams): string {
  return [
    t.headerText ? fillVars(t.headerText, p.header) : null,
    fillVars(t.bodyText, p.body),
    t.footerText,
  ].filter(Boolean).join('\n\n')
}
