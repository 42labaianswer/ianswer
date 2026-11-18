// Datos que usan el selector de planes y la tabla comparativa de Mi Plan.
// Todo sale de la tabla plans; agregar un plan (por ejemplo Lite) no requiere
// tocar la pantalla.

/**
 * Funciones por plan (plans.features_jsonb), tal como vienen en la sección 10-A
 * del documento del 13-nov. Todo es opcional: si un plan no las trae, esas
 * filas no salen en la comparativa.
 */
export type PlanFeatures = {
  channels?: string[]
  crm?: 'basic' | 'full'
  payment_links?: boolean
  questionnaire?: boolean | 'addon'
  team?: boolean | 'per_branch'
  escalation?: boolean
  addons?: boolean
  import_contacts?: boolean
  api?: boolean
}

export type ComparablePlan = {
  slug: string
  tier: string | null
  name: string
  description: string | null
  price_monthly_cents: number
  price_yearly_cents: number | null
  max_sessions_per_month: number
  /** Contadores por mensaje (planes_nov_2026.sql). 0 o ausente = aún no configurado. */
  max_ai_replies_per_month?: number | null
  max_reminders_per_month?: number | null
  max_internal_users?: number | null
  max_team_members: number
  max_channels: number
  max_locations?: number | null
  max_agendas?: number | null
  max_campaign_messages_per_month?: number | null
  feature_flags?: Record<string, boolean> | null
  features_jsonb?: PlanFeatures | null
  features: string | null
}

export type BillingMode = 'monthly' | 'yearly'

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

/** Respuestas de IA al mes; si la columna nueva aún no tiene valor, usa el tope de conversaciones. */
export function aiRepliesOf(plan: ComparablePlan): number {
  return plan.max_ai_replies_per_month || plan.max_sessions_per_month || 0
}

/** Usuarios internos del plan; cae a miembros del equipo si no está configurado. */
export function usersOf(plan: ComparablePlan): number {
  return plan.max_internal_users || plan.max_team_members || 0
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
const text = (value: string): CompareCell => ({ kind: 'text', value })

const CHANNEL_NAMES: Record<string, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', messenger: 'Messenger', web: 'Web' }

const feat = (p: ComparablePlan): PlanFeatures => p.features_jsonb || {}

/** Canales por nombre si el plan los trae; si no, el número. */
function channelsCell(p: ComparablePlan): CompareCell {
  const list = feat(p).channels
  if (list?.length) return text(list.map(c => CHANNEL_NAMES[c] || c).join(', '))
  return num(p.max_channels)
}

type RowDef = {
  key: string
  group: GroupKey
  label: string
  cell: (p: ComparablePlan) => CompareCell
  /** Sale aunque sea igual en todos los planes. */
  always?: boolean
  /** La fila solo sale si al menos un plan trae el dato. */
  present?: (p: ComparablePlan) => boolean
}

type GroupKey = 'capacity' | 'messages' | 'features' | 'ai' | 'reports'

const has = (k: keyof PlanFeatures) => (p: ComparablePlan) => feat(p)[k] !== undefined

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: 'messages', label: 'Mensajes al mes' },
  { key: 'capacity', label: 'Capacidad' },
  { key: 'features', label: 'Funciones' },
  { key: 'ai', label: 'Inteligencia artificial' },
  { key: 'reports', label: 'Reportes' },
]

const ROWS: RowDef[] = [
  { key: 'ai_replies', group: 'messages', label: 'Respuestas de IA al mes', cell: p => num(aiRepliesOf(p)), always: true },
  { key: 'reminders', group: 'messages', label: 'Recordatorios de cita al mes', cell: p => num(p.max_reminders_per_month), always: true },
  { key: 'campaigns', group: 'messages', label: 'Mensajes de marketing incluidos', cell: p => num(p.max_campaign_messages_per_month) },
  { key: 'users', group: 'capacity', label: 'Usuarios', cell: p => num(usersOf(p)), always: true },
  { key: 'channels', group: 'capacity', label: 'Canales', cell: channelsCell, always: true },
  { key: 'locations', group: 'capacity', label: 'Sucursales', cell: p => num(p.max_locations) },
  { key: 'agendas', group: 'capacity', label: 'Agendas', cell: p => num(p.max_agendas) },
  { key: 'crm', group: 'features', label: 'CRM', cell: p => {
      const crm = feat(p).crm
      if (crm) return crm === 'full' ? text('Completo') : text('Mensajes y calendario')
      return p.feature_flags?.crm_kanban ? text('Completo') : text('Mensajes y calendario')
    } },
  { key: 'payment_links', group: 'features', label: 'Agenda, reagenda y links de pago', present: has('payment_links'),
    cell: p => (feat(p).payment_links ? { kind: 'yes' } : text('Solo agenda')) },
  { key: 'questionnaire', group: 'features', label: 'Cuestionario de personalización', present: has('questionnaire'),
    cell: p => { const q = feat(p).questionnaire; return q === 'addon' ? text('Add-on') : flag(q === true) } },
  { key: 'team', group: 'features', label: 'Equipo de trabajo (quién atiende qué, horarios y especialidades)', present: has('team'),
    cell: p => { const t = feat(p).team; return t === 'per_branch' ? text('Por sucursal') : flag(t === true) } },
  { key: 'escalation', group: 'features', label: 'Escala a humano en urgencias', always: true, present: has('escalation'),
    cell: p => flag(feat(p).escalation) },
  { key: 'addons', group: 'features', label: 'Add-ons (mensajes extra y marketing)', always: true, present: has('addons'),
    cell: p => flag(feat(p).addons) },
  { key: 'import_contacts', group: 'features', label: 'Importar contactos', present: has('import_contacts'),
    cell: p => flag(feat(p).import_contacts) },
  { key: 'api', group: 'features', label: 'Integraciones y API', present: has('api'),
    cell: p => flag(feat(p).api) },
  { key: 'training', group: 'ai', label: 'Entrenamiento PRO del agente', cell: p => flag(p.feature_flags?.agent_training_pro) },
  { key: 'voice', group: 'ai', label: 'Notas de voz e imágenes con IA', cell: p => flag(p.feature_flags?.ai_voice_notes) },
  { key: 'reports', group: 'reports', label: 'Reportes con KPIs', cell: p => flag(p.feature_flags?.reports_kpis) },
]

const sameCell = (a: CompareCell, b: CompareCell) =>
  a.kind === b.kind && (a.kind !== 'text' || a.value === (b as { value: string }).value)

/**
 * Filas de la tabla comparativa. Las marcadas como always siempre salen; las demás
 * solo si cambian entre planes (una fila igual en todos no ayuda a decidir).
 */
export function compareRows(plans: ComparablePlan[]): CompareRow[] {
  return ROWS
    .filter(r => !r.present || plans.some(r.present))
    .map(r => ({ key: r.key, label: r.label, always: r.always, cells: plans.map(r.cell) }))
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
