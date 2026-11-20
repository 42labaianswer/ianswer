// Datos que usan el selector de planes y la tabla comparativa de Mi Plan.
// Todo sale de la tabla plans; agregar un plan (por ejemplo Lite) no requiere
// tocar la pantalla.

export type ComparablePlan = {
  slug: string
  tier: string | null
  name: string
  description: string | null
  price_monthly_cents: number
  price_yearly_cents: number | null
  max_sessions_per_month: number
  max_team_members: number
  max_channels: number
  max_agendas?: number | null
  max_campaign_messages_per_month?: number | null
  /** Columnas de planes_nov2026.sql; null o ausentes en bases sin esa migración. */
  max_ai_replies_per_month?: number | null
  max_reminders_per_month?: number | null
  allowed_channels?: string[] | null
  feature_flags?: Record<string, boolean> | null
  features: string | null
}

export type BillingMode = 'monthly' | 'yearly'

/** true si el plan ya trae los límites por mensaje (planes_nov2026.sql). */
export function hasMessageQuotas(plan: ComparablePlan): boolean {
  return (plan.max_ai_replies_per_month ?? 0) > 0
}

const CHANNEL_NAMES: Record<string, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook' }

/** "Solo WhatsApp", "WhatsApp, Instagram y Facebook" o, sin lista, "N canales". */
export function channelsLabel(plan: ComparablePlan): string {
  const list = (plan.allowed_channels || []).map(c => CHANNEL_NAMES[c] || c)
  if (list.length === 0) return `${plan.max_channels} ${plan.max_channels === 1 ? 'canal' : 'canales'}`
  if (list.length === 1) return `Solo ${list[0]}`
  return `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`
}

/** Precio al mes en centavos. En anual, el total del año entre 12. */
export function pricePerMonthCents(plan: ComparablePlan, mode: BillingMode): number {
  if (mode === 'yearly' && plan.price_yearly_cents) return plan.price_yearly_cents / 12
  return plan.price_monthly_cents
}

/** Porcentaje que se ahorra pagando anual (0 si no hay precio anual). */
export function yearlyDiscountPct(plan: ComparablePlan): number {
  if (!plan.price_yearly_cents || !plan.price_monthly_cents) return 0
  return Math.max(0, Math.round((1 - plan.price_yearly_cents / (plan.price_monthly_cents * 12)) * 100))
}

export function formatMXN(cents: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(cents / 100)
}

/** Las features vienen como texto libre, una por línea. */
export function featureLines(plan: ComparablePlan): string[] {
  return (plan.features || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
}

export type CompareCell =
  | { kind: 'text'; value: string }
  | { kind: 'yes' }
  | { kind: 'no' }

export type CompareRow = { key: string; label: string; cells: CompareCell[] }

export type CompareGroup = { key: string; label: string; rows: CompareRow[] }

const n = (v: number) => v.toLocaleString('es-MX')
const num = (v: number | null | undefined): CompareCell =>
  v && v > 0 ? { kind: 'text', value: n(v) } : { kind: 'no' }
const flag = (v: boolean | undefined): CompareCell => (v ? { kind: 'yes' } : { kind: 'no' })

type RowDef = { key: string; group: GroupKey; label: string; cell: (p: ComparablePlan) => CompareCell; always?: boolean }

type GroupKey = 'capacity' | 'messages' | 'ai' | 'crm'

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: 'capacity', label: 'Capacidad' },
  { key: 'messages', label: 'Mensajes' },
  { key: 'ai', label: 'Inteligencia artificial' },
  { key: 'crm', label: 'CRM y reportes' },
]

const SHORT_CHANNEL: Record<string, string> = { whatsapp: 'WA', instagram: 'IG', facebook: 'FB' }

const shortChannels = (p: ComparablePlan): CompareCell => {
  const list = p.allowed_channels || []
  if (list.length === 0) return num(p.max_channels)
  if (list.length === 1) return { kind: 'text', value: CHANNEL_NAMES[list[0]] || list[0] }
  return { kind: 'text', value: list.map(c => SHORT_CHANNEL[c] || c).join(' · ') }
}

