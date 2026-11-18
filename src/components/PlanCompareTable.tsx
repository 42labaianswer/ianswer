'use client'

// Tabla "Comparar todo" de Mi Plan: una columna por plan, filas que salen de
// compareRows (las que no cambian entre planes no se muestran). La columna del
// plan elegido arriba se resalta con el acento, y los encabezados también
// sirven para elegir.

import { Check, Lock } from 'lucide-react'
import { compareRows, formatMXN, pricePerMonthCents, type BillingMode, type ComparablePlan } from '../lib/planCompare'
import { tierInfo } from '../lib/planTiers'

type Props = {
  plans: ComparablePlan[]
  selectedSlug: string
  onSelectedChange: (slug: string) => void
  currentSlug: string | null
  billingMode: BillingMode
}

export default function PlanCompareTable({ plans, selectedSlug, onSelectedChange, currentSlug, billingMode }: Props) {
  if (plans.length === 0) return null
  const rows = compareRows(plans)
  const colClass = (slug: string) =>
    `transition-colors duration-300 ${slug === selectedSlug ? 'bg-(--ia-accent)/5' : ''}`

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
      <h3 className="text-lg font-black text-slate-900 tracking-tight mb-4">Comparar todo</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="w-[32%] sticky left-0 z-10 bg-white" />
              {plans.map(p => {
                const Icon = tierInfo(p).icon
                const active = p.slug === selectedSlug
                return (
                  <th key={p.slug} className={`p-0 align-top rounded-t-2xl ${colClass(p.slug)}`}>
                    <button
                      type="button"
                      onClick={() => onSelectedChange(p.slug)}
                      aria-pressed={active}
                      className="w-full px-2 py-3 flex flex-col items-center gap-1 group"
                    >
                      <span
                        className={`h-7 w-7 rounded-lg flex items-center justify-center transition-colors duration-300 ${
                          active ? 'bg-(--ia-accent) text-white' : 'bg-slate-100 text-slate-500 group-hover:text-slate-700'
                        }`}
                      >
                        <Icon size={14} />
                      </span>
                      <span className={`text-sm font-black transition-colors duration-300 ${active ? 'text-(--ia-accent)' : 'text-slate-900'}`}>{p.name}</span>
                      <span className="text-[11px] font-bold text-slate-500">{formatMXN(pricePerMonthCents(p, billingMode))}</span>
                      {p.slug === currentSlug && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500 text-white">Tu plan</span>
                      )}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={r.key}>
                <td className="sticky left-0 z-10 bg-white py-3 pr-3 text-slate-700 font-medium border-t border-slate-100 text-[13px] sm:text-sm">{r.label}</td>
                {r.cells.map((c, i) => {
                  const slug = plans[i].slug
                  const last = ri === rows.length - 1
                  return (
                    <td key={slug} className={`py-3 text-center border-t border-slate-100 ${colClass(slug)} ${last ? 'rounded-b-2xl' : ''}`}>
                      {c.kind === 'text' && <span className="font-bold text-slate-900">{c.value}</span>}
                      {c.kind === 'yes' && <Check size={16} className="inline text-emerald-600 stroke-[3]" aria-label="Incluido" />}
                      {c.kind === 'no' && <Lock size={14} className="inline text-slate-300" aria-label="No incluido" />}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
