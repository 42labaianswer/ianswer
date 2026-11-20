// Secciones del dashboard que dependen del plan. Las usan el menú lateral
// (candado en el enlace) y PlanLockGate (pantalla "no incluido en tu plan").
// Una sección solo se bloquea si el flag del plan es exactamente false: los
// planes que no traen el flag (bases sin planes_nov2026.sql) no cambian.

export type PlanLock = {
  /** Rutas que cubre (se compara el inicio del path). */
  prefixes: string[]
  /** Flag de get_company_entitlements().features que la habilita. */
  flag: string
  name: string
  description: string
}

const CRM_FULL = 'Clientes, tareas y etiquetas vienen desde el plan Start. En tu plan atiendes desde Mensajes y Calendario, y configuras tus Recordatorios.'

export const PLAN_LOCKS: PlanLock[] = [
  { prefixes: ['/dashboard/crm/clientes', '/dashboard/contacts'], flag: 'plan_panel_full', name: 'Clientes', description: CRM_FULL },
  { prefixes: ['/dashboard/crm/tareas', '/dashboard/tasks'], flag: 'plan_panel_full', name: 'Tareas', description: CRM_FULL },
  { prefixes: ['/dashboard/crm/etiquetas', '/dashboard/tags'], flag: 'plan_panel_full', name: 'Etiquetas', description: CRM_FULL },
  { prefixes: ['/dashboard/crm/hubspot'], flag: 'plan_panel_full', name: 'Integración con HubSpot', description: 'Las integraciones con otros CRM vienen desde el plan Start.' },
  { prefixes: ['/dashboard/reports'], flag: 'plan_panel_full', name: 'Métricas', description: 'Los reportes con KPIs vienen desde el plan Start.' },
  { prefixes: ['/dashboard/menu', '/dashboard/orders'], flag: 'plan_panel_full', name: 'Menú digital y órdenes', description: 'El menú digital y las órdenes vienen desde el plan Start.' },
  {
    prefixes: ['/dashboard/team'],
    flag: 'team_management',
    name: 'Equipo',
    description: 'El equipo de trabajo (quién atiende qué, horarios y especialidades) no está incluido en tu plan.',
  },
]

type Features = Record<string, boolean | undefined> | null | undefined

function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/')
}

/** Bloqueo que aplica a la ruta, o null si el plan la incluye. */
export function planLockFor(path: string | null | undefined, features: Features): PlanLock | null {
  if (!path || !features) return null
  return PLAN_LOCKS.find(l => features[l.flag] === false && l.prefixes.some(p => matches(path, p))) ?? null
}
