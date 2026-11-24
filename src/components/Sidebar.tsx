 

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../components/WorkspaceContext'
import { useMobileSidebar } from './MobileSidebarContext'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { useBlockedNavigation } from '../hooks/useBlockedNavigation'
import { ROUTES } from '../lib/routes'
import { useEntitlements } from '../hooks/useEntitlements'
import { planLockFor } from '../lib/planLocks'
import { useCampaignsLocked } from '../hooks/useCampaignAccess'

import {
  LayoutDashboard, MessageSquare, Plug, Settings, Zap,
  Calendar, BarChart3, BrainCircuit, Stethoscope,
  ShieldAlert, X,
  Home, Utensils, UserSquare, UserCog, Megaphone, Sparkles,
  PackageOpen, Layers, CreditCard, ClipboardList, Lock
} from 'lucide-react'

// ============================================================================
// Sidebar — FLAT
// ============================================================================

const TEMPLATE_ICONS: Record<string, any> = {
  Stethoscope, Home, Utensils, Megaphone, Sparkles,
  Building: Home, ShoppingBag: PackageOpen
}

type MenuItem = {
  name: string
  href: string
  icon: any
  show: boolean
  badgeKey?: string
  /** Prefijo para marcarlo activo cuando href no es la raíz de la sección. */
  activePrefix?: string
}

