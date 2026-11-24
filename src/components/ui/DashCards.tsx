'use client'

// Tarjetas del inicio y de Métricas: la estructura del diseño de Figma
// (dashboard nov 2026) con los colores de la marca (--ia-accent) y el
// redondeo y peso de letra del resto del panel.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'

/** Fondo suave del color de la marca. */
export const accentTint = (percent = 10) => `color-mix(in srgb, var(--ia-accent) ${percent}%, transparent)`

export function StatCard({ title, subtitle, value, suffix, icon, href, footer }: {
  title: string
  subtitle?: string
  value: ReactNode
  suffix?: string
  icon: ReactNode
  href?: string
  footer?: ReactNode
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
