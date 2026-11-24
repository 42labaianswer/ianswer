'use client'

// Ruta del encabezado del panel ("Inicio / Órdenes / Pedidos"). Cada parte es
// un enlace menos la última. En el celular solo se ve la página actual.

import { Fragment } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { breadcrumbs } from '../lib/breadcrumbs'
import { useWorkspace } from './WorkspaceContext'

export default function Breadcrumbs() {
  const pathname = usePathname() || '/dashboard'
  const search = useSearchParams()?.toString() || ''
  const { labels } = useWorkspace()
  const crumbs = breadcrumbs(pathname, search, labels)

  return (
    <nav aria-label="Ruta" className="flex items-center gap-2 text-sm min-w-0">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1
        return (
          <Fragment key={`${c.label}-${i}`}>
            {i > 0 && <span className="text-slate-300 hidden sm:inline">/</span>}
            {last ? (
              <span className="text-slate-900 font-semibold tracking-tight truncate" aria-current="page">{c.label}</span>
            ) : c.href ? (
              <Link href={c.href} className="hidden sm:inline text-slate-400 font-medium hover:text-slate-700 transition-colors whitespace-nowrap">
                {c.label}
              </Link>
            ) : (
              <span className="hidden sm:inline text-slate-400 font-medium whitespace-nowrap">{c.label}</span>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