export default function Sidebar() {
  const pathname = usePathname()
  const { platform, modules, primaryTemplate } = useWorkspace()
  const isAdmin = useIsAdmin()
  const guardClick = useBlockedNavigation()
  const { data: entitlements } = useEntitlements()
  const campaignsLocked = useCampaignsLocked()
  const planFeatures = entitlements?.features as Record<string, boolean | undefined> | undefined
  // Si el plan no incluye Clientes (Lite), el Gestor abre en Recordatorios.
  const crmHref = planLockFor('/dashboard/crm/clientes', planFeatures) ? '/dashboard/crm/recordatorios' : '/dashboard/crm'

  // Badges dinámicos
  const { data: badges = {} } = useQuery({
    queryKey: ['sidebar-badges'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return {}
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle()
      if (!profile?.company_id) return {}

      const now = new Date().toISOString()
      const { count: overdueTasks, error } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', profile.company_id)
        .is('completed_at', null)
        .lt('due_at', now)

      if (error) return {}
      return { overdue_tasks: overdueTasks || 0 }
    },
    refetchInterval: 60000
  })

  // ── Items ──────────────────────────────────────────────────────────────
  // Agrupados por para qué se usan: el día a día, lo propio de la industria,
  // crecer y configurar al agente. Entre grupos hay más aire que dentro.
  const primaryGroups: MenuItem[][] = [
    [
      { name: 'Dashboard',          href: '/dashboard',              icon: LayoutDashboard, show: true },
    ],
    [
      { name: 'Mensajes',           href: '/dashboard/inbox',        icon: MessageSquare,   show: true },
      { name: 'Calendario',         href: '/dashboard/calendar',     icon: Calendar,        show: !!modules.calendar },
      { name: 'Gestor de Clientes', href: crmHref,                  icon: UserSquare,      show: true, badgeKey: 'overdue_tasks', activePrefix: '/dashboard/crm' },
    ],
    [
      { name: 'Propiedades',        href: '/dashboard/properties',   icon: Home,            show: !!modules.properties },
      { name: 'Menú Digital',       href: '/dashboard/menu',         icon: Utensils,        show: !!modules.menu },
      { name: 'Órdenes',            href: '/dashboard/orders',       icon: ClipboardList,   show: !!modules.menu },
    ],
    [
      { name: 'Campañas',           href: '/dashboard/campaigns',    icon: Megaphone,       show: true },
      { name: 'Métricas',           href: '/dashboard/reports',      icon: BarChart3,       show: true },
    ],
    [
      { name: 'Agente AI',          href: '/dashboard/ai-agent',     icon: BrainCircuit,    show: true },
      { name: 'Equipo',             href: ROUTES.team,               icon: UserCog,         show: true },
      { name: 'Conectividad',       href: '/dashboard/connectivity', icon: Plug,            show: true },
    ],
  ]

  const isLocked = (item: MenuItem) =>
    !!planLockFor(item.href, planFeatures) || (item.href === '/dashboard/campaigns' && campaignsLocked)

  // Lo que el plan no incluye se junta al final, para que el menú empiece por
  // lo que sí se puede usar.
  const visibleItems = primaryGroups.flat().filter(i => i.show)
  const unlockedGroups = primaryGroups
    .map(group => group.filter(i => i.show && !isLocked(i)))
    .filter(group => group.length > 0)
  const lockedItems = visibleItems.filter(isLocked)

  const billingItems: MenuItem[] = [
    { name: 'Extras',     href: '/dashboard/addons',    icon: PackageOpen, show: true },
    { name: 'Mi Plan',    href: '/dashboard/plans',     icon: CreditCard,  show: true }
  ]

  // Variables CSS en vez del store: el servidor (ServerThemeStyle) y el
  // ThemeScript las fijan antes del primer paint y ThemeSync las mantiene al
  // día, así el HTML del servidor y el render del cliente usan el mismo valor.
  const themeColor  = 'var(--ia-theme)'
  const accentColor = 'var(--ia-accent)'
  const brandReady  = !!platform.name

  const renderItem = (item: MenuItem) => {
    const Icon = item.icon
    const sectionRoot = item.activePrefix || item.href
    const isActive =
      (pathname?.startsWith(sectionRoot) && sectionRoot !== '/dashboard') ||
      pathname === item.href

    const badgeValue = item.badgeKey ? (badges as any)[item.badgeKey] : 0
    const locked = isLocked(item)

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={guardClick(item.href)}
        className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl transition-all group ${
          isActive
            ? 'text-white shadow-lg font-bold'
            : 'hover:bg-black/20 text-white/70 hover:text-white'
        }`}
        style={isActive ? { backgroundColor: accentColor } : {}}
      >
        <Icon size={18} className={isActive ? 'text-white' : 'group-hover:text-white transition-colors'} />
        <span className={`flex-1 font-bold text-sm ${locked && !isActive ? 'opacity-60' : ''}`}>{item.name}</span>
        {locked && <Lock size={13} className="text-white/50" aria-label="No incluido en tu plan" />}
        {badgeValue > 0 && (
          <span
            className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
              isActive ? 'bg-white/25 text-white' : 'bg-rose-500/90 text-white'
            }`}
          >
            {badgeValue > 99 ? '99+' : badgeValue}
          </span>
        )}
      </Link>
    )
  }

  const { open: mobileOpen, setOpen: setMobileOpen } = useMobileSidebar()
  const isAdminSafe = isAdmin === true

  return (
    <>
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`
          fixed md:relative inset-y-0 left-0 z-50 w-72 flex flex-col border-r border-slate-800
          transition-transform duration-300 text-slate-400
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        style={{ backgroundColor: themeColor }}
      >
        {/* Close button (solo móvil) */}
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden absolute top-4 right-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white"
          aria-label="Cerrar menú"
        >
          <X size={18} />
        </button>

        {/* HEADER */}
        {/* Sin nombre la marca aún no cargó: se reserva el espacio vacío para no
            mostrar un placeholder que luego cambia. */}
        <div className="p-8 flex items-center gap-3">
          {!brandReady ? (
            <div className="h-10 w-10 shrink-0" />
          ) : platform.icon_url ? (
            <img
              src={platform.icon_url}
              alt="Icon"
              className="h-10 w-10 object-contain brightness-0 invert drop-shadow-sm"
            />
          ) : (
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center shadow-lg border border-white/20 shrink-0"
              style={{ backgroundColor: `color-mix(in srgb, ${accentColor} 19%, transparent)` }}
            >
              <Zap className="text-white fill-white" size={20} />
            </div>
          )}

          <div className="flex flex-col gap-1.5 justify-center">
            {!brandReady ? (
              <div className="h-5" />
            ) : platform.logo_url ? (
              <img
                src={platform.logo_url}
                alt="Logo"
                className="h-5 w-auto object-contain brightness-0 invert drop-shadow-sm object-left"
              />
            ) : (
              <span className="text-xl font-black text-white tracking-tight leading-none">
                {platform.name}
              </span>
            )}
            <span className="text-[10px] font-black uppercase tracking-widest leading-none text-white/70">
              {brandReady ? (primaryTemplate?.tenant_label || 'Plataforma') : ' '}
            </span>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 overflow-y-auto scrollbar-hide">
          {unlockedGroups.map((group, gi) => (
            <div key={gi} className={`space-y-1 ${gi > 0 ? 'mt-3 pt-3 border-t border-white/5' : ''}`}>
              {group.map(i => renderItem(i))}
            </div>
          ))}

          {lockedItems.length > 0 && (
            <div className="pt-6 mt-6 border-t border-white/10 space-y-1">
              <p className="px-4 text-[10px] font-black text-white/40 uppercase mb-3 tracking-[0.2em]">
                Mejora tu plan
              </p>
              {lockedItems.map(i => renderItem(i))}
            </div>
          )}

          <div className="pt-6 mt-6 border-t border-white/10 space-y-1.5">
            <p className="px-4 text-[10px] font-black text-white/40 uppercase mb-3 tracking-[0.2em]">
              Mi Plan
            </p>
            {billingItems.map(i => renderItem(i))}
          </div>

          {/* ⚠️ Master Control — SOLO si isAdminSafe === true */}
          {isAdminSafe && (
            <div className="pt-6 mt-6 border-t border-white/10">
              <p className="px-4 text-[10px] font-black text-white/40 uppercase mb-3 tracking-[0.2em]">
                Master Control
              </p>
              <Link
                href="/dashboard/admin"
                className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl transition-all ${
                  pathname === '/dashboard/admin'
                    ? 'text-white shadow-lg font-bold'
                    : 'hover:bg-black/20 text-white/70 hover:text-white'
                }`}
                style={pathname === '/dashboard/admin' ? { backgroundColor: accentColor } : {}}
              >
                <ShieldAlert size={18} />
                <span className="font-bold text-sm">Panel Admin</span>
              </Link>
            </div>
          )}
        </nav>

        {/* Footer — Configuración con mejor contraste */}
        <div className="px-4 pb-8">
          <Link
            href="/dashboard/settings"
            onClick={guardClick('/dashboard/settings')}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl transition-all ${
              pathname === '/dashboard/settings'
                ? 'text-white border border-white/10'
                : 'text-white/70 hover:text-white hover:bg-black/20'
            }`}
            style={pathname === '/dashboard/settings' ? { backgroundColor: accentColor } : {}}
          >
            <Settings size={18} />
            <span className="font-semibold text-sm">Configuración</span>
          </Link>
        </div>
      </aside>
    </>
  )
}