'use client'

// Tabla "Comparar planes" de Mi Plan: una columna por plan y las filas
// agrupadas por tema (compareGroups). Cada grupo muestra unas cuantas filas y
// el resto detrás de "Ver más". En celular la tabla se desplaza de lado con
// la columna de etiquetas fija.

import { Fragment, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { compareGroups, type ComparablePlan } from '../lib/planCompare'

const VISIBLE_ROWS = 5

type Props = {
  id?: string
  plans: ComparablePlan[]
  currentSlug: string | null
}

export default function PlanCompareTable({ id, plans, currentSlug }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  if (plans.length === 0) return null
  const groups = compareGroups(plans)
  const cols = plans.length + 1

  return (
    <section id={id} className="scroll-mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Comparar planes</h2>
        <div className="mx-auto mt-3 h-1 w-24 rounded-full bg-(--ia-accent)" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white w-[34%] border-b-2 border-(--ia-accent)/15" />
              {plans.map(p => (
                <th key={p.slug} className="pb-4 text-center align-bottom border-b-2 border-(--ia-accent)/15">
                  {p.slug === currentSlug && (
                    <span className="inline-block mb-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500 text-white">Tu plan</span>
                  )}
                  <span className="block text-sm sm:text-base font-black text-slate-900">{p.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(g => {
              const open = !!expanded[g.key]
              const rows = open ? g.rows : g.rows.slice(0, VISIBLE_ROWS)
              const hidden = g.rows.length - VISIBLE_ROWS
              return (
                <Fragment key={g.key}>
                  <tr>
                    <td colSpan={cols} className="pt-6">
                      <div className="flex items-center gap-2 px-4 py-3 bg-(--ia-accent)/5 border-l-4 border-(--ia-accent)">
                        <span className="text-sm sm:text-base font-black text-slate-900">{g.label}</span>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white text-(--ia-accent)">{g.rows.length}</span>
                      </div>
                    </td>
                  </tr>
                  {rows.map(r => (
                    <tr key={r.key} className="animate-rise-in motion-reduce:animate-none">
                      <td className="sticky left-0 z-10 bg-white py-3.5 pl-2 pr-3 text-slate-700 font-medium border-b border-slate-100 text-[13px] sm:text-sm">{r.label}</td>
                      {r.cells.map((c, i) => (
                        <td key={plans[i].slug} className="py-3.5 text-center border-b border-slate-100">
                          {c.kind === 'text' && <span className="font-black text-slate-900">{c.value}</span>}
                          {c.kind === 'yes' && (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-(--ia-accent)/15 text-(--ia-accent)" aria-label="Incluido">
                              <Check size={14} className="stroke-[3]" />
                            </span>
                          )}
                          {c.kind === 'no' && <span className="text-slate-300 font-bold" aria-label="No incluido">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {hidden > 0 && (
                    <tr>
                      <td colSpan={cols} className="border-b border-slate-100 text-center">
                        <button
                          type="button"
                          onClick={() => setExpanded(e => ({ ...e, [g.key]: !open }))}
                          className="py-3 inline-flex items-center justify-center gap-1.5 text-sm font-bold text-(--ia-accent) hover:underline"
                        >
                          {open ? 'Ver menos' : `Ver ${hidden} más`}
                          <ChevronDown size={14} className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
                        </button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
