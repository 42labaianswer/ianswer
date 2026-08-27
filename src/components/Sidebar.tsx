 

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../components/WorkspaceContext'
import { useMobileSidebar } from './MobileSidebarContext'
import { useIsAdmin } from '../hooks/useIsAdmin'

import {
  LayoutDashboard, MessageSquare, Plug, Settings, Zap,
  Calendar, BarChart3, BrainCircuit, Stethoscope,
  ShieldAlert, X,
  Home, Utensils, UserSquare, Megaphone, Sparkles,
  PackageOpen, Layers, CreditCard, ClipboardList
} from 'lucide-react'

// ============================================================================
// Sidebar v3.2 — FLAT
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
}

export default function Sidebar() {
  const pathname = usePathname()
  const { platform, modules, primaryTemplate } = useWorkspace()
  const isAdmin = useIsAdmin()

  console.log('[Sidebar] isAdmin =', isAdmin)

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
  const primaryItems: MenuItem[] = [
    { name: 'Dashboard',          href: '/dashboard',              icon: LayoutDashboard, show: true },
    { name: 'Mensajes',           href: '/dashboard/inbox',        icon: MessageSquare,   show: true },
    { name: 'Agente AI',          href: '/dashboard/ai-agent',     icon: BrainCircuit,    show: true },
    { name: 'Gestor de Clientes', href: '/dashboard/crm',          icon: UserSquare,      show: true, badgeKey: 'overdue_tasks' },
    { name: 'Calendario',         href: '/dashboard/calendar',     icon: Calendar,        show: !!modules.calendar },
    { name: 'Propiedades',        href: '/dashboard/properties',   icon: Home,            show: !!modules.properties },
    { name: 'Menú Digital',       href: '/dashboard/menu',         icon: Utensils,        show: !!modules.menu },
    { name: 'Órdenes',            href: '/dashboard/orders',       icon: ClipboardList,   show: !!modules.menu },
    { name: 'Reportes',           href: '/dashboard/reports',      icon: BarChart3,       show: true },
    { name: 'Conectividad',       href: '/dashboard/connectivity', icon: Plug,            show: true }
  ]

  const billingItems: MenuItem[] = [
    { name: 'Extras',     href: '/dashboard/addons',    icon: PackageOpen, show: true },
    { name: 'Mi Plan',    href: '/dashboard/plans',     icon: CreditCard,  show: true }
  ]

  const themeColor  = primaryTemplate?.theme_color  || '#020617'
  const accentColor = primaryTemplate?.accent_color || '#4f46e5'

  const renderItem = (item: MenuItem) => {
    const Icon = item.icon
    const isActive =
      (pathname?.startsWith(item.href) && item.href !== '/dashboard') ||
      pathname === item.href

    const badgeValue = item.badgeKey ? (badges as any)[item.badgeKey] : 0

    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl transition-all group ${
          isActive
            ? 'text-white shadow-lg font-bold'
            : 'hover:bg-black/20 text-white/70 hover:text-white'
        }`}
        style={isActive ? { backgroundColor: accentColor } : {}}
      >
        <Icon size={18} className={isActive ? 'text-white' : 'group-hover:text-white transition-colors'} />
        <span className="flex-1 font-bold text-sm">{item.name}</span>
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
        <div className="p-8 flex items-center gap-3">
          {platform?.icon_url ? (
            <img
              src={platform.icon_url}
              alt="Icon"
              className="h-10 w-10 object-contain brightness-0 invert drop-shadow-sm"
            />
          ) : (
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center shadow-lg border border-white/20 shrink-0"
              style={{ backgroundColor: `${accentColor}30` }}
            >
              <Zap className="text-white fill-white" size={20} />
            </div>
          )}

          <div className="flex flex-col gap-1.5 justify-center">
            {platform?.logo_url ? (
              <img
                src={platform.logo_url}
                alt="Logo"
                className="h-5 w-auto object-contain brightness-0 invert drop-shadow-sm object-left"
              />
            ) : (
              <span className="text-xl font-black text-white tracking-tight leading-none">
                {platform?.name || 'iAnswer'}
              </span>
            )}
            <span className="text-[10px] font-black uppercase tracking-widest leading-none text-white/70">
              {primaryTemplate?.tenant_label || 'Plataforma'}
            </span>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto">
          {primaryItems.filter(i => i.show).map(i => renderItem(i))}

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