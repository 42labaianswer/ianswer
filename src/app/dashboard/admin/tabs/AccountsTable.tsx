'use client'

// Tabla de cuentas de Panel Admin → Cuentas: búsqueda por nombre o correo,
// orden por más recientes o alfabético (con filtro por letra) y paginación.
// Los datos salen de admin_list_accounts (database/admin_cuentas.sql).

import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import IAnswerLoader from '../../../../components/IAnswerLoader'

export interface AccountRow {
  company_id: string
  company_name: string
  owner_email: string | null
  owner_name: string | null
  plan_slug: string | null
  subscription_status: string | null
  industry: string | null
  created_at: string
  total_count: number
}

const PAGE_SIZE = 20
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'Ñ', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '#']

const STATUS_LABEL: Record<string, string> = {
  trialing: 'En prueba',
  active: 'Activa',
  past_due: 'Pago pendiente',
  canceled: 'Cancelada',
  inactive: 'Sin pagar',
  expired: 'Vencida',
}

export default function AccountsTable({
  selectedId,
  onSelect,
  refreshKey,
}: {
  selectedId: string | null
  onSelect: (row: AccountRow) => void
  /** Cambia cuando se edita una cuenta, para volver a cargar la tabla. */
  refreshKey: number
}) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [sort, setSort] = useState<'recent' | 'alpha'>('recent')
  const [letter, setLetter] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(0) }, 300)
    return () => clearTimeout(t)
  }, [search])

  const { data: rows = [], isLoading, isFetching, error } = useQuery({
    queryKey: ['admin-accounts', debounced, sort, letter, page, refreshKey],
    queryFn: async (): Promise<AccountRow[]> => {
      const { data, error } = await supabase.rpc('admin_list_accounts', {
        p_search: debounced || null,
        p_sort: sort,
        p_letter: sort === 'alpha' ? letter : null,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      })
      if (error) throw error
      return (data || []) as AccountRow[]
    },
    placeholderData: keepPreviousData,
  })

  const total = rows[0]?.total_count ?? 0
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1)
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min((page + 1) * PAGE_SIZE, total)

  const changeSort = (next: 'recent' | 'alpha') => {
    setSort(next)
    setLetter(null)
    setPage(0)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por empresa o correo..."
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-slate-200"
          />
        </div>
        <div className="flex bg-white border border-slate-200 rounded-xl p-1 shrink-0" role="radiogroup" aria-label="Ordenar">
          {([['recent', 'Más recientes'], ['alpha', 'A-Z']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={sort === id}
              onClick={() => changeSort(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                sort === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {sort === 'alpha' && (
        <div className="flex flex-wrap gap-1" aria-label="Filtrar por letra">
          <button
            type="button"
            onClick={() => { setLetter(null); setPage(0) }}
            className={`px-2 py-1 rounded-md text-[11px] font-bold ${letter === null ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            Todas
          </button>
          {LETTERS.map(l => (
            <button
              key={l}
              type="button"
              onClick={() => { setLetter(l); setPage(0) }}
              className={`w-7 py-1 rounded-md text-[11px] font-bold ${letter === l ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-slate-100 text-left">
              {['Empresa', 'Correo', 'Plan', 'Estado', 'Industria', 'Alta'].map(h => (
                <th key={h} className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className={isFetching && !isLoading ? 'opacity-60' : ''}>
            {isLoading ? (
              <tr><td colSpan={6} className="py-10"><div className="flex justify-center"><IAnswerLoader size={24} /></div></td></tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-red-600 text-sm">
                  No se pudo cargar la lista. ¿Ya se corrió admin_cuentas.sql en esta base?
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">Sin cuentas que mostrar.</td></tr>
            ) : (
              rows.map(row => (
                <tr
                  key={row.company_id}
                  onClick={() => onSelect(row)}
                  className={`border-b border-slate-50 last:border-0 cursor-pointer transition-colors ${
                    selectedId === row.company_id ? 'bg-indigo-50/60' : 'hover:bg-slate-50/70'
                  }`}
                >
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900">{row.company_name}</p>
                    {row.owner_name && <p className="text-[11px] text-slate-500">{row.owner_name}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{row.owner_email || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-bold text-slate-500 uppercase">{row.plan_slug === 'scale' ? 'Pro' : row.plan_slug || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {row.subscription_status ? STATUS_LABEL[row.subscription_status] ?? row.subscription_status : 'Sin suscripción'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{row.industry || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {new Date(row.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{total > 0 ? `${from}–${to} de ${total.toLocaleString('es-MX')}` : ''}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage(p => Math.max(p - 1, 0))}
            disabled={page === 0}
            aria-label="Página anterior"
            className="p-2 rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="px-2 font-bold text-slate-700">{page + 1} / {pages}</span>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(p + 1, pages - 1))}
            disabled={page >= pages - 1}
            aria-label="Página siguiente"
            className="p-2 rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
