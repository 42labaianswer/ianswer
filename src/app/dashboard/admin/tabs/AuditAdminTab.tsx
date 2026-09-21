 

'use client'

// ============================================================================
// src/app/dashboard/admin/tabs/AuditAdminTab.tsx
// ----------------------------------------------------------------------------
// Tab admin para ver:
//   - Solicitudes de borrado de datos (data_deletion_requests)
//   - Log auditable de acciones de operadores humanos
//
// Permite a un admin marcar solicitudes como completadas (lo cual ejecuta el
// borrado real vía RPC complete_data_deletion).
// ============================================================================

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../../lib/supabase'
import toast from 'react-hot-toast'
import {
  Trash2, ShieldAlert, Loader2, CheckCircle2, Clock,
  AlertCircle, FileText, RefreshCw, Filter, Eye, X
} from 'lucide-react'
import IAnswerLoader from '../../../../components/IAnswerLoader'

type Tab = 'deletion' | 'audit'

interface DeletionRequest {
  id: string
  company_id: string | null
  requester_type: string
  requester_email: string | null
  requester_phone: string | null
  reason: string | null
  scope: string
  source: string
  status: string
  meta_confirmation_code: string | null
  created_at: string
  completed_at: string | null
  records_deleted: any
}

interface AuditLog {
  id: string
  company_id: string
  operator_id: string | null
  operator_email: string | null
  action_type: string
  target_type: string | null
  target_id: string | null
  description: string | null
  metadata: any
  created_at: string
}

export default function AuditAdminTab() {
  const [tab, setTab] = useState<Tab>('deletion')

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-2xl">
          <ShieldAlert size={20} className="text-rose-600" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-950">Privacidad y Auditoría</h2>
          <p className="text-sm text-slate-600 font-medium">
            Solicitudes de borrado de datos y registro auditable de acciones humanas. Cumplimiento LFPDPPP + Meta.
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <TabButton active={tab === 'deletion'} onClick={() => setTab('deletion')} icon={Trash2}>
          Solicitudes de borrado
        </TabButton>
        <TabButton active={tab === 'audit'} onClick={() => setTab('audit')} icon={FileText}>
          Log de acciones
        </TabButton>
      </div>

      {tab === 'deletion' && <DeletionRequestsPanel />}
      {tab === 'audit'    && <AuditLogPanel />}
    </div>
  )
}

function TabButton({ active, onClick, icon: Icon, children }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 -mb-px text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
        active
          ? 'border-slate-950 text-slate-950'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      <Icon size={14} />
      {children}
    </button>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Panel: Solicitudes de borrado
// ════════════════════════════════════════════════════════════════════════

function DeletionRequestsPanel() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedReq, setSelectedReq]   = useState<DeletionRequest | null>(null)

  const { data: requests = [], isLoading, refetch } = useQuery({
    queryKey: ['data-deletion-requests', statusFilter],
    queryFn: async () => {
      let q = supabase
        .from('data_deletion_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (statusFilter !== 'all') q = q.eq('status', statusFilter)

      const { data, error } = await q
      if (error) throw error
      return ((data as unknown) as DeletionRequest[]) || []
    }
  })

  const completeMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await (supabase.rpc as any)('complete_data_deletion', {
        p_request_id:   requestId,
        p_processed_by: user?.id || null
      })
      if (error) throw error
      if (!(data as any)?.success) throw new Error((data as any)?.error || 'Error')
      return data
    },
    onSuccess: (result: any) => {
      toast.success(`Borrado completado. ${result.records_deleted?.messages || 0} mensajes eliminados.`)
      queryClient.invalidateQueries({ queryKey: ['data-deletion-requests'] })
      setSelectedReq(null)
    },
    onError: (err: any) => {
      toast.error('Error: ' + (err.message || 'desconocido'))
    }
  })

  const statusCounts = requests.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
          label="Todas"
          count={requests.length}
        />
        <FilterChip
          active={statusFilter === 'pending'}
          onClick={() => setStatusFilter('pending')}
          label="Pendientes"
          count={statusCounts.pending || 0}
          tone="amber"
        />
        <FilterChip
          active={statusFilter === 'completed'}
          onClick={() => setStatusFilter('completed')}
          label="Completadas"
          count={statusCounts.completed || 0}
          tone="emerald"
        />

        <button
          onClick={() => refetch()}
          className="ml-auto px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-700 flex items-center gap-1.5"
        >
          <RefreshCw size={12} />
          Refrescar
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <IAnswerLoader size={24} />
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <Trash2 size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">Sin solicitudes</p>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Las solicitudes públicas aparecerán aquí
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {requests.map((req, idx) => (
            <DeletionRequestRow
              key={req.id}
              req={req}
              isFirst={idx === 0}
              onView={() => setSelectedReq(req)}
              onComplete={() => completeMutation.mutate(req.id)}
              processing={completeMutation.isPending && completeMutation.variables === req.id}
            />
          ))}
        </div>
      )}

      {selectedReq && (
        <DeletionRequestModal
          req={selectedReq}
          onClose={() => setSelectedReq(null)}
          onComplete={() => completeMutation.mutate(selectedReq.id)}
          processing={completeMutation.isPending}
        />
      )}
    </div>
  )
}

