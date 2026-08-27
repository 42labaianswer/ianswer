 

'use client'

// ============================================================================
// src/app/dashboard/opt-outs/page.tsx
// ----------------------------------------------------------------------------
// Lista de usuarios opted-out de la company. Cumplimiento Meta WhatsApp.
// Patrón de carga companyId: igual que dashboard/billing/page.tsx
// ============================================================================

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import PageHeader from '../../../components/PageHeader'
import toast from 'react-hot-toast'
import {
  UserMinus, Search, X, Calendar, AlertCircle,
  RotateCcw, MessageCircle, Loader2, CheckCircle2, Download
} from 'lucide-react'

interface OptedOutContact {
  id: string
  external_id: string
  name: string | null
  opted_out_at: string
  opted_out_reason: string | null
  opted_out_keyword: string | null
}

export default function OptOutsPage() {
  const router = useRouter()
  const [companyId, setCompanyId]               = useState<string | null>(null)
  const [contacts, setContacts]                 = useState<OptedOutContact[]>([])
  const [loading, setLoading]                   = useState(true)
  const [search, setSearch]                     = useState('')
  const [reactivating, setReactivating]         = useState<string | null>(null)
  const [confirmReactivate, setConfirmReactivate] = useState<string | null>(null)

  // Cargar companyId del usuario autenticado
  useEffect(() => {
    const loadCompany = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle()

      if (!(profile as any)?.company_id) {
        toast.error('No se encontró la compañía asociada')
        setLoading(false)
        return
      }
      setCompanyId((profile as any).company_id as string)
    }
    loadCompany()
  }, [router])

  // Cuando hay companyId, cargar opt-outs
  useEffect(() => {
    if (!companyId) return
    loadOptOuts()
  }, [companyId])

  async function loadOptOuts() {
    if (!companyId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, external_id, name, opted_out_at, opted_out_reason, opted_out_keyword')
        .eq('company_id', companyId)
        .eq('opted_out', true)
        .order('opted_out_at', { ascending: false })

      if (error) throw error
      setContacts(((data as unknown) as OptedOutContact[]) || [])
    } catch (err) {
      console.error('Error cargando opt-outs', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleReactivate(externalId: string) {
    if (!companyId) return
    setReactivating(externalId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await (supabase.rpc as any)('register_opt_in', {
        p_company_id:   companyId,
        p_external_id:  externalId,
        p_triggered_by: user?.id,
        p_reason:       'Re-activado por admin desde dashboard'
      })
      if (error) throw error
      await loadOptOuts()
      setConfirmReactivate(null)
      toast.success('Usuario reactivado')
    } catch (err: any) {
      toast.error('Error al reactivar: ' + (err.message || 'desconocido'))
    } finally {
      setReactivating(null)
    }
  }

  function exportCSV() {
    if (contacts.length === 0) return
    const headers = ['Teléfono', 'Nombre', 'Fecha de baja', 'Palabra clave', 'Razón']
    const rows = contacts.map(c => [
      c.external_id,
      c.name || '',
      new Date(c.opted_out_at).toLocaleString('es-MX'),
      c.opted_out_keyword || '',
      c.opted_out_reason || ''
    ])
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `opt-outs-${new Date().toISOString().slice(0,10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const filtered = contacts.filter(c => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      c.external_id.toLowerCase().includes(q) ||
      (c.name || '').toLowerCase().includes(q) ||
      (c.opted_out_keyword || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="pb-20">
      <PageHeader
        title="Usuarios opted-out"
        description="Contactos que pidieron baja vía WhatsApp. Por política de Meta NO se les puede enviar mensajes ni siquiera plantillas. Si un usuario te contacta y pide volver, puedes reactivarlo manualmente."
      />

      <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertCircle size={18} className="text-amber-700 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-bold text-amber-900 leading-tight">
            Cumplimiento WhatsApp Business Policy
          </p>
          <p className="text-xs text-amber-800 font-medium mt-1">
            Meta exige respetar opt-outs. Si envías mensajes a usuarios de esta lista, tu número
            puede ser suspendido.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por teléfono, nombre o palabra clave..."
            className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-900"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-100">
              <X size={14} className="text-slate-500" />
            </button>
          )}
        </div>
        <button
          onClick={exportCSV}
          disabled={contacts.length === 0}
          className="px-4 py-3 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-2xl text-sm font-bold text-slate-700 flex items-center justify-center gap-2"
        >
          <Download size={14} />
          Exportar CSV
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <Stat label="Total opted-out" value={contacts.length} color="rose" />
        <Stat label="Últimos 7 días" value={contacts.filter(c => isWithinDays(c.opted_out_at, 7)).length} color="amber" />
        <Stat label="Últimas 24h" value={contacts.filter(c => isWithinDays(c.opted_out_at, 1)).length} color="slate" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin text-slate-700" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState hasSearch={!!search} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {filtered.map((c, idx) => (
            <div
              key={c.id}
              className={`p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <UserMinus size={14} className="text-rose-500" />
                  <p className="font-mono text-sm font-bold text-slate-950">{c.external_id}</p>
                  {c.name && (
                    <span className="text-sm font-medium text-slate-600">· {c.name}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={11} />
                    {new Date(c.opted_out_at).toLocaleString('es-MX')}
                  </span>
                  {c.opted_out_keyword && (
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle size={11} />
                      Palabra: <code className="px-1.5 py-0.5 bg-slate-100 rounded font-bold">{c.opted_out_keyword}</code>
                    </span>
                  )}
                </div>
              </div>

              {confirmReactivate === c.external_id ? (
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-rose-700 font-medium">¿Reactivar?</span>
                  <button
                    onClick={() => handleReactivate(c.external_id)}
                    disabled={reactivating === c.external_id}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black"
                  >
                    {reactivating === c.external_id ? <Loader2 size={12} className="animate-spin" /> : 'Sí'}
                  </button>
                  <button
                    onClick={() => setConfirmReactivate(null)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmReactivate(c.external_id)}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5"
                >
                  <RotateCcw size={11} />
                  Reactivar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: 'rose' | 'amber' | 'slate' }) {
  const colors: Record<string, string> = {
    rose:  'bg-rose-50 border-rose-200 text-rose-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    slate: 'bg-slate-50 border-slate-200 text-slate-700'
  }
  return (
    <div className={`${colors[color]} border rounded-2xl p-4`}>
      <p className="text-[10px] font-black uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-2xl font-black mt-1">{value}</p>
    </div>
  )
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
      <CheckCircle2 size={40} className="text-emerald-500 mx-auto mb-3" />
      <p className="text-sm font-bold text-slate-700 mb-1">
        {hasSearch ? 'Sin resultados' : 'Ningún usuario ha pedido baja'}
      </p>
      <p className="text-xs text-slate-500 font-medium">
        {hasSearch ? 'Prueba con otra búsqueda' : 'Tu reputación con WhatsApp está limpia'}
      </p>
    </div>
  )
}

function isWithinDays(timestamp: string, days: number): boolean {
  const d = new Date(timestamp).getTime()
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return d >= cutoff
}
