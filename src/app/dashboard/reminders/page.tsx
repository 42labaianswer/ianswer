 

'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '../../../components/WorkspaceContext'
import { usePlanFeatures } from '../../../hooks/usePlanFeatures'
import { useConfirm } from '../../../hooks/useConfirm'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  Bell, Plus, Power, Clock, MessageSquare, Users, ListChecks, BarChart3,
  Trash2, Edit2, X, Save, Loader2, CheckCircle2, AlertCircle, Sparkles,
  Calendar as CalendarIcon, UserX, Send, Search, ChevronRight, Settings,
  TrendingUp, RefreshCw, Eye, Zap, Copy
} from 'lucide-react'
import IAnswerLoader from '../../../components/IAnswerLoader'

// ============================================================================
// TYPES
// ============================================================================
type TriggerSource = 'appointment' | 'contact_inactivity' | 'specific_datetime'

type ReminderRule = {
  id: string
  company_id: string
  agenda_id: string | null
  name: string
  description: string | null
  trigger_source: TriggerSource
  trigger_offset_minutes: number
  applies_to_status: string[] | null
  applies_to_lifecycle_stage: string[] | null
  message_template: string
  channel: string
  include_action_buttons: boolean
  auto_respond_to_actions: boolean
  response_on_confirm: string | null
  response_on_cancel: string | null
  is_active: boolean
  vertical_source: string | null
  created_at: string
}

type ReminderTemplate = {
  id: string
  vertical_slug: string
  name: string
  description: string | null
  trigger_source: TriggerSource
  trigger_offset_minutes: number
  applies_to_status: string[] | null
  applies_to_lifecycle_stage: string[] | null
  message_template: string
  include_action_buttons: boolean
  recommended_active: boolean
  display_order: number
}

type QueueItem = {
  id: string
  rule_id: string
  appointment_id: string | null
  contact_id: string
  scheduled_at: string
  status: 'pending' | 'sent' | 'failed' | 'cancelled' | 'skipped'
  rendered_content: string | null
  patient_response: 'confirmed' | 'cancelled' | 'other' | null
  patient_responded_at: string | null
  patient_response_message: string | null
  sent_at: string | null
  error_message: string | null
  attempts: number
  contacts?: { name: string | null, phone: string | null }
  reminder_rules?: { name: string }
}

type Agenda = { id: string, name: string }

// ============================================================================
// HELPERS
// ============================================================================
const formatOffset = (mins: number, source: TriggerSource): string => {
  if (source === 'contact_inactivity') {
    if (mins >= 1440) return `tras ${Math.floor(mins / 1440)} día${mins >= 2880 ? 's' : ''} sin respuesta`
    if (mins >= 60) return `tras ${Math.floor(mins / 60)} h sin respuesta`
    return `tras ${mins} min sin respuesta`
  }
  const isAfter = mins < 0
  const abs = Math.abs(mins)
  let str = ''
  if (abs >= 1440) str = `${Math.floor(abs / 1440)} día${abs >= 2880 ? 's' : ''}`
  else if (abs >= 60) str = `${Math.floor(abs / 60)} h${abs % 60 ? ' ' + (abs % 60) + ' min' : ''}`
  else str = `${abs} min`
  return isAfter ? `${str} después de la cita` : `${str} antes de la cita`
}

const sourceLabel = (src: TriggerSource) => {
  switch (src) {
    case 'appointment': return 'Basado en cita'
    case 'contact_inactivity': return 'Inactividad'
    case 'specific_datetime': return 'Fecha específica'
  }
}

const sourceIcon = (src: TriggerSource) => {
  switch (src) {
    case 'appointment': return CalendarIcon
    case 'contact_inactivity': return UserX
    case 'specific_datetime': return Clock
  }
}

const statusColors: Record<string, string> = {
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  sent:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed:    'bg-rose-50 text-rose-700 border-rose-200',
  cancelled: 'bg-slate-50 text-slate-500 border-slate-200',
  skipped:   'bg-slate-50 text-slate-500 border-slate-200'
}

const statusLabels: Record<string, string> = {
  pending: 'Pendiente', sent: 'Enviado', failed: 'Falló', cancelled: 'Cancelado', skipped: 'Omitido'
}