function DeletionRequestRow({ req, isFirst, onView, onComplete, processing }: {
  req: DeletionRequest; isFirst: boolean; onView: () => void; onComplete: () => void; processing: boolean
}) {
  const StatusIcon = req.status === 'completed' ? CheckCircle2 :
                     req.status === 'pending'   ? Clock :
                     req.status === 'failed'    ? AlertCircle :
                                                   Clock

  const statusColor = req.status === 'completed' ? 'text-emerald-600' :
                      req.status === 'pending'   ? 'text-amber-600' :
                      req.status === 'failed'    ? 'text-rose-600' :
                                                    'text-slate-500'

  return (
    <div className={`p-4 flex items-center gap-3 ${isFirst ? '' : 'border-t border-slate-100'}`}>
      <StatusIcon size={16} className={`${statusColor} shrink-0`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-slate-950">
            {req.requester_email || req.requester_phone || 'Sin identificación'}
          </p>
          <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">
            {req.source}
          </span>
          {req.meta_confirmation_code && (
            <code className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-950 text-white rounded">
              {req.meta_confirmation_code}
            </code>
          )}
        </div>
        <p className="text-xs text-slate-500 font-medium mt-0.5">
          {new Date(req.created_at).toLocaleString('es-MX')} · {req.scope}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onView}
          className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
          title="Ver detalle"
        >
          <Eye size={14} />
        </button>
        {req.status === 'pending' && (
          <button
            onClick={onComplete}
            disabled={processing}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-black flex items-center gap-1.5"
          >
            {processing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Procesar
          </button>
        )}
      </div>
    </div>
  )
}

function DeletionRequestModal({ req, onClose, onComplete, processing }: {
  req: DeletionRequest; onClose: () => void; onComplete: () => void; processing: boolean
}) {
  return (
    <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-3xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-rose-600 mb-1">
              Solicitud · {req.status}
            </p>
            <h3 className="text-xl font-black text-slate-950">Detalle del borrado</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="space-y-3 mb-6">
          <Detail label="Email"   value={req.requester_email || '—'} />
          <Detail label="Teléfono" value={req.requester_phone || '—'} mono />
          <Detail label="Alcance" value={req.scope} />
          <Detail label="Origen"  value={req.source} />
          {req.meta_confirmation_code && (
            <Detail label="Código confirmación" value={req.meta_confirmation_code} mono />
          )}
          {req.reason && <Detail label="Razón" value={req.reason} />}
          <Detail label="Solicitado" value={new Date(req.created_at).toLocaleString('es-MX')} />
          {req.completed_at && (
            <Detail label="Completado" value={new Date(req.completed_at).toLocaleString('es-MX')} />
          )}
          {req.records_deleted && Object.keys(req.records_deleted).length > 0 && (
            <Detail
              label="Registros borrados"
              value={JSON.stringify(req.records_deleted)}
              mono
            />
          )}
        </div>

        {req.status === 'pending' && (
          <button
            onClick={onComplete}
            disabled={processing}
            className="w-full px-6 py-3 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2"
          >
            {processing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Procesar borrado ahora
          </button>
        )}
      </div>
    </div>
  )
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">{label}</p>
      <p className={`text-sm text-slate-900 font-medium text-right break-all ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Panel: Audit log
// ════════════════════════════════════════════════════════════════════════

function AuditLogPanel() {
  const [actionFilter, setActionFilter] = useState<string>('all')

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['audit-log', actionFilter],
    queryFn: async () => {
      let q = supabase
        .from('operator_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (actionFilter !== 'all') q = q.eq('action_type', actionFilter)

      const { data, error } = await q
      if (error) throw error
      return ((data as unknown) as AuditLog[]) || []
    }
  })

  const ACTIONS = [
    { id: 'all',                     label: 'Todas' },
    { id: 'message_sent_manual',     label: 'Envío manual' },
    { id: 'opt_in_manual',           label: 'Reactivación' },
    { id: 'data_deletion_processed', label: 'Borrados' },
    { id: 'whatsapp_connected',      label: 'WhatsApp conectado' },
    { id: 'export_data',             label: 'Exportar CSV' }
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {ACTIONS.map(a => (
          <button
            key={a.id}
            onClick={() => setActionFilter(a.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              actionFilter === a.id
                ? 'bg-slate-950 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {a.label}
          </button>
        ))}

        <button
          onClick={() => refetch()}
          className="ml-auto px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-700 flex items-center gap-1.5"
        >
          <RefreshCw size={12} />
          Refrescar
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <IAnswerLoader size={24} />
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <FileText size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">Sin actividad registrada</p>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Las acciones de operadores aparecerán aquí
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {logs.map((log, idx) => (
            <div
              key={log.id}
              className={`p-3 ${idx === 0 ? '' : 'border-t border-slate-100'}`}
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-2 h-2 mt-2 rounded-full bg-slate-400" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <p className="text-sm font-bold text-slate-950">
                      {log.operator_email || 'Sistema'}
                    </p>
                    <code className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-bold">
                      {log.action_type}
                    </code>
                  </div>
                  <p className="text-xs text-slate-700 font-medium">
                    {log.description || '—'}
                  </p>
                  <p className="text-[11px] text-slate-400 font-medium mt-1">
                    {new Date(log.created_at).toLocaleString('es-MX')}
                    {log.target_type && ` · ${log.target_type}`}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FilterChip({ active, onClick, label, count, tone = 'slate' }: {
  active: boolean; onClick: () => void; label: string; count: number; tone?: 'slate' | 'amber' | 'emerald'
}) {
  const tones: Record<string, string> = {
    slate:   active ? 'bg-slate-950 text-white' : 'bg-white border border-slate-200 text-slate-700',
    amber:   active ? 'bg-amber-600 text-white' : 'bg-amber-50 border border-amber-200 text-amber-800',
    emerald: active ? 'bg-emerald-600 text-white' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
  }
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 ${tones[tone]}`}
    >
      {label}
      <span className={`px-1.5 py-0.5 rounded text-[10px] ${active ? 'bg-white/20' : 'bg-white/60'}`}>
        {count}
      </span>
    </button>
  )
}
