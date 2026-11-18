'use client'

// Selector de planes de Mi Plan: una tarjeta chica por plan y un solo panel con
// el detalle del plan elegido. Así caben 4 planes o más sin achicar tarjetas.
// Usa el acento de la industria (--ia-accent); los planes se distinguen por su
// ícono, no por color. La selección la maneja la
// página para que la tabla comparativa resalte la misma columna.

import { Check, Loader2, Info, MessagesSquare, Users, Radio, CalendarDays } from 'lucide-react'
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

type Props = {
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
  plans, selectedSlug, onSelectedChange, currentSlug, recommendedSlug, billingMode, isLoading = false, onChoose,
}: Props) {
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
    <div className="space-y-5">
      <div role="tablist" aria-label="Planes" className="@container">
        <div
          className="grid grid-cols-2 @3xl:grid-cols-4 gap-3"
          style={plans.length > 4 ? { gridTemplateColumns: `repeat(${plans.length}, minmax(0, 1fr))` } : undefined}
        >
          {plans.map(p => {
            const t = tierInfo(p)
            const Icon = t.icon
            const active = p.slug === plan.slug
            const current = p.slug === currentSlug
            const popular = p.slug === recommendedSlug
            return (
              <button
                key={p.slug}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectedChange(p.slug)}
                className={`group relative min-w-0 text-left bg-white rounded-2xl border-2 p-3 sm:p-4 transition-all duration-300 ease-out motion-reduce:transition-none ${
                  active
                    ? 'border-(--ia-accent) ring-4 ring-(--ia-accent)/10 shadow-lg shadow-slate-900/5'
                    : 'border-slate-100 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
                  <span
                    className={`h-8 w-8 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-300 ${
                      active ? 'bg-(--ia-accent) text-white' : 'bg-slate-100 text-slate-500 group-hover:text-slate-700'
                    }`}
                  >
                    <Icon size={18} />
                  </span>
                  {(current || popular) && (
                    <span
                      className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        current ? 'bg-emerald-500 text-white' : 'bg-(--ia-accent)/10 text-(--ia-accent)'
                      }`}
                    >
                      {current ? 'Tu plan' : 'Popular'}
                    </span>
                  )}
                </div>
                <span className="block text-base sm:text-lg font-black text-slate-900 tracking-tight truncate">{p.name}</span>
                <span className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 truncate">{t.tagline}</span>
                <span className="mt-1.5 sm:mt-2 flex items-baseline gap-1">
                  <span key={billingMode} className="text-sm sm:text-base font-black text-slate-900 animate-pop-in motion-reduce:animate-none">
                    {formatMXN(pricePerMonthCents(p, billingMode))}
                  </span>
                  <span className="text-[11px] font-bold text-slate-400">/mes</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div key={plan.slug} role="tabpanel" className={`@container bg-white rounded-2xl sm:rounded-3xl border-2 border-slate-100 overflow-hidden ${ENTER}`}>
        <div className="grid grid-cols-1 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="flex flex-col p-5 sm:p-8 bg-slate-50 @2xl:border-r border-slate-100">
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

          <div className="p-5 sm:p-8">
            <div className="grid grid-cols-2 gap-2 mb-6">
              {stats.map((s, i) => {
                const Icon = s.icon
                return (
                  <div key={s.key} className={`p-3 bg-slate-50 rounded-xl ${ENTER}`} style={{ animationDelay: `${60 + i * 40}ms` }}>
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
  )
}
