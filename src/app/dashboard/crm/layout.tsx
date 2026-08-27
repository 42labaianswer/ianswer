 

'use client'

// ============================================================================
// src/app/dashboard/crm/layout.tsx · v4.0 (responsive)
// ----------------------------------------------------------------------------
// Desktop: sidebar interno vertical pegado al sidebar principal.
// Mobile: tabs horizontales scrolleables arriba.
// ============================================================================

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Users, UserCog, ListChecks, Bell, Clock, Tag as TagIcon
} from 'lucide-react'

const TABS = [
  { slug: 'clientes',      label: 'Clientes',       icon: Users,      title: 'Clientes',        description: 'Tu base de contactos y prospectos.' },
  { slug: 'equipo',        label: 'Equipo',         icon: UserCog,    title: 'Equipo',          description: 'Tu equipo profesional. El bot responde sobre cada miembro como su recepcionista.' },
  { slug: 'tareas',        label: 'Tareas',         icon: ListChecks, title: 'Tareas',          description: 'Pendientes y seguimientos. Anclas a un contacto o asignas a alguien del equipo.' },
  { slug: 'recordatorios', label: 'Recordatorios',  icon: Bell,       title: 'Recordatorios',   description: 'Avisos automáticos que el bot envía al cliente o a tu equipo.' },
  { slug: 'lista-espera',  label: 'Lista de espera', icon: Clock,     title: 'Lista de espera', description: 'Clientes esperando cupo, llamada o respuesta.' },
  { slug: 'etiquetas',     label: 'Etiquetas',      icon: TagIcon,    title: 'Etiquetas',       description: 'Categorías visuales para segmentar y organizar tu base.' }
] as const

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const currentSlug = pathname.split('/').filter(Boolean).pop() || 'clientes'
  const currentTab = TABS.find(t => t.slug === currentSlug) || TABS[0]

  return (
    <div className="flex flex-col md:flex-row md:h-[calc(100vh-80px)] bg-slate-50">

      {/* ── MOBILE: tabs horizontales scrolleables ─────────────────────── */}
      <div className="md:hidden bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <nav className="flex gap-1 overflow-x-auto px-3 py-2 scrollbar-hide">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = currentSlug === tab.slug
            return (
              <Link
                key={tab.slug}
                href={`/dashboard/crm/${tab.slug}`}
                className={`shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-white' : 'text-slate-400'} />
                <span>{tab.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      {/* ── DESKTOP: Sidebar interno ────────────────────────────────────── */}
      <aside className="hidden md:flex w-64 bg-white border-r border-slate-200 shrink-0 flex-col">
        <div className="px-5 pt-6 pb-5 border-b border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
            Dashboard
          </p>
          <h2 className="text-base font-black text-slate-900 tracking-tight">
            Gestor de Clientes
          </h2>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto">
          <div className="space-y-1">
            {TABS.map(tab => {
              const Icon = tab.icon
              const isActive = currentSlug === tab.slug
              return (
                <Link
                  key={tab.slug}
                  href={`/dashboard/crm/${tab.slug}`}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-md'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon size={16} className={isActive ? 'text-white' : 'text-slate-400'} />
                  <span>{tab.label}</span>
                </Link>
              )
            })}
          </div>
        </nav>

        <div className="p-4 border-t border-slate-100">
          <p className="text-[10px] text-slate-400 leading-relaxed">
            El bot AI usa toda esta información para responder a tus clientes con contexto preciso.
          </p>
        </div>
      </aside>

      {/* ── Content area ────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col md:overflow-hidden">
        {/* Header del tab (desktop) */}
        <header className="hidden md:block bg-white border-b border-slate-200 px-8 py-5 shrink-0">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-0.5">
            {currentTab.title}
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            {currentTab.description}
          </p>
        </header>

        {/* Header del tab (mobile - más compacto) */}
        <header className="md:hidden bg-white border-b border-slate-200 px-4 py-4">
          <h1 className="text-xl font-black text-slate-900 tracking-tight mb-0.5">
            {currentTab.title}
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            {currentTab.description}
          </p>
        </header>

        {/* Page content scrolleable */}
        <div className="flex-1 md:overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}
