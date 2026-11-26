'use client'

// Tarjetas del inicio y de Métricas: la estructura del diseño de Figma
// (dashboard nov 2026) con los colores de la marca (--ia-accent) y el
// redondeo y peso de letra del resto del panel.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight, ChevronRight } from 'lucide-react'

/** Fondo suave del color de la marca. */
export const accentTint = (percent = 10) => `color-mix(in srgb, var(--ia-accent) ${percent}%, transparent)`

export type StatShortcut = { key: string; label: string; href: string; avatarUrl?: string | null }

const initialsOf = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?'

export function StatCard({ title, subtitle, value, suffix, icon, href, footer, shortcuts }: {
  title: string
  subtitle?: string
  value: ReactNode
  suffix?: string
  icon: ReactNode
  href?: string
  footer?: ReactNode
  /** Lista corta de enlaces debajo del número (p. ej. los últimos 3 clientes). */
  shortcuts?: { items: StatShortcut[]; empty: string }
}) {
  const body = (
    <>
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-800">{title}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        <p className="text-3xl font-black text-slate-900 mt-3 tabular-nums tracking-tight">
          {value}
          {suffix && <span className="text-lg text-slate-400 ml-1">{suffix}</span>}
        </p>
        {footer && <div className="mt-1.5">{footer}</div>}
      </div>
      <span
        className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-(--ia-accent)"
        style={{ backgroundColor: accentTint(12) }}
      >
        {icon}
      </span>
    </>
  )
  const cls = 'bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex items-start justify-between gap-3'
  if (shortcuts) {
    // Los atajos son enlaces propios, así que la tarjeta no puede ser un <a>.
    return (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col hover:border-(--ia-accent)/40 transition-all">
        {href
          ? <Link href={href} className="p-5 pb-3 flex items-start justify-between gap-3 group">{body}</Link>
          : <div className="p-5 pb-3 flex items-start justify-between gap-3">{body}</div>}
        <div className="px-3 pb-3 mt-auto">
          {shortcuts.items.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-slate-400">{shortcuts.empty}</p>
          ) : (
            <ul className="border-t border-slate-100 pt-2 space-y-0.5">
              {shortcuts.items.map(s => (
                <li key={s.key}>
                  <Link href={s.href} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 group/s">
                    {s.avatarUrl
                      ? <img src={s.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" />
                      : (
                        <span
                          className="h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-(--ia-accent)"
                          style={{ backgroundColor: accentTint(14) }}
                        >
                          {initialsOf(s.label)}
                        </span>
                      )}
                    <span className="flex-1 min-w-0 truncate text-sm text-slate-700 group-hover/s:text-slate-900">{s.label}</span>
                    <ChevronRight size={14} className="text-slate-300 group-hover/s:text-slate-500 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }
  return href
    ? <Link href={href} className={`${cls} hover:border-(--ia-accent)/40 hover:shadow-md transition-all`}>{body}</Link>
    : <div className={cls}>{body}</div>
}

export function SectionCard({ title, icon, href, linkLabel, badge, actions, children, bodyClassName = 'px-5 py-4' }: {
  title: string
  icon?: ReactNode
  href?: string
  linkLabel?: string
  badge?: number
  actions?: ReactNode
  children: ReactNode
  bodyClassName?: string
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col min-w-0 overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-5 pt-5 pb-4 border-b border-slate-100">
        <h2 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2 min-w-0">
          {icon && <span className="text-(--ia-accent) shrink-0">{icon}</span>}
          <span className="truncate">{title}</span>
          {!!badge && badge > 0 && (
            <span className="text-[10px] font-bold text-white bg-(--ia-accent) rounded-full px-1.5 py-0.5">{badge > 99 ? '99+' : badge}</span>
          )}
        </h2>
        {actions}
        {href && linkLabel && (
          <Link href={href} className="shrink-0 inline-flex items-center gap-1 text-sm font-bold text-(--ia-accent) hover:underline">
            {linkLabel} <ArrowRight size={14} />
          </Link>
        )}
      </header>
      <div className={`flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  )
}
