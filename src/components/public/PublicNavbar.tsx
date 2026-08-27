 

'use client'

// ============================================================================
// src/components/public/PublicNavbar.tsx
// ----------------------------------------------------------------------------
// Navbar pública con dropdowns. Industrias se cargan dinámicamente desde
// site_industries. Logo desde platform_settings.
// ============================================================================

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, ChevronDown } from 'lucide-react'

interface IndustryItem {
  slug: string
  name: string
  tagline: string | null
  accent_color: string | null
}

interface Props {
  brandName?: string
  logoUrl?: string
  industries?: IndustryItem[]
}

export default function PublicNavbar({
  brandName = 'iAnswer',
  logoUrl = '',
  industries = []
}: Props) {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
    setOpenDropdown(null)
  }, [pathname])

  // Items del menú Producto
  const productoChildren = [
    { label: 'Funciones',     href: '/funciones',     description: 'Todo lo que hace iAnswer' },
    { label: 'Integraciones', href: '/integraciones', description: 'Canales y conexiones' },
    { label: 'Addons',        href: '/addons',        description: 'Extiende tu agente cuando quieras' }
  ]

  // Submenu Industrias dinámico
  const industriasChildren = industries.length > 0
    ? industries.map(ind => ({
        label: ind.name,
        href: `/industrias/${ind.slug}`,
        description: ind.tagline || undefined,
        color: ind.accent_color || undefined
      }))
    : []

  return (
    <header className={`fixed top-0 inset-x-0 z-50 transition-all ${
      scrolled
        ? 'bg-white/85 backdrop-blur-md border-b border-stone-200/60 shadow-sm'
        : 'bg-transparent'
    }`}>
      <nav className="max-w-7xl mx-auto px-4 md:px-8 h-16 md:h-20 flex items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group shrink-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={brandName}
              className="h-8 md:h-9 w-auto object-contain object-left group-hover:scale-105 transition-transform"
            />
          ) : (
            <span className="font-black text-lg tracking-tight text-stone-900">
              {brandName}
            </span>
          )}
        </Link>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-1">
          {/* Producto dropdown */}
          <Dropdown
            label="Producto"
            isOpen={openDropdown === 'Producto'}
            onHover={() => setOpenDropdown('Producto')}
            onLeave={() => setOpenDropdown(null)}
            items={productoChildren}
          />

          {/* Industrias dropdown — solo si hay industrias cargadas */}
          {industriasChildren.length > 0 && (
            <Dropdown
              label="Industrias"
              isOpen={openDropdown === 'Industrias'}
              onHover={() => setOpenDropdown('Industrias')}
              onLeave={() => setOpenDropdown(null)}
              items={industriasChildren}
              footer={{ label: 'Ver todas las industrias', href: '/industrias' }}
            />
          )}

          {/* Precios — simple link */}
          <Link
            href="/precios"
            className="px-4 py-2 text-sm font-bold text-stone-700 hover:text-stone-900 rounded-xl hover:bg-stone-50 transition-colors"
          >
            Precios
          </Link>

          {/* Recursos dropdown */}
          <Dropdown
            label="Recursos"
            isOpen={openDropdown === 'Recursos'}
            onHover={() => setOpenDropdown('Recursos')}
            onLeave={() => setOpenDropdown(null)}
            items={[
              { label: 'Centro de ayuda', href: '/recursos/ayuda', description: 'Guías y documentación' },
              { label: 'Contacto',        href: '/contacto',       description: 'Hablar con el equipo' }
            ]}
          />

          {/* Sobre nosotros */}
          <Link
            href="/sobre-nosotros"
            className="px-4 py-2 text-sm font-bold text-stone-700 hover:text-stone-900 rounded-xl hover:bg-stone-50 transition-colors"
          >
            Sobre nosotros
          </Link>
        </div>

        {/* CTAs */}
        <div className="hidden lg:flex items-center gap-2 shrink-0">
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-bold text-stone-700 hover:text-stone-900 rounded-xl hover:bg-stone-50 transition-colors"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/login?signup=1"
            className="px-5 py-2.5 text-sm font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-600/20 transition-colors"
          >
            Probar gratis
          </Link>
        </div>

        {/* Mobile menu trigger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="lg:hidden p-2 -mr-2 rounded-xl text-stone-700 hover:bg-stone-100 transition-colors"
          aria-label="Menú"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div className="lg:hidden fixed inset-0 top-16 bg-black/40 backdrop-blur-sm z-40" onClick={() => setMobileOpen(false)} />
          <div className="lg:hidden fixed inset-x-0 top-16 bottom-0 bg-white z-50 overflow-y-auto">
            <div className="px-4 py-6 space-y-1">

              <MobileGroup label="Producto" items={productoChildren} />
              {industriasChildren.length > 0 && (
                <MobileGroup
                  label="Industrias"
                  items={industriasChildren}
                  footer={{ label: 'Ver todas', href: '/industrias' }}
                />
              )}
              <Link href="/precios" className="block px-4 py-3 rounded-xl text-base font-bold text-stone-900 hover:bg-stone-50">
                Precios
              </Link>
              <MobileGroup
                label="Recursos"
                items={[
                  { label: 'Centro de ayuda', href: '/recursos/ayuda' },
                  { label: 'Contacto',        href: '/contacto' }
                ]}
              />
              <Link href="/sobre-nosotros" className="block px-4 py-3 rounded-xl text-base font-bold text-stone-900 hover:bg-stone-50">
                Sobre nosotros
              </Link>

              <div className="border-t border-stone-100 pt-4 mt-4 space-y-2">
                <Link href="/login" className="block w-full px-4 py-3 rounded-xl text-center text-sm font-bold text-stone-700 bg-stone-50 hover:bg-stone-100">
                  Iniciar sesión
                </Link>
                <Link href="/login?signup=1" className="block w-full px-4 py-3 rounded-xl text-center text-sm font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20">
                  Probar gratis
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Dropdown desktop reusable
// ────────────────────────────────────────────────────────────────────────────
function Dropdown({
  label, isOpen, onHover, onLeave, items, footer
}: {
  label: string
  isOpen: boolean
  onHover: () => void
  onLeave: () => void
  items: Array<{ label: string; href: string; description?: string; color?: string }>
  footer?: { label: string; href: string }
}) {
  return (
    <div className="relative" onMouseEnter={onHover} onMouseLeave={onLeave}>
      <button className="px-4 py-2 text-sm font-bold text-stone-700 hover:text-stone-900 rounded-xl hover:bg-stone-50 transition-colors flex items-center gap-1">
        {label}
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 pt-2 min-w-[300px] animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="bg-white rounded-2xl shadow-2xl shadow-stone-300/40 border border-stone-200 overflow-hidden p-2">
            {items.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-stone-50 transition-colors group"
              >
                {item.color && (
                  <span
                    className="shrink-0 h-2.5 w-2.5 rounded-full mt-1.5"
                    style={{ backgroundColor: item.color }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-stone-900 group-hover:text-emerald-600 transition-colors">
                    {item.label}
                  </p>
                  {item.description && (
                    <p className="text-xs text-stone-500 font-medium mt-0.5 truncate">
                      {item.description}
                    </p>
                  )}
                </div>
              </Link>
            ))}
            {footer && (
              <Link
                href={footer.href}
                className="block px-3 py-2.5 mt-1 border-t border-stone-100 text-sm font-black text-emerald-600 hover:bg-emerald-50 rounded-b-xl transition-colors"
              >
                {footer.label} →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Mobile group (acordeón-like)
// ────────────────────────────────────────────────────────────────────────────
function MobileGroup({
  label, items, footer
}: {
  label: string
  items: Array<{ label: string; href: string; description?: string }>
  footer?: { label: string; href: string }
}) {
  return (
    <div>
      <div className="px-4 pt-4 pb-2 text-xs font-black text-stone-400 uppercase tracking-[0.15em]">
        {label}
      </div>
      {items.map(item => (
        <Link
          key={item.href}
          href={item.href}
          className="block px-4 py-2.5 rounded-xl text-sm font-bold text-stone-700 hover:bg-stone-50"
        >
          {item.label}
        </Link>
      ))}
      {footer && (
        <Link
          href={footer.href}
          className="block px-4 py-2 rounded-xl text-xs font-black text-emerald-600 hover:bg-emerald-50"
        >
          {footer.label} →
        </Link>
      )}
    </div>
  )
}