// ============================================================================
// PÁGINA PRINCIPAL
// ============================================================================
export default function RemindersPage() {
  const { confirm, ConfirmDialog } = useConfirm()
  const queryClient = useQueryClient()
  const router = useRouter()
  const { primaryTemplate: vertical } = useWorkspace()
  const { data: features, isLoading: isLoadingFeatures } = usePlanFeatures()
  const [activeTab, setActiveTab] = useState<'rules' | 'queue' | 'metrics'>('rules')

  // Modal de regla (crear/editar)
  const [editingRule, setEditingRule] = useState<ReminderRule | null>(null)
  const [creatingRule, setCreatingRule] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  // 1. Profile
  const { data: profile } = useQuery({
    queryKey: ['currentUserProfile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      const { data } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      return data
    }
  })
  const companyId = profile?.company_id

  // 2. Agendas (para el dropdown del modal)
  const { data: agendas = [] } = useQuery({
    queryKey: ['agendasForReminders', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase.from('agendas').select('id, name').eq('company_id', companyId)
      return (data || []) as Agenda[]
    }
  })

  // 3. Reglas
  const { data: rules = [], isLoading: isLoadingRules } = useQuery({
    queryKey: ['reminderRules', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from('reminder_rules')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      return (data || []) as ReminderRule[]
    }
  })

  // 4. Toggle activo
  const toggleRule = useMutation({
    mutationFn: async ({ id, is_active }: { id: string, is_active: boolean }) => {
      const { error } = await supabase.from('reminder_rules').update({ is_active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Estado actualizado')
      queryClient.invalidateQueries({ queryKey: ['reminderRules'] })
    },
    onError: (e: any) => toast.error(e.message)
  })

  // 5. Borrar regla
  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reminder_rules').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Regla eliminada')
      queryClient.invalidateQueries({ queryKey: ['reminderRules'] })
    },
    onError: (e: any) => toast.error(e.message)
  })

  // v2.4: Guard de feature gating
  if (isLoadingFeatures) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <IAnswerLoader size={32} />
      </div>
    )
  }
  if (!features?.crm_reminders) {
    return (
      <div className="max-w-2xl mx-auto py-20">
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 text-white flex items-center justify-center shadow-lg mb-5">
            <Bell size={28} />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">Recordatorios no disponibles en tu plan</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
            Los recordatorios automáticos por WhatsApp te permiten configurar reglas como "24h antes de la cita" o "post-consulta" para que tus pacientes confirmen, cancelen y se acuerden de su cita.
          </p>
          <button
            onClick={() => router.push('/dashboard/plans')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-black rounded-xl shadow-md inline-flex items-center gap-2"
          >
            Ver planes disponibles
          </button>
        </div>
      </div>
    )
  }

  return (
<div className="px-4 md:px-8 py-4 md:py-6 space-y-4 md:space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => setTemplatesOpen(true)}
          className="px-5 py-2.5 rounded-xl text-sm font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-all"
        >
          <Sparkles size={16} className="text-purple-500" /> Plantillas sugeridas
        </button>
        <button
          onClick={() => setCreatingRule(true)}
          className="px-5 py-2.5 rounded-xl text-sm font-black bg-slate-900 hover:bg-slate-800 text-white shadow-md flex items-center gap-2 transition-all"
        >
          <Plus size={16} /> Nueva Regla
        </button>
      </div>

      {/* TABS */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl w-fit">
        {[
          { id: 'rules', label: 'Reglas', icon: ListChecks },
          { id: 'queue', label: 'Cola', icon: Send },
          { id: 'metrics', label: 'Métricas', icon: BarChart3 }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      {activeTab === 'rules' && (
        <RulesTab
          rules={rules}
          isLoading={isLoadingRules}
          agendas={agendas}
          onEdit={setEditingRule}
          onToggle={(id, is_active) => toggleRule.mutate({ id, is_active })}
          onDelete={async (id) => {
            if (await confirm('¿Eliminar regla? Sus recordatorios pendientes se cancelarán.', { title: 'Eliminar regla', danger: true, confirmText: 'Eliminar' })) {
              deleteRule.mutate(id)
            }
          }}
          onCreate={() => setCreatingRule(true)}
        />
      )}

      {activeTab === 'queue' && companyId && (
        <QueueTab companyId={companyId} />
      )}

      {activeTab === 'metrics' && companyId && (
        <MetricsTab companyId={companyId} />
      )}

      {/* MODALES */}
      {(editingRule || creatingRule) && companyId && (
        <RuleModal
          rule={editingRule}
          agendas={agendas}
          companyId={companyId}
          verticalSlug={vertical?.id || 'health'}
          onClose={() => { setEditingRule(null); setCreatingRule(false) }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['reminderRules'] })
            setEditingRule(null)
            setCreatingRule(false)
          }}
        />
      )}

      {templatesOpen && companyId && (
        <TemplatesModal
          verticalSlug={vertical?.id || 'health'}
          companyId={companyId}
          existingRules={rules}
          onClose={() => setTemplatesOpen(false)}
          onImported={() => {
            queryClient.invalidateQueries({ queryKey: ['reminderRules'] })
            setTemplatesOpen(false)
          }}
        />
      )}
      {ConfirmDialog}
    </div>
  )
}

