// ============================================================================
// src/components/public/PricingCompareTable.tsx
// ----------------------------------------------------------------------------
// "Compara los planes" de /precios. Mismas filas que la comparativa de
// Mi Plan (compareGroups), con el estilo de la landing: slate + lime, y la
// columna del plan recomendado resaltada. En celular la tabla se desplaza de
// lado con la columna de etiquetas fija.
// ============================================================================

import Link from 'next/link'
import { Check } from 'lucide-react'
import { compareGroups, formatMXN, pricePerMonthCents, type BillingMode, type ComparablePlan } from '../../lib/planCompare'

type Props = {
  plans: (ComparablePlan & { tier?: string | null })[]
  recommendedSlug: string
  billing: BillingMode
}

export default function PricingCompareTable({ plans, recommendedSlug, billing }: Props) {
  if (plans.length === 0) return null
  const groups = compareGroups(plans)
  const isRec = (p: ComparablePlan) => p.slug === recommendedSlug || p.tier === recommendedSlug
  const colBg = (p: ComparablePlan) => (isRec(p) ? 'bg-lime-50/70' : '')

  return (
    <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white w-[30%] p-5 md:p-6 text-left align-bottom border-b border-slate-200">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-[0.15em]">Plan</span>
              </th>
              {plans.map(p => (
                <th key={p.slug} className={`p-4 md:p-6 text-center align-bottom border-b border-slate-200 ${colBg(p)}`}>
                  {isRec(p) && (
                    <span className="inline-block mb-2 px-2.5 py-0.5 bg-lime-400 text-slate-950 text-[9px] font-black uppercase tracking-[0.15em] rounded-full">
                      Más popular
                    </span>
                  )}
                  <span className="block text-base md:text-lg font-black text-slate-950 tracking-tight">{p.name}</span>
                  <span className="block mt-1 text-xs font-bold text-slate-500">
                    {formatMXN(pricePerMonthCents(p, billing))}/mes
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <GroupRows key={g.key} label={g.label} rows={g.rows} plans={plans} colBg={colBg} />
            ))}
            <tr>
              <td className="sticky left-0 z-10 bg-white p-5 md:p-6" />
              {plans.map(p => (
                <td key={p.slug} className={`p-4 md:p-6 text-center ${colBg(p)}`}>
                  <Link
                    href={p.tier === 'scale' ? '/contacto' : `/login?signup=1&plan=${p.slug}`}
                    className={`inline-block w-full max-w-[160px] px-4 py-2.5 rounded-2xl text-xs font-black transition-colors ${
                      isRec(p) ? 'bg-slate-950 text-white hover:bg-slate-800' : 'bg-white border border-slate-300 text-slate-950 hover:border-slate-950'
                    }`}
                  >
                    {p.tier === 'scale' ? 'Hablar con ventas' : 'Probar gratis'}
                  </Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GroupRows({
  label, rows, plans, colBg,
}: {
  label: string
  rows: ReturnType<typeof compareGroups>[number]['rows']
  plans: ComparablePlan[]
  colBg: (p: ComparablePlan) => string
}) {
  return (
    <>
      <tr>
        <td className="sticky left-0 z-10 bg-[#FAFAF7] px-5 md:px-6 pt-6 pb-3 border-b border-slate-200">
          <span className="text-xs font-bold text-lime-600 uppercase tracking-[0.2em]">{label}</span>
        </td>
        {plans.map(p => (
          <td key={p.slug} className="bg-[#FAFAF7] border-b border-slate-200" />
        ))}
      </tr>
      {rows.map(r => (
        <tr key={r.key}>
          <td className="sticky left-0 z-10 bg-white px-5 md:px-6 py-4 text-slate-700 font-medium border-b border-slate-100 leading-snug">
            {r.label}
          </td>
          {r.cells.map((c, i) => (
            <td key={plans[i].slug} className={`px-3 py-4 text-center border-b border-slate-100 ${colBg(plans[i])}`}>
              {c.kind === 'text' && <span className="font-bold text-slate-950 leading-snug">{c.value}</span>}
              {c.kind === 'yes' && (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-lime-100 text-lime-700" aria-label="Incluido">
                  <Check size={14} strokeWidth={3} />
                </span>
              )}
              {c.kind === 'no' && <span className="text-slate-300 font-bold" aria-label="No incluido">—</span>}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
