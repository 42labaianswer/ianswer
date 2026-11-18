'use client'

// Selector de planes de Mi Plan, en una sola tarjeta: encabezado con título y
// acciones (mensual/anual), una barra de pestañas verticales con los planes y
// el panel con el detalle del elegido. La pestaña activa se funde con el
// panel para que se lea que lo controla. En pantallas angostas los planes van
// en un menú desplegable arriba del panel. Usa el acento de la industria (--ia-accent). La selección la maneja
// la página para que la tabla comparativa resalte la misma columna.

import { useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, Layers, Loader2, Info, MessagesSquare, Users, Radio, CalendarDays } from 'lucide-react'
import {
  featureLines, formatMXN, pricePerMonthCents, yearlyDiscountPct,
  type BillingMode, type ComparablePlan,
} from '../lib/planCompare'
import { tierInfo } from '../lib/planTiers'

const HINTS: Record<string, string> = {
  sessions: 'Cada cliente único que te escribe en el mes cuenta como una conversación, sin importar cuántos mensajes intercambien.',
  members: 'Los miembros son las personas de tu Equipo que atienden a tus clientes (por ejemplo, estilistas o doctores). Desactivar a un miembro libera su lugar.',
}

const ENTER = 'animate-rise-in motion-reduce:animate-none'

function Hint({ text }: { text: string }) {
  return (
    <span className="relative inline-flex align-middle group/hint">
      <button type="button" aria-label={text} className="text-slate-400 hover:text-slate-600 focus:text-slate-600 focus:outline-none">
        <Info size={12} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-medium normal-case tracking-normal leading-snug text-white text-left shadow-lg opacity-0 transition-opacity group-hover/hint:opacity-100 group-focus-within/hint:opacity-100 z-20"
      >
        {text}
      </span>
    </span>
  )
}

function PlanOptionContent({ plan, active, current, popular, billingMode }: {
  plan: ComparablePlan; active: boolean; current: boolean; popular: boolean; billingMode: BillingMode
}) {
  const Icon = tierInfo(plan).icon
  return (
    <>
      <span
        className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-200 ${
          active ? 'bg-(--ia-accent) text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200 group-hover:text-slate-700'
        }`}
      >
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className={`text-base font-black tracking-tight truncate ${active ? 'text-slate-900' : 'text-slate-700'}`}>{plan.name}</span>
          {(current || popular) && (
            <span
              className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                current ? 'bg-emerald-500 text-white' : 'bg-(--ia-accent)/10 text-(--ia-accent)'
              }`}
            >
              {current ? 'Tu plan' : 'Popular'}
            </span>
          )}
        </span>
        <span className="flex items-baseline gap-1">
          <span key={billingMode} className="text-sm font-black text-slate-600 animate-pop-in motion-reduce:animate-none">
            {formatMXN(pricePerMonthCents(plan, billingMode))}
          </span>
          <span className="text-[11px] font-bold text-slate-400">/mes</span>
        </span>
      </span>
    </>
  )
}

type Props = {
  title: string
  subtitle: string
  /** Controles a la derecha del encabezado (mensual/anual). */
  actions?: ReactNode
  /** Aviso entre el encabezado y los planes (modo admin). */
  notice?: ReactNode
  plans: ComparablePlan[]
  selectedSlug: string
  onSelectedChange: (slug: string) => void
  /** Plan con suscripción viva; null si no hay (prueba vencida, cancelada). */
  currentSlug: string | null
  recommendedSlug: string
  billingMode: BillingMode
  isLoading?: boolean
  onChoose: (plan: ComparablePlan) => void
}