// ============================================================================
// TAB: REGLAS
// ============================================================================

// v2.6: detecta reglas de retención (reactivación o post-cita) para destacarlas
function isRetentionRule(rule: ReminderRule): boolean {
  // Reactivación: contact_inactivity con offset de 7+ días
  if (rule.trigger_source === 'contact_inactivity' && rule.trigger_offset_minutes >= 60 * 24 * 7) return true
  // Post-cita: appointment con offset negativo (después de la cita)
  if (rule.trigger_source === 'appointment' && rule.trigger_offset_minutes < 0) return true
  return false
}

function RulesTab({
  rules, isLoading, agendas, onEdit, onToggle, onDelete, onCreate
}: {
  rules: ReminderRule[]
  isLoading: boolean
  agendas: Agenda[]
  onEdit: (r: ReminderRule) => void
  onToggle: (id: string, is_active: boolean) => void
  onDelete: (id: string) => void
  onCreate: () => void
}) {
  if (isLoading) {
    return <div className="flex justify-center py-20"><IAnswerLoader size={32} /></div>
  }

  if (rules.length === 0) {
    return (
      <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-16 text-center">
        <Bell size={48} className="mx-auto text-slate-300 mb-4" />
        <h3 className="text-xl font-black text-slate-700 mb-2">Aún no tienes reglas</h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
          Crea reglas para que el sistema envíe mensajes automáticos antes y después de las citas, o cuando un paciente lleva un tiempo sin responder.
        </p>
        <button onClick={onCreate} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-black rounded-xl shadow-md inline-flex items-center gap-2">
          <Plus size={16} /> Crear mi primera regla
        </button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[...rules].sort((a, b) => {
        // v2.6: reglas de retención pausadas suben al inicio para invitar a activarlas
        const aIsRetention = isRetentionRule(a) && !a.is_active
        const bIsRetention = isRetentionRule(b) && !b.is_active
        if (aIsRetention && !bIsRetention) return -1
        if (!aIsRetention && bIsRetention) return 1
        return 0
      }).map(rule => {
        const Icon = sourceIcon(rule.trigger_source)
        const agendaLabel = rule.agenda_id
          ? (agendas.find(a => a.id === rule.agenda_id)?.name || 'Agenda específica')
          : 'Todas las agendas'

        // v2.6: detectar si es regla de retención (reactivación o post-cita)
        const isRetention = isRetentionRule(rule)
        const isReactivation = rule.trigger_source === 'contact_inactivity' && rule.trigger_offset_minutes >= 60 * 24 * 7
        const showRetentionHint = isRetention && !rule.is_active

        const cardBorder = showRetentionHint
          ? 'border-emerald-300 ring-2 ring-emerald-100'
          : rule.is_active
          ? 'border-blue-100'
          : 'border-slate-200 opacity-70'

        const iconBg = isRetention && rule.is_active
          ? 'bg-emerald-50 text-emerald-600'
          : rule.is_active
          ? 'bg-blue-50 text-blue-600'
          : 'bg-slate-100 text-slate-400'

        return (
          <div key={rule.id} className={`bg-white rounded-2xl border-2 p-5 shadow-sm transition-all ${cardBorder}`}>
            {showRetentionHint && (
              <div className="mb-3 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
                <Sparkles size={12} className="text-emerald-600" />
                <p className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">
                  Recomendada · {isReactivation ? 'Reactiva pacientes dormidos' : 'Diferencia tu servicio'}
                </p>
              </div>
            )}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-black text-slate-900 text-base truncate">{rule.name}</h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {sourceLabel(rule.trigger_source)} · {formatOffset(rule.trigger_offset_minutes, rule.trigger_source)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => onToggle(rule.id, !rule.is_active)}
                className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${rule.is_active ? 'bg-blue-600' : 'bg-slate-300'}`}
                title={rule.is_active ? 'Pausar' : 'Activar'}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${rule.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 mb-3 border border-slate-100">
              <p className="text-xs text-slate-600 font-medium line-clamp-3 leading-relaxed">
                {rule.message_template}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 uppercase tracking-wider">{agendaLabel}</span>
              {rule.include_action_buttons && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 uppercase tracking-wider">Con botones</span>
              )}
              {rule.vertical_source && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 uppercase tracking-wider">Plantilla</span>
              )}
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
              <button onClick={() => onEdit(rule)} className="flex-1 text-xs font-bold py-2 rounded-lg text-slate-600 hover:bg-slate-100 inline-flex items-center justify-center gap-1.5 transition-colors">
                <Edit2 size={12} /> Editar
              </button>
              <button onClick={() => onDelete(rule.id)} className="text-xs font-bold py-2 px-3 rounded-lg text-rose-500 hover:bg-rose-50 inline-flex items-center justify-center gap-1.5 transition-colors">
                <Trash2 size={12} /> Eliminar
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// TAB: COLA
// ============================================================================
function QueueTab({ companyId }: { companyId: string }) {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const queryClient = useQueryClient()

  const { data: queue = [], isLoading } = useQuery({
    queryKey: ['reminderQueue', companyId, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from('reminder_queue')
        .select('*, contacts(name, phone), reminder_rules(name)')
        .eq('company_id', companyId)
        .order('scheduled_at', { ascending: false })
        .limit(200)
      if (statusFilter !== 'all') q = q.eq('status', statusFilter)
      const { data } = await q
      return (data || []) as QueueItem[]
    }
  })

  const counts = useMemo(() => {
    const by: Record<string, number> = { all: queue.length, pending: 0, sent: 0, failed: 0, cancelled: 0 }
    queue.forEach(q => { if (by[q.status] !== undefined) by[q.status]++ })
    return by
  }, [queue])

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all', label: 'Todos', color: 'slate' },
          { id: 'pending', label: 'Pendientes', color: 'amber' },
          { id: 'sent', label: 'Enviados', color: 'emerald' },
          { id: 'failed', label: 'Fallidos', color: 'rose' },
          { id: 'cancelled', label: 'Cancelados', color: 'slate' }
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${statusFilter === f.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            {f.label} <span className={`ml-1.5 px-1.5 py-0.5 rounded-md text-[10px] ${statusFilter === f.id ? 'bg-white/20' : 'bg-slate-100'}`}>{counts[f.id] || 0}</span>
          </button>
        ))}
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['reminderQueue'] })}
          className="ml-auto px-4 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-2"
        >
          <RefreshCw size={12} /> Refrescar
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex justify-center"><IAnswerLoader size={32} /></div>
        ) : queue.length === 0 ? (
          <div className="py-20 text-center">
            <Send size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-500 font-bold">Sin registros para mostrar</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
            {queue.map(q => (
              <QueueRow key={q.id} item={q} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function QueueRow({ item }: { item: QueueItem }) {
  const [open, setOpen] = useState(false)
  const scheduled = new Date(item.scheduled_at)
  const sent = item.sent_at ? new Date(item.sent_at) : null
  const responded = item.patient_responded_at ? new Date(item.patient_responded_at) : null

  return (
    <div className="hover:bg-slate-50 transition-colors">
      <button onClick={() => setOpen(o => !o)} className="w-full px-5 py-3 flex items-center gap-4 text-left">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${statusColors[item.status]}`}>
          {statusLabels[item.status]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">
            {item.contacts?.name || item.contact_id} · {item.reminder_rules?.name || 'Regla eliminada'}
          </p>
          <p className="text-xs text-slate-500 font-medium">
            {item.status === 'sent' && sent ? `Enviado ${sent.toLocaleString('es-MX')}` : `Programado para ${scheduled.toLocaleString('es-MX')}`}
          </p>
        </div>
        {item.patient_response && (
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${item.patient_response === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
            {item.patient_response === 'confirmed' ? '✓ Confirmó' : '✗ Canceló'}
          </span>
        )}
        <ChevronRight size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-4 bg-slate-50/50 border-t border-slate-100">
          {item.rendered_content && (
            <div className="mt-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Mensaje enviado</p>
              <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                {item.rendered_content}
              </div>
            </div>
          )}
          {item.patient_response && responded && (
            <div className="mt-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Respuesta del paciente · {responded.toLocaleString('es-MX')}
              </p>
              <div className={`p-3 rounded-xl border text-xs whitespace-pre-wrap leading-relaxed ${item.patient_response === 'confirmed' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
                {item.patient_response_message || (item.patient_response === 'confirmed' ? 'CONFIRMÓ' : 'CANCELÓ')}
              </div>
            </div>
          )}
          {item.error_message && (
            <div className="mt-3">
              <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-1.5">Error</p>
              <div className="bg-rose-50 p-3 rounded-xl border border-rose-200 text-xs text-rose-700">
                {item.error_message}
              </div>
            </div>
          )}
          <div className="mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Intentos: {item.attempts} · Teléfono: {item.contacts?.phone || item.contact_id}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// TAB: MÉTRICAS
// ============================================================================
function MetricsTab({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient()
  const [intervalMin, setIntervalMin] = useState<number>(5)

  const { data: metrics } = useQuery({
    queryKey: ['reminderMetrics', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('v_reminder_metrics').select('*').eq('company_id', companyId).maybeSingle()
      return data || { sent_today: 0, sent_this_week: 0, sent_this_month: 0, pending_today: 0, pending_total: 0, failed_total: 0, confirmed_responses: 0, cancelled_responses: 0, no_response: 0 }
    }
  })

  // v2.6: métricas de reactivación
  const { data: retention } = useQuery({
    queryKey: ['reactivationMetrics', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('v_reactivation_metrics').select('*').eq('company_id', companyId).maybeSingle()
      return data || { pacientes_reactivados_30d: 0, pacientes_contactados_30d: 0, pacientes_dormidos_elegibles: 0 }
    }
  })

  const { data: config } = useQuery({
    queryKey: ['reminderConfig'],
    queryFn: async () => {
      const { data } = await supabase.from('platform_settings').select('reminder_cron_interval_minutes, reminder_max_attempts, reminder_last_run_at').single()
      return data
    }
  })

  useEffect(() => {
    if (config?.reminder_cron_interval_minutes) setIntervalMin(config.reminder_cron_interval_minutes)
  }, [config])

  const saveConfig = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('platform_settings').update({ reminder_cron_interval_minutes: intervalMin }).eq('id', 1)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Intervalo guardado')
      queryClient.invalidateQueries({ queryKey: ['reminderConfig'] })
    },
    onError: (e: any) => toast.error(e.message)
  })

  const responseRate = metrics && (metrics.confirmed_responses + metrics.cancelled_responses + metrics.no_response) > 0
    ? Math.round(((metrics.confirmed_responses + metrics.cancelled_responses) / (metrics.confirmed_responses + metrics.cancelled_responses + metrics.no_response)) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard icon={Send} color="blue" label="Enviados hoy" value={metrics?.sent_today || 0} />
        <KPICard icon={TrendingUp} color="purple" label="Enviados esta semana" value={metrics?.sent_this_week || 0} />
        <KPICard icon={Clock} color="amber" label="Pendientes hoy" value={metrics?.pending_today || 0} sub={`${metrics?.pending_total || 0} totales`} />
        <KPICard icon={AlertCircle} color="rose" label="Fallidos (total)" value={metrics?.failed_total || 0} />
      </div>

      {/* Respuestas del paciente */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
          <Zap size={16} className="text-purple-500" /> Respuestas del paciente
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPISmall label="Confirmaron" value={metrics?.confirmed_responses || 0} color="emerald" />
          <KPISmall label="Cancelaron" value={metrics?.cancelled_responses || 0} color="rose" />
          <KPISmall label="Sin responder" value={metrics?.no_response || 0} color="slate" />
          <KPISmall label="Tasa respuesta" value={`${responseRate}%`} color="blue" />
        </div>
      </div>

      {/* v2.6: Retención y reactivación */}
      <div className="bg-gradient-to-br from-emerald-50/60 via-white to-blue-50/40 rounded-2xl border border-emerald-100 p-6">
        <div className="flex items-start justify-between mb-1 flex-wrap gap-2">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-600" /> Retención y reactivación
          </h3>
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full uppercase tracking-wider">
            Últimos 30 días
          </span>
        </div>
        <p className="text-xs text-slate-500 font-medium mb-5">
          El dinero real está en los pacientes dormidos que ya conoces. Activa la regla "Reactivación 90 días" para empezar.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-sm">
            <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wider mb-1">Pacientes reactivados</p>
            <p className="text-3xl font-black text-emerald-700 tabular-nums">{retention?.pacientes_reactivados_30d || 0}</p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Volvieron a escribir tras un recordatorio de reactivación.</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Contactados</p>
            <p className="text-3xl font-black text-slate-900 tabular-nums">{retention?.pacientes_contactados_30d || 0}</p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Recibieron un mensaje de reactivación automática.</p>
          </div>
          <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-sm">
            <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-1">Pacientes dormidos</p>
            <p className="text-3xl font-black text-amber-600 tabular-nums">{retention?.pacientes_dormidos_elegibles || 0}</p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Más de 90 días sin contacto. Elegibles para reactivar.</p>
          </div>
        </div>
        {retention && retention.pacientes_contactados_30d > 0 && (
          <div className="mt-4 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
            <p className="text-xs text-emerald-800 font-bold">
              Tasa de reactivación: <span className="text-base">
                {Math.round((retention.pacientes_reactivados_30d / retention.pacientes_contactados_30d) * 100)}%
              </span>
              {' '}({retention.pacientes_reactivados_30d} de {retention.pacientes_contactados_30d} respondieron)
            </p>
          </div>
        )}
      </div>

      {/* Configuración del cron */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
          <Settings size={16} className="text-slate-500" /> Configuración del cron
        </h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Intervalo de procesamiento</label>
            <p className="text-[11px] text-slate-400 mt-0.5 mb-2">Cada cuántos minutos n8n procesa la cola. Recomendado: 5 min.</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="60"
                value={intervalMin}
                onChange={e => setIntervalMin(parseInt(e.target.value) || 5)}
                className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-blue-500"
              />
              <span className="text-sm text-slate-500 font-medium">minutos</span>
              <button
                onClick={() => saveConfig.mutate()}
                disabled={saveConfig.isPending || intervalMin === config?.reminder_cron_interval_minutes}
                className="ml-auto px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl disabled:opacity-40 flex items-center gap-2"
              >
                {saveConfig.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Guardar
              </button>
            </div>
          </div>
          {config?.reminder_last_run_at && (
            <div className="pt-3 border-t border-slate-100">
              <p className="text-[11px] text-slate-400 font-medium">
                Última ejecución: {new Date(config.reminder_last_run_at).toLocaleString('es-MX')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KPICard({ icon: Icon, color, label, value, sub }: any) {
  const colorMap: any = {
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-600' },
    purple:  { bg: 'bg-purple-50',  text: 'text-purple-600' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-600' },
    rose:    { bg: 'bg-rose-50',    text: 'text-rose-600' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' }
  }
  const c = colorMap[color] || colorMap.blue
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
      <div className={`h-11 w-11 rounded-xl ${c.bg} ${c.text} flex items-center justify-center shrink-0`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-black text-slate-900 leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-slate-500 font-medium">{sub}</p>}
      </div>
    </div>
  )
}

function KPISmall({ label, value, color }: any) {
  const colorMap: any = {
    emerald: 'text-emerald-700',
    rose:    'text-rose-700',
    slate:   'text-slate-700',
    blue:    'text-blue-700'
  }
  return (
    <div className="bg-slate-50 rounded-xl p-3 text-center">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-black mt-1 ${colorMap[color] || colorMap.slate}`}>{value}</p>
    </div>
  )
}

// ============================================================================
// MODAL: Crear / Editar regla
// ============================================================================
function RuleModal({
  rule, agendas, companyId, verticalSlug, onClose, onSaved
}: {
  rule: ReminderRule | null
  agendas: Agenda[]
  companyId: string
  verticalSlug: string
  onClose: () => void
  onSaved: () => void
}) {
  const isEditing = !!rule
  const [form, setForm] = useState({
    name: rule?.name || '',
    description: rule?.description || '',
    agenda_id: rule?.agenda_id || '',
    trigger_source: rule?.trigger_source || 'appointment' as TriggerSource,
    offset_value: 1,
    offset_unit: 'days' as 'minutes' | 'hours' | 'days',
    is_after: false,    // solo para 'appointment'
    applies_to_status: rule?.applies_to_status || ['confirmed', 'scheduled'],
    message_template: rule?.message_template || '',
    include_action_buttons: rule?.include_action_buttons || false,
    auto_respond_to_actions: rule?.auto_respond_to_actions ?? true,
    response_on_confirm: rule?.response_on_confirm || 'Perfecto, te esperamos. ¡Gracias por confirmar!',
    response_on_cancel: rule?.response_on_cancel || 'Entendido, cancelamos tu cita. Cuando quieras, escríbenos para reagendar.',
    is_active: rule?.is_active ?? true
  })

  // Cargar offset desde minutos del rule existente
  useEffect(() => {
    if (rule) {
      const abs = Math.abs(rule.trigger_offset_minutes)
      const isAfter = rule.trigger_offset_minutes < 0
      let unit: 'minutes' | 'hours' | 'days' = 'minutes', val = abs
      if (abs >= 1440 && abs % 1440 === 0) { unit = 'days'; val = abs / 1440 }
      else if (abs >= 60 && abs % 60 === 0) { unit = 'hours'; val = abs / 60 }
      setForm(f => ({ ...f, offset_value: val, offset_unit: unit, is_after: isAfter }))
    }
  }, [rule])

  const offsetMinutes = useMemo(() => {
    const unitMul = form.offset_unit === 'days' ? 1440 : form.offset_unit === 'hours' ? 60 : 1
    const total = form.offset_value * unitMul
    return form.trigger_source === 'appointment' && form.is_after ? -total : total
  }, [form.offset_value, form.offset_unit, form.is_after, form.trigger_source])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Ponle un nombre a la regla')
      if (!form.message_template.trim()) throw new Error('El mensaje no puede estar vacío')

      const payload: any = {
        company_id: companyId,
        agenda_id: form.agenda_id || null,
        name: form.name.trim(),
        description: form.description.trim() || null,
        trigger_source: form.trigger_source,
        trigger_offset_minutes: offsetMinutes,
        applies_to_status: form.trigger_source === 'appointment' ? form.applies_to_status : null,
        message_template: form.message_template.trim(),
        channel: 'whatsapp',
        include_action_buttons: form.include_action_buttons,
        auto_respond_to_actions: form.auto_respond_to_actions,
        response_on_confirm: form.response_on_confirm,
        response_on_cancel: form.response_on_cancel,
        is_active: form.is_active
      }
      if (isEditing) {
        const { error } = await supabase.from('reminder_rules').update(payload).eq('id', rule!.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('reminder_rules').insert([payload])
        if (error) throw error
      }
    },
    onSuccess: () => { toast.success(isEditing ? 'Regla actualizada' : 'Regla creada'); onSaved() },
    onError: (e: any) => toast.error(e.message)
  })

  // Preview con datos de ejemplo
  const preview = useMemo(() => {
    let out = form.message_template
    out = out.replace(/\{nombre\}/g, 'Juan')
    out = out.replace(/\{fecha\}/g, 'lunes, 12 de junio')
    out = out.replace(/\{hora\}/g, '10:00')
    out = out.replace(/\{doctor\}/g, 'Dr. García')
    out = out.replace(/\{ubicacion\}/g, 'Consultorio 3')
    out = out.replace(/\{motivo\}/g, 'Limpieza dental')
    if (form.include_action_buttons) out += '\n\nResponde *CONFIRMO* para confirmar o *CANCELAR* para reagendar.'
    return out
  }, [form.message_template, form.include_action_buttons])

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">{isEditing ? 'Editar regla' : 'Nueva regla'}</h2>
            <p className="text-sm text-slate-500 font-medium mt-0.5">Configura cuándo y qué mensaje se envía automáticamente.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-2 hover:bg-slate-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5 flex-1">
          {/* Nombre */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre de la regla</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Ej. Confirmación 1 día antes"
              className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-blue-500"
            />
          </div>

          {/* Tipo de disparador */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Cuándo se dispara</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {([
                { id: 'appointment', label: 'Basado en cita', desc: 'X tiempo antes/después de una cita', icon: CalendarIcon },
                { id: 'contact_inactivity', label: 'Inactividad', desc: 'X tiempo sin respuesta del paciente', icon: UserX },
                { id: 'specific_datetime', label: 'Fecha específica', desc: 'En una fecha y hora exacta', icon: Clock }
              ] as const).map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setForm({ ...form, trigger_source: opt.id })}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${form.trigger_source === opt.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                >
                  <opt.icon size={16} className={form.trigger_source === opt.id ? 'text-blue-600' : 'text-slate-400'} />
                  <p className="text-xs font-black text-slate-900 mt-1.5">{opt.label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Offset */}
          {form.trigger_source !== 'specific_datetime' && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Disparar</label>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <input
                  type="number"
                  min="1"
                  value={form.offset_value}
                  onChange={e => setForm({ ...form, offset_value: parseInt(e.target.value) || 1 })}
                  className="w-24 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-blue-500"
                />
                <select
                  value={form.offset_unit}
                  onChange={e => setForm({ ...form, offset_unit: e.target.value as any })}
                  className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-blue-500"
                >
                  <option value="minutes">minutos</option>
                  <option value="hours">horas</option>
                  <option value="days">días</option>
                </select>
                {form.trigger_source === 'appointment' ? (
                  <select
                    value={form.is_after ? 'after' : 'before'}
                    onChange={e => setForm({ ...form, is_after: e.target.value === 'after' })}
                    className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-blue-500"
                  >
                    <option value="before">antes de la cita</option>
                    <option value="after">después de la cita</option>
                  </select>
                ) : (
                  <span className="text-sm font-bold text-slate-600">sin respuesta del paciente</span>
                )}
              </div>
            </div>
          )}

          {/* Aplica a agenda */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Aplica a</label>
            <select
              value={form.agenda_id}
              onChange={e => setForm({ ...form, agenda_id: e.target.value })}
              className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-blue-500"
            >
              <option value="">Todas las agendas</option>
              {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          {/* Plantilla */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mensaje (plantilla)</label>
              <span className="text-[10px] text-slate-400 font-medium">
                Variables: <code className="px-1 bg-slate-100 rounded">{`{nombre}`}</code> <code className="px-1 bg-slate-100 rounded">{`{fecha}`}</code> <code className="px-1 bg-slate-100 rounded">{`{hora}`}</code> <code className="px-1 bg-slate-100 rounded">{`{doctor}`}</code> <code className="px-1 bg-slate-100 rounded">{`{ubicacion}`}</code> <code className="px-1 bg-slate-100 rounded">{`{motivo}`}</code>
              </span>
            </div>
            <textarea
              rows={5}
              value={form.message_template}
              onChange={e => setForm({ ...form, message_template: e.target.value })}
              placeholder="Hola {nombre}, te recordamos tu cita mañana a las {hora}..."
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-blue-500 resize-none font-mono"
            />
          </div>

          {/* Preview */}
          {form.message_template && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Vista previa con datos ejemplo</p>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-900 whitespace-pre-wrap leading-relaxed font-medium">
                {preview}
              </div>
            </div>
          )}

          {/* Botones de acción */}
          <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.include_action_buttons}
                onChange={e => setForm({ ...form, include_action_buttons: e.target.checked })}
                className="h-4 w-4 rounded text-purple-600 focus:ring-purple-500"
              />
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-900">Incluir botones "CONFIRMO" / "CANCELAR"</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Permite al paciente confirmar o cancelar su cita respondiendo al mensaje.</p>
              </div>
            </label>

            {form.include_action_buttons && (
              <div className="mt-4 space-y-3 pl-7">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.auto_respond_to_actions}
                    onChange={e => setForm({ ...form, auto_respond_to_actions: e.target.checked })}
                    className="h-4 w-4 mt-0.5 rounded text-purple-600"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-900">Responder automáticamente al paciente</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Si está dentro de la sesión activa de 24h.</p>
                  </div>
                </label>

                {form.auto_respond_to_actions && (
                  <>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Respuesta cuando CONFIRMA</label>
                      <textarea
                        rows={2}
                        value={form.response_on_confirm}
                        onChange={e => setForm({ ...form, response_on_confirm: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 resize-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Respuesta cuando CANCELA</label>
                      <textarea
                        rows={2}
                        value={form.response_on_cancel}
                        onChange={e => setForm({ ...form, response_on_cancel: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 resize-none"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-black rounded-xl disabled:opacity-40 flex items-center gap-2"
          >
            {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isEditing ? 'Guardar cambios' : 'Crear regla'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MODAL: Plantillas sugeridas (importar)
// ============================================================================
function TemplatesModal({
  verticalSlug, companyId, existingRules, onClose, onImported
}: {
  verticalSlug: string
  companyId: string
  existingRules: ReminderRule[]
  onClose: () => void
  onImported: () => void
}) {
  const { data: templates = [] } = useQuery({
    queryKey: ['reminderTemplates', verticalSlug],
    queryFn: async () => {
      const { data } = await supabase.from('reminder_rule_templates').select('*').eq('vertical_slug', verticalSlug).order('display_order')
      return (data || []) as ReminderTemplate[]
    }
  })

  const existingNames = new Set(existingRules.map(r => r.name))

  const importTemplate = useMutation({
    mutationFn: async (t: ReminderTemplate) => {
      const { error } = await supabase.from('reminder_rules').insert([{
        company_id: companyId,
        name: t.name,
        description: t.description,
        trigger_source: t.trigger_source,
        trigger_offset_minutes: t.trigger_offset_minutes,
        applies_to_status: t.applies_to_status,
        applies_to_lifecycle_stage: t.applies_to_lifecycle_stage,
        message_template: t.message_template,
        include_action_buttons: t.include_action_buttons,
        is_active: t.recommended_active,
        vertical_source: t.vertical_slug
      }])
      if (error) throw error
    },
    onSuccess: () => { toast.success('Plantilla importada'); onImported() },
    onError: (e: any) => toast.error(e.message)
  })

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[88vh] overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Plantillas sugeridas</h2>
              <p className="text-xs text-slate-500 font-medium">Curadas para tu vertical: {verticalSlug}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-2 hover:bg-slate-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-3 flex-1">
          {templates.length === 0 && (
            <div className="text-center py-10">
              <p className="text-sm text-slate-500">No hay plantillas para este vertical aún.</p>
            </div>
          )}
          {templates.map(t => {
            const exists = existingNames.has(t.name)
            const Icon = sourceIcon(t.trigger_source)
            return (
              <div key={t.id} className={`bg-white rounded-2xl border-2 p-4 transition-all ${exists ? 'border-slate-100 opacity-60' : 'border-slate-200 hover:border-blue-300'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-slate-900 text-sm">{t.name}</p>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        {formatOffset(t.trigger_offset_minutes, t.trigger_source)}
                        {t.include_action_buttons && ' · con botones'}
                      </p>
                      <p className="text-xs text-slate-600 mt-2 line-clamp-2 leading-relaxed">{t.message_template}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => importTemplate.mutate(t)}
                    disabled={exists || importTemplate.isPending}
                    className={`shrink-0 px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${exists ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                  >
                    {exists ? <><CheckCircle2 size={12} /> Ya creada</> : <><Copy size={12} /> Importar</>}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