const ROWS: RowDef[] = [
  { key: 'ai_replies', group: 'capacity', label: 'Respuestas de IA al mes', cell: p => num(p.max_ai_replies_per_month), always: true },
  { key: 'reminders', group: 'capacity', label: 'Recordatorios de cita al mes', cell: p => num(p.max_reminders_per_month), always: true },
  { key: 'sessions', group: 'capacity', label: 'Conversaciones al mes', cell: p => num(p.max_sessions_per_month) },
  { key: 'members', group: 'capacity', label: 'Usuarios', cell: p => num(p.max_team_members), always: true },
  { key: 'channels', group: 'capacity', label: 'Canales', cell: shortChannels, always: true },
  { key: 'agendas', group: 'capacity', label: 'Agendas', cell: p => num(p.max_agendas) },
  { key: 'campaigns', group: 'messages', label: 'Mensajes de marketing incluidos', cell: p => num(p.max_campaign_messages_per_month) },
  { key: 'payment_links', group: 'crm', label: 'Links de pago', cell: p => flag(p.feature_flags?.payment_links) },
  { key: 'training', group: 'ai', label: 'Cuestionario de personalización', cell: p => flag(p.feature_flags?.agent_training_pro) },
  { key: 'voice', group: 'ai', label: 'Notas de voz e imágenes con IA', cell: p => flag(p.feature_flags?.ai_voice_notes) },
  { key: 'crm', group: 'crm', label: 'CRM completo', cell: p => flag(p.feature_flags?.crm_kanban) },
  { key: 'reports', group: 'crm', label: 'Reportes con KPIs', cell: p => flag(p.feature_flags?.reports_kpis) },
  { key: 'import', group: 'crm', label: 'Importar contactos', cell: p => flag(p.feature_flags?.import_contacts) },
  { key: 'api', group: 'crm', label: 'Integraciones y API', cell: p => flag(p.feature_flags?.api_access) },
]

const sameCell = (a: CompareCell, b: CompareCell) =>
  a.kind === b.kind && (a.kind !== 'text' || a.value === (b as { value: string }).value)

/**
 * Filas de la tabla comparativa. Las de capacidad siempre salen; las demás
 * solo si cambian entre planes (una fila igual en todos no ayuda a decidir).
 */
export function compareRows(plans: ComparablePlan[]): CompareRow[] {
  // Con límites por mensaje, "conversaciones" ya no aplica; sin ellos (base
  // sin planes_nov2026.sql), respuestas y recordatorios saldrían en 0.
  const byMessage = plans.length > 0 && plans.every(hasMessageQuotas)
  const skip = byMessage ? ['sessions'] : ['ai_replies', 'reminders']
  return ROWS
    .filter(r => !skip.includes(r.key))
    .map(r => ({ key: r.key, label: r.label, always: r.always || (!byMessage && r.key === 'sessions'), cells: plans.map(r.cell) }))
    .filter(r => r.always || r.cells.some(c => !sameCell(c, r.cells[0])))
    .map(({ key, label, cells }) => ({ key, label, cells }))
}

/** Las mismas filas de compareRows, agrupadas por tema; los grupos vacíos no salen. */
export function compareGroups(plans: ComparablePlan[]): CompareGroup[] {
  const rows = compareRows(plans)
  return GROUPS
    .map(g => ({
      key: g.key,
      label: g.label,
      rows: rows.filter(r => ROWS.find(d => d.key === r.key)?.group === g.key),
    }))
    .filter(g => g.rows.length > 0)
}

/** Líneas propias de un plan: quita las que solo dicen "Todo lo de X". */
export function ownFeatureLines(plan: ComparablePlan): string[] {
  return featureLines(plan).filter(l => !/^todo lo de\s/i.test(l))
}
