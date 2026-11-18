'use client'

// Tarjetas de planes de Mi Plan: 4 en fila en pantallas anchas, 2×2 en
// medianas y 1 columna en celular. Cada tarjeta lleva el precio, una caja con
// lo que trae cada mes, el botón para elegirlo y solo lo que suma respecto al
// plan anterior ("Todo lo de Start, más:"). Usa el acento de la industria.

import { Check, Loader2, ArrowDown } from 'lucide-react'
import {
  ownFeatureLines, formatMXN, pricePerMonthCents, yearlyDiscountPct, aiRepliesOf, usersOf,
  type BillingMode, type ComparablePlan,
} from '../lib/planCompare'
import { tierInfo } from '../lib/planTiers'

type Props = {
  plans: ComparablePlan[]
  /** Plan con suscripción viva; null si no hay (prueba vencida, cancelada). */
  currentSlug: string | null
  recommendedSlug: string
  billingMode: BillingMode
  isLoading?: boolean
  onChoose: (plan: ComparablePlan) => void
  /** id del bloque al que lleva "Ver comparación completa". */
  compareAnchor?: string
}

const n = (v: number | null | undefined) => (v ?? 0).toLocaleString('es-MX')

export default function PlanCards({
  plans, currentSlug, recommendedSlug, billingMode, isLoading = false, onChoose, compareAnchor,
}: Props) {
  return (
    <div className="@container">
    <div className="grid grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-4 gap-5">
      {plans.map((plan, i) => {
        const info = tierInfo(plan)
        const isCurrent = plan.slug === currentSlug
        const isPopular = plan.slug === recommendedSlug
        const previous = i > 0 ? plans[i - 1] : null
        const lines = ownFeatureLines(plan)
        const discount = yearlyDiscountPct(plan)
        const price = formatMXN(pricePerMonthCents(plan, billingMode)).replace(/^\$\s?/, '')

        return (
          <article
            key={plan.slug}
            className={`relative flex flex-col bg-white rounded-2xl border p-6 sm:p-7 @5xl:p-6 transition-all duration-300 hover:shadow-lg hover:shadow-slate-900/5 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 animate-rise-in motion-reduce:animate-none ${
              isCurrent ? 'border-emerald-300 shadow-sm' : isPopular ? 'border-(--ia-accent)/40 shadow-sm' : 'border-slate-200 shadow-sm'
            }`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            {(isCurrent || isPopular) && (
              <span
                className={`absolute -top-3 right-5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white shadow-sm ${
                  isCurrent ? 'bg-emerald-500' : 'bg-(--ia-accent)'
                }`}
              >
                {isCurrent ? 'Tu plan' : 'Más vendido'}
              </span>
            )}

            <div className="text-center">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-(--ia-accent)/10 text-(--ia-accent) mb-3">
                <info.icon size={18} />
              </span>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">{plan.name}</h3>
              <p className="text-sm text-slate-500 font-medium mt-1 min-h-10 @5xl:min-h-15 @5xl:line-clamp-3">{plan.description || info.tagline}</p>

              <div className="mt-5 flex items-start justify-center gap-1">
                <span className="text-2xl font-black text-slate-400 mt-1.5">$</span>
                <span key={billingMode} className="text-5xl sm:text-6xl @5xl:text-5xl font-black text-slate-900 tracking-tight animate-pop-in motion-reduce:animate-none">
                  {price}
                </span>
                <span className="self-end mb-2 text-sm font-bold text-slate-400">/mes</span>
              </div>
              <p className="text-[11px] font-bold text-slate-400 mt-1">más IVA</p>
            </div>

            <div className="mt-5 rounded-xl border border-(--ia-accent)/15 bg-(--ia-accent)/5 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-(--ia-accent)">Cada mes</p>
              <p className="mt-0.5 whitespace-nowrap"><span className="text-base font-black text-slate-900">{n(aiRepliesOf(plan))}</span> <span className="text-sm font-bold text-slate-700">respuestas de IA</span></p>
              {!!plan.max_reminders_per_month && (
                <p className="whitespace-nowrap"><span className="text-base font-black text-slate-900">{n(plan.max_reminders_per_month)}</span> <span className="text-sm font-bold text-slate-700">recordatorios</span></p>
              )}
              <p className="text-xs text-slate-600 font-medium mt-1 @5xl:min-h-8">
                {n(usersOf(plan))} {usersOf(plan) === 1 ? 'usuario' : 'usuarios'} · {n(plan.max_channels)} {plan.max_channels === 1 ? 'canal' : 'canales'}{(plan.max_locations ?? 1) > 1 ? ` · ${n(plan.max_locations)} sucursales` : ''}
              </p>
              {billingMode === 'yearly' && discount > 0 && (
                <p className="text-xs font-bold text-emerald-700 mt-1 animate-rise-in motion-reduce:animate-none">
                  Ahorras {discount}% pagando anual
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => onChoose(plan)}
              disabled={isCurrent || isLoading}
              className={`mt-5 w-full px-6 py-3.5 font-bold rounded-xl flex items-center justify-center gap-2 text-sm transition-all duration-200 ${
                isCurrent
                  ? 'bg-emerald-50 text-emerald-700 cursor-default'
                  : 'bg-(--ia-accent) text-white hover:brightness-110 hover:shadow-lg active:scale-[0.99]'
              }`}
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : isCurrent ? <><Check size={16} /> Plan actual</> : `Elegir ${plan.name}`}
            </button>

            <div className="mt-6 pt-6 border-t border-slate-100 flex-1">
              {previous && (
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                  Todo lo de {previous.name}, más:
                </p>
              )}
              <ul className="space-y-2.5">
                {lines.map((line, li) => (
                  <li key={li} className="flex items-start gap-2.5 text-sm text-slate-700 font-medium leading-snug">
                    <Check size={16} className="text-(--ia-accent) stroke-[2.5] shrink-0 mt-0.5" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            {compareAnchor && (
              <a
                href={`#${compareAnchor}`}
                className="mt-6 pt-5 border-t border-slate-100 inline-flex items-center gap-1.5 text-sm font-bold text-(--ia-accent) hover:underline"
              >
                Ver comparación completa <ArrowDown size={14} />
              </a>
            )}
          </article>
        )
      })}
    </div>
    </div>
  )
}
