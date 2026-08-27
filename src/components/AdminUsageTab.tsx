 

'use client'

// src/components/AdminUsageTab.tsx
// ----------------------------------------------------------------------------
// Sprint U · Panel admin para ver el uso de sesiones de todas las companies.
//
// Muestra una tabla con cada company, su plan, sesiones usadas vs límite,
// y una barra visual. Ordenado por % de uso descendente (los que están cerca
// del límite arriba).
// ----------------------------------------------------------------------------

import { useQuery } from '@tanstack/react-query'
import { BarChart3, Loader2, Search } from 'lucide-react'
import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'

interface AdminUsageRow {
  company_id: string
  company_name: string
  plan_slug: string | null
  sessions_limit: number | null
  sessions_used: number
}

export default function AdminUsageTab() {
  const [search, setSearch] = useState('')

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin-usage'],
    queryFn: async (): Promise<AdminUsageRow[]> => {
      const { data, error } = await supabase.from('v_admin_usage').select('*')
      if (error) throw error
      return (data || []) as AdminUsageRow[]
    },
    staleTime: 30 * 1000,
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q
      ? rows.filter((r) => (r.company_name || '').toLowerCase().includes(q))
      : rows
    return [...list].sort((a, b) => {
      const pctA = a.sessions_limit ? a.sessions_used / a.sessions_limit : 0
      const pctB = b.sessions_limit ? b.sessions_used / b.sessions_limit : 0
      return pctB - pctA
    })
  }, [rows, search])

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={28} className="animate-spin text-slate-400" />
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
          <h2 className="text-lg font-black text-slate-900">Uso de conversaciones</h2>
          <p className="text-xs text-slate-500">Sesiones del mes por cliente (ventana 24h estilo Meta)</p>
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

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left">
              <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente</th>
              <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Plan</th>
              <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Uso</th>
              <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-40">Progreso</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">
                  Sin clientes que mostrar.
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const limit = row.sessions_limit || 0
                const pct = limit > 0 ? Math.min((row.sessions_used / limit) * 100, 100) : 0
                const barColor = pct >= 90 ? '#dc2626' : pct >= 70 ? '#f59e0b' : '#10b981'
                return (
                  <tr key={row.company_id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.company_name}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold text-slate-500 uppercase">{row.plan_slug || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.sessions_used.toLocaleString('es-MX')}
                      <span className="text-slate-400"> / {limit > 0 ? limit.toLocaleString('es-MX') : '∞'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {limit > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 w-8 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400">Sin límite</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
