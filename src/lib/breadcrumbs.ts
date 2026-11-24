// Ruta que muestra el encabezado del panel ("Inicio / Órdenes / Pedidos"),
// armada con la dirección de la página. Cada parte enlaza a su página; las
// pestañas que viven en ?tab= (Órdenes, Configuración) cuentan como un nivel.

export type Crumb = { label: string; href: string | null }

type Labels = { clients?: string; staff_plural?: string } | null | undefined

const SECTION: Record<string, string> = {
  addons: 'Extras',
  admin: 'Panel Admin',
  'ai-agent': 'Agente AI',
  billing: 'Facturación',
  'datos-fiscales': 'Datos fiscales',
  facturas: 'Facturas',
  calendar: 'Calendario',
  campaigns: 'Campañas',
  connectivity: 'Conectividad',
  diagnostico: 'Diagnóstico',
  facebook: 'Facebook',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  hubspot: 'HubSpot',
  contacts: 'Contactos',
  crm: 'Gestor de Clientes',
  equipo: 'Equipo',
  etiquetas: 'Etiquetas',
  recordatorios: 'Recordatorios',
  tareas: 'Tareas',
  help: 'Ayuda',
  inbox: 'Mensajes',
  menu: 'Menú digital',
  'opt-outs': 'Bajas',
  orders: 'Órdenes',
  plans: 'Mi Plan',
  properties: 'Propiedades',
  'catalogo-web': 'Catálogo web',
  reminders: 'Recordatorios',
  reports: 'Métricas',
  services: 'Servicios',
  settings: 'Configuración',
  tags: 'Etiquetas',
  tasks: 'Tareas',
  team: 'Equipo',
  templates: 'Plantillas',
}

/** Rutas que no tienen página propia: la parte de la ruta se muestra sin enlace. */
const NO_PAGE = new Set(['/dashboard/billing'])

const TABS: Record<string, Record<string, string>> = {
  '/dashboard/orders': { list: 'Pedidos', tracking: 'Tracking', settings: 'Configuración' },
  '/dashboard/settings': {
    profile: 'Perfil y contacto', brand: 'Marca de tu negocio', hours: 'Horarios de atención',
    calendars: 'Google Calendar', widget: 'Widget público',
  },
}

export function breadcrumbs(pathname: string, search: string, labels?: Labels): Crumb[] {
  const crumbs: Crumb[] = [{ label: 'Inicio', href: '/dashboard' }]
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  if (parts[0] !== 'dashboard') return crumbs

  let href = '/dashboard'
  for (const part of parts.slice(1)) {
    href += `/${part}`
    let label = SECTION[part]
    if (part === 'clientes') label = labels?.clients || 'Clientes'
    if (!label) continue
    crumbs.push({ label, href: NO_PAGE.has(href) ? null : href })
  }

  // Sin ?tab= (o con uno que no existe) se muestra la primera pestaña, que
  // es la que abre la página.
  const tabs = TABS[href]
  if (tabs) {
    const asked = new URLSearchParams(search).get('tab')
    const tab = asked && tabs[asked] ? asked : Object.keys(tabs)[0]
    crumbs.push({ label: tabs[tab], href: `${href}?tab=${tab}` })
  }

  return crumbs
}
