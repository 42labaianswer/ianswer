'use client'

// src/components/AdminUsageTab.tsx
// ----------------------------------------------------------------------------
// Panel admin: consumo del periodo de cobro de cada cliente (respuestas de
// IA, recordatorios y marketing) contra lo que incluye su plan. Los que van
// más cerca del límite salen arriba.
// ----------------------------------------------------------------------------

import { useQuery } from '@tanstack/react-query'
import { BarChart3, Search } from 'lucide-react'
import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { meterState, type MeterLevel, type UsageMetric } from '../lib/usageSummary'
import IAnswerLoader from './IAnswerLoader'

interface AdminUsageRow {
  company_id: string
  company_name: string
  plan_slug: string | null
  period_start: string
  period_end: string
  ai_replies_used: number
  ai_replies_limit: number | null
  reminders_used: number
  reminders_limit: number | null
  marketing_used: number
  marketing_limit: number | null
}

const BAR: Record<MeterLevel, string> = { ok: 'bg-emerald-500', near: 'bg-amber-500', full: 'bg-red-600' }

const metricsOf = (r: AdminUsageRow): UsageMetric[] => [
  { used: r.ai_replies_used, limit: r.ai_replies_limit },
  { used: r.reminders_used, limit: r.reminders_limit },
  { used: r.marketing_used, limit: r.marketing_limit },
]

function maxPct(r: AdminUsageRow): number {
  return Math.max(0, ...metricsOf(r).map(m => meterState(m)?.pct ?? 0))
}

export default function AdminUsageTab() {
  const [search, setSearch] = useState('')

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ['admin-usage-period'],
    queryFn: async (): Promise<AdminUsageRow[]> => {
      const { data, error } = await supabase.rpc('admin_usage_period')
      if (error) throw error
      return (data || []) as AdminUsageRow[]
    },
    staleTime: 30 * 1000,
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q ? rows.filter((r) => (r.company_name || '').toLowerCase().includes(q)) : rows
    return [...list].sort((a, b) => maxPct(b) - maxPct(a))
  }, [rows, search])

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <IAnswerLoader size={28} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
          <BarChart3 size={17} />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-900">Consumo por cliente</h2>
          <p className="text-xs text-slate-500">Periodo de cobro actual de cada cliente</p>
        </div>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente..."
          className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-slate-200"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-170">
          <thead>
            <tr className="border-b border-slate-100 text-left">
              {['Cliente', 'Plan', 'Respuestas de IA', 'Recordatorios', 'Marketing', 'Corte'].map(h => (
                <th key={h} className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-red-600 text-sm">
                  No se pudo cargar el consumo. ¿Ya se corrió contadores_nov_2026.sql en esta base?
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">Sin clientes que mostrar.</td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.company_id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.company_name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-bold text-slate-500 uppercase">{row.plan_slug || '—'}</span>
                  </td>
                  {metricsOf(row).map((m, i) => (
                    <td key={i} className="px-4 py-3">
                      <MetricCell metric={m} />
                    </td>
                  ))}
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {new Date(row.period_end).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MetricCell({ metric }: { metric: UsageMetric }) {
  const state = meterState(metric)
  if (!state) {
    return (
      <span className="text-xs text-slate-400">
        {metric.used > 0 ? `${metric.used.toLocaleString('es-MX')} · ` : ''}
        {metric.limit === 0 ? 'No incluido' : 'Sin límite'}
      </span>
    )
  }
  return (
    <div className="w-28">
      <p className="text-xs text-slate-700 tabular-nums">
        {state.used.toLocaleString('es-MX')}
        <span className="text-slate-400"> / {state.limit.toLocaleString('es-MX')}</span>
      </p>
      <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${BAR[state.level]}`} style={{ width: `${state.pct}%` }} />
      </div>
    </div>
  )
}
