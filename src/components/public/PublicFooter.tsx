 

// ============================================================================
// src/components/public/PublicFooter.tsx
// ----------------------------------------------------------------------------
// Footer dark con logo desde platform_settings. Aplica brightness-0 invert
// para volverlo blanco sobre el fondo slate-950 (mismo patrón que Sidebar).
// ============================================================================

import Link from 'next/link'
import { Mail, MessageCircle, MapPin } from 'lucide-react'

interface PublicFooterProps {
  brandName?: string
  logoUrl?: string
  tagline?: string
  contactEmail?: string   
  contactWhatsapp?: string
  contactAddress?: string
}

const COLUMNS = [
  {
    title: 'Producto',
    links: [
      { label: 'Funciones',        href: '/funciones' },
      { label: 'Industrias',       href: '/industrias' },
      { label: 'Integraciones',    href: '/integraciones' },
      { label: 'Precios',          href: '/precios' }
    ]
  },
  {
    title: 'Recursos',
    links: [
      { label: 'Centro de ayuda',  href: '/recursos/ayuda' },
      { label: 'Contacto',         href: '/contacto' }
    ]
  },
  {
    title: 'Empresa',
    links: [
      { label: 'Sobre nosotros',   href: '/sobre-nosotros' },
      { label: 'Contacto',         href: '/contacto' }
    ]
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacidad',       href: '/legal/privacidad' },
      { label: 'Términos',         href: '/legal/terminos' },
      { label: 'Cookies',          href: '/legal/cookies' }
    ]
  }
]

export default function PublicFooter({
  brandName = 'Mi Plataforma',
  logoUrl = '',
  tagline,
  contactEmail,
  contactWhatsapp,
  contactAddress
}: PublicFooterProps) {

  return (
    <footer className="bg-slate-950 text-slate-400 border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 md:py-16">

        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 md:gap-12 mb-12">

          {/* Brand */}
          <div className="col-span-2">
            <Link href="/" className="inline-flex items-center gap-2 group mb-4">
              {logoUrl ? (
                // brightness-0 invert = volver el logo blanco sobre fondo dark
                <img
                  src={logoUrl}
                  alt={brandName}
                  className="h-8 w-auto object-contain object-left brightness-0 invert drop-shadow-sm"
                />
              ) : (
                <span className="font-black text-lg tracking-tight text-white">
                  {brandName}
                </span>
              )}
            </Link>
            <p className="text-sm text-slate-500 leading-relaxed max-w-xs">
              {tagline}
            </p>

            {/* Contacto */}
            <div className="mt-6 space-y-2">
              {contactEmail && (
                <a href={`mailto:${contactEmail}`} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
                  <Mail size={14} /> {contactEmail}
                </a>
              )}
              {contactWhatsapp && (
                <a href={`https://wa.me/${contactWhatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener" className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
                  <MessageCircle size={14} /> {contactWhatsapp}
                </a>
              )}
              {contactAddress && (
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <MapPin size={14} /> {contactAddress}
                </p>
              )}
            </div>
          </div>

          {/* Columnas de links */}
          {COLUMNS.map(col => (
            <div key={col.title}>
              <p className="text-xs font-black text-white uppercase tracking-[0.15em] mb-4">
                {col.title}
              </p>
              <ul className="space-y-2.5">
                {col.links.map(link => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-400 hover:text-white transition-colors font-medium"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="pt-8 border-t border-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <p className="text-xs text-slate-500 font-medium">
            © {new Date().getFullYear()} {brandName}. Todos los derechos reservados.
          </p>
          <p className="text-xs text-slate-600 font-medium">
            Hecho con cariño en Mérida 🇲🇽
          </p>
        </div>
      </div>
    </footer>
  )
}