export default function PlanSelector({
  title, subtitle, actions, notice,
  plans, selectedSlug, onSelectedChange, currentSlug, recommendedSlug, billingMode, isLoading = false, onChoose,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const plan = plans.find(p => p.slug === selectedSlug)
  if (!plan) return null

  const info = tierInfo(plan)
  const isCurrent = plan.slug === currentSlug
  const isRecommended = plan.slug === recommendedSlug
  const discount = yearlyDiscountPct(plan)
  const lines = featureLines(plan)

  const stats = [
    { key: 'sessions', icon: MessagesSquare, label: 'Conversaciones/mes', value: plan.max_sessions_per_month },
    { key: 'members', icon: Users, label: 'Miembros', value: plan.max_team_members },
    { key: 'channels', icon: Radio, label: 'Canales', value: plan.max_channels },
    { key: 'agendas', icon: CalendarDays, label: 'Agendas', value: plan.max_agendas ?? 0 },
  ]

  return (
    <section className="@container bg-white border border-slate-200 rounded-2xl shadow-sm">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 sm:px-6 py-5 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white bg-(--ia-accent)">
            <Layers size={17} />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">{title}</h2>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
        {actions}
      </header>

      {notice && <div className="px-5 sm:px-6 pt-5">{notice}</div>}

      <div className="grid grid-cols-1 @3xl:grid-cols-[minmax(230px,270px)_minmax(0,1fr)]">
        {/* Celular y pantallas angostas: menú desplegable, para que los planes no se amontonen. */}
        <div className="@3xl:hidden p-3 bg-slate-50 border-b border-slate-200">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
            className="group w-full min-w-0 flex items-center gap-3 text-left p-3 rounded-xl bg-white ring-1 ring-slate-200 shadow-sm"
          >
            <PlanOptionContent
              plan={plan}
              active
              current={plan.slug === currentSlug}
              popular={plan.slug === recommendedSlug}
              billingMode={billingMode}
            />
            <ChevronDown
              size={18}
              aria-hidden="true"
              className={`shrink-0 text-slate-400 transition-transform duration-300 ${menuOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <div className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${menuOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
            <div className="overflow-hidden">
              <ul role="listbox" aria-label="Planes" className="mt-2 p-1.5 flex flex-col gap-1 bg-white rounded-xl ring-1 ring-slate-200">
                {plans.map(p => {
                  const active = p.slug === plan.slug
                  return (
                    <li key={p.slug}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        tabIndex={menuOpen ? 0 : -1}
                        onClick={() => { onSelectedChange(p.slug); setMenuOpen(false) }}
                        className={`group w-full min-w-0 flex items-center gap-3 text-left p-2.5 rounded-lg transition-colors ${active ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                      >
                        <PlanOptionContent
                          plan={p}
                          active={active}
                          current={p.slug === currentSlug}
                          popular={p.slug === recommendedSlug}
                          billingMode={billingMode}
                        />
                        {active && <Check size={16} className="shrink-0 text-(--ia-accent)" aria-hidden="true" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </div>

        {/* Escritorio: pestañas verticales; la activa se une al panel. */}
        <div
          role="tablist"
          aria-label="Planes"
          aria-orientation="vertical"
          className="hidden @3xl:flex flex-col gap-1.5 p-3 pr-0 bg-slate-50 border-r border-slate-200 rounded-bl-2xl"
        >
          {plans.map(p => {
            const active = p.slug === plan.slug
            return (
              <button
                key={p.slug}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectedChange(p.slug)}
                className={`group relative w-full min-w-0 flex items-center gap-3 text-left p-3 rounded-l-xl transition-all duration-200 motion-reduce:transition-none ${
                  active
                    ? 'bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06),-1px_0_0_#e2e8f0,0_-1px_0_#e2e8f0,0_1px_0_#e2e8f0] -mr-px z-10'
                    : 'hover:bg-white/70'
                }`}
              >
                <PlanOptionContent
                  plan={p}
                  active={active}
                  current={p.slug === currentSlug}
                  popular={p.slug === recommendedSlug}
                  billingMode={billingMode}
                />
                <ChevronRight
                  size={16}
                  aria-hidden="true"
                  className={`shrink-0 transition-all duration-200 ${active ? 'text-(--ia-accent)' : 'text-slate-300 group-hover:text-slate-400 group-hover:translate-x-0.5'}`}
                />
              </button>
            )
          })}
        </div>

        <div key={plan.slug} role="tabpanel" className={`@container/panel ${ENTER}`}>
          <div className="grid grid-cols-1 @2xl/panel:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="flex flex-col p-5 sm:p-7 border-b @2xl/panel:border-b-0 @2xl/panel:border-r border-slate-100">
              <span
                className={`self-start inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-4 ${
                  isCurrent ? 'bg-emerald-500 text-white' : 'bg-(--ia-accent)/10 text-(--ia-accent)'
                }`}
              >
                {isCurrent ? <><Check size={12} /> Tu plan actual</> : <><info.icon size={11} /> {isRecommended ? 'Más vendido' : info.tagline}</>}
              </span>
              <h3 className="text-3xl font-black text-slate-900 tracking-tight">{plan.name}</h3>
              {plan.description && <p className="text-sm text-slate-500 font-medium leading-relaxed mt-1">{plan.description}</p>}

              <div className="mt-6 flex flex-wrap items-baseline gap-x-2">
                <span key={billingMode} className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight animate-pop-in motion-reduce:animate-none">
                  {formatMXN(pricePerMonthCents(plan, billingMode))}
                </span>
                <span className="text-sm font-bold text-slate-500">/ mes + IVA</span>
              </div>
              <p className={`text-[11px] font-bold mt-2 h-4 text-emerald-700 transition-opacity duration-300 ${billingMode === 'yearly' && discount > 0 ? 'opacity-100' : 'opacity-0'}`}>
                Ahorras {discount}% pagando anual
              </p>

              <button
                type="button"
                onClick={() => onChoose(plan)}
                disabled={isCurrent || isLoading}
                className={`mt-6 w-full px-6 py-3.5 font-bold rounded-xl flex items-center justify-center gap-2 text-sm transition-all duration-200 ${
                  isCurrent
                    ? 'bg-emerald-50 text-emerald-700 cursor-default'
                    : 'bg-slate-900 hover:bg-slate-800 text-white hover:-translate-y-0.5 active:translate-y-0 hover:shadow-lg'
                }`}
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : isCurrent ? <><Check size={16} /> Plan actual</> : `Elegir ${plan.name}`}
              </button>
            </div>

            <div className="p-5 sm:p-7">
              <div className="grid grid-cols-2 gap-2 mb-6">
                {stats.map((s, i) => {
                  const Icon = s.icon
                  return (
                    <div key={s.key} className={`p-3 bg-slate-50 border border-slate-100 rounded-xl ${ENTER}`} style={{ animationDelay: `${60 + i * 40}ms` }}>
                      <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                        <Icon size={12} className="text-slate-400" />
                        {s.label}
                        {HINTS[s.key] && <Hint text={HINTS[s.key]} />}
                      </div>
                      <div className="text-lg font-black text-slate-900 mt-0.5">{s.value.toLocaleString('es-MX')}</div>
                    </div>
                  )
                })}
              </div>

              {lines.length > 0 && (
                <>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Incluye</p>
                  <div className="space-y-2.5">
                    {lines.map((line, i) => (
                      <div key={i} className={`flex items-start gap-2.5 ${ENTER}`} style={{ animationDelay: `${200 + i * 45}ms` }}>
                        <div className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                          <Check size={12} className="text-emerald-700 stroke-[3]" />
                        </div>
                        <span className="text-sm text-slate-700 font-medium leading-snug">{line}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
