 

'use client'

// ============================================================================
// src/components/DashboardHeader.tsx
// ----------------------------------------------------------------------------
// Header sticky del dashboard. En mobile incluye botón hamburger que abre
// el sidebar drawer.
// ============================================================================

import Link from 'next/link'
import { LifeBuoy, Menu } from 'lucide-react'
import { useMobileSidebar } from './MobileSidebarContext'
import NotificationsWidget from './NotificationsWidget'
import ProfileWidget from './ProfileWidget'

export default function DashboardHeader() {
  const { toggle } = useMobileSidebar()

  return (
    <header className="h-16 md:h-20 flex items-center justify-between px-4 md:px-8 shrink-0 z-30 bg-slate-50/80 backdrop-blur-md sticky top-0 border-b border-slate-200/50">

      <div className="flex items-center gap-3">
        {/* Hamburger - solo móvil */}
        <button
          onClick={toggle}
          className="md:hidden p-2 -ml-2 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors"
          aria-label="Abrir menú"
        >
          <Menu size={22} />
        </button>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400 font-medium hidden sm:inline">Dashboard</span>
          <span className="text-slate-300 hidden sm:inline">/</span>
          <span className="text-slate-900 font-semibold tracking-tight">Panel Principal</span>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-5">

        <Link
          href="/dashboard/help"
          className="text-slate-400 hover:text-blue-600 transition-colors p-2 rounded-full hover:bg-slate-100 hidden sm:block"
          title="Centro de Ayuda"
        >
          <LifeBuoy size={20} strokeWidth={1.5} />
        </Link>

        <NotificationsWidget />

        <div className="w-px h-6 bg-slate-200 hidden sm:block"></div>

        <ProfileWidget />
      </div>
    </header>
  )
}
