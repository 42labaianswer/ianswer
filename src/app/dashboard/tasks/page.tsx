 

'use client'

import { useState, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useWorkspace } from '../../../components/WorkspaceContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  CheckSquare, Plus, X, Save, Loader2, AlertCircle, Calendar as CalendarIcon,
  User, MessageSquare, Edit2, Trash2, Clock, CheckCircle2, Square, Phone,
  ChevronRight, ListChecks
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { usePlanFeatures } from '../../../hooks/usePlanFeatures'

// ============================================================================
// TYPES
// ============================================================================
type Task = {
  id: string
  company_id: string
  title: string
  description: string | null
  due_at: string | null
  completed_at: string | null
  contact_id: string | null
  assigned_to: string | null
  created_by: string | null
  priority: 'low' | 'normal' | 'high'
  created_at: string
  updated_at: string
  contact_name?: string
  contact_phone?: string
  assigned_name?: string
  bucket: 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'pending' | 'completed'
}

type Contact = { id: string, name: string, phone: string }
type TeamMember = { id: string, name: string }

const bucketLabels: Record<string, { label: string, color: string, icon: any, order: number }> = {
  overdue:   { label: 'Vencidas',          color: 'text-rose-700',     icon: AlertCircle, order: 1 },
  today:     { label: 'Para hoy',          color: 'text-blue-700',     icon: Clock,       order: 2 },
  tomorrow:  { label: 'Mañana',            color: 'text-purple-700',   icon: CalendarIcon, order: 3 },
  upcoming:  { label: 'Próximas',          color: 'text-slate-700',    icon: CalendarIcon, order: 4 },
  pending:   { label: 'Sin fecha',         color: 'text-slate-500',    icon: ListChecks,  order: 5 },
  completed: { label: 'Completadas',       color: 'text-emerald-700',  icon: CheckCircle2, order: 6 }
}

const formatDueLabel = (due?: string | null): string => {
  if (!due) return 'Sin fecha'
  const d = new Date(due)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const dueDay = new Date(d); dueDay.setHours(0, 0, 0, 0)

  const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  if (dueDay.getTime() === today.getTime()) return `Hoy ${time}`
  if (dueDay.getTime() === tomorrow.getTime()) return `Mañana ${time}`
  return `${d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} ${time}`
}

const isOverdue = (due?: string | null, completed?: string | null): boolean => {
  if (!due || completed) return false
  return new Date(due) < new Date()
}

// ============================================================================
// PAGE
// ============================================================================
export default function TasksPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { labels } = useWorkspace()
  const { data: features, isLoading: isLoadingFeatures } = usePlanFeatures()
  const [showCompleted, setShowCompleted] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [creatingTask, setCreatingTask] = useState(false)

  // Profile
  const { data: profile } = useQuery({
    queryKey: ['currentUserProfile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      const { data } = await supabase.from('profiles').select('company_id, id').eq('id', user.id).single()
      return data
    }
  })
  const companyId = profile?.company_id
  const userId = profile?.id

  // Tasks
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasksEnriched', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from('v_tasks_enriched')
        .select('*')
        .eq('company_id', companyId)
        .order('due_at', { ascending: true, nullsFirst: false })
      return (data || []) as Task[]
    }
  })

  // Contactos y team (para selects del modal)
  const { data: contacts = [] } = useQuery({
    queryKey: ['contactsForTasks', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('id, name, phone').eq('company_id', companyId).order('name')
      return (data || []) as Contact[]
    }
  })

  const { data: team = [] } = useQuery({
    queryKey: ['teamForTasks', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase.from('team').select('id, name:full_name').eq('company_id', companyId)
      return (data || []) as TeamMember[]
    }
  })

  // Mutations
  const toggleCompleteMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string, completed: boolean }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ completed_at: completed ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasksEnriched'] })
  })

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Tarea eliminada')
      queryClient.invalidateQueries({ queryKey: ['tasksEnriched'] })
    }
  })

  const snoozeMutation = useMutation({
    mutationFn: async ({ id, hours }: { id: string, hours: number }) => {
      const newDue = new Date()
      newDue.setHours(newDue.getHours() + hours)
      const { error } = await supabase.from('tasks').update({ due_at: newDue.toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Tarea pospuesta')
      queryClient.invalidateQueries({ queryKey: ['tasksEnriched'] })
    }
  })

  // Filtrar y agrupar
  const visibleTasks = useMemo(() => {
    if (showCompleted) return tasks
    return tasks.filter(t => t.bucket !== 'completed')
  }, [tasks, showCompleted])

  const buckets = useMemo(() => {
    const groups: Record<string, Task[]> = {}
    visibleTasks.forEach(t => {
      if (!groups[t.bucket]) groups[t.bucket] = []
      groups[t.bucket].push(t)
    })
    return Object.entries(groups).sort(([a], [b]) => (bucketLabels[a]?.order || 99) - (bucketLabels[b]?.order || 99))
  }, [visibleTasks])

  const counts = useMemo(() => ({
    overdue: tasks.filter(t => t.bucket === 'overdue').length,
    today: tasks.filter(t => t.bucket === 'today').length,
    total_pending: tasks.filter(t => t.bucket !== 'completed').length
  }), [tasks])

  // v2.3: Guard de feature gating — si no tiene la feature, no entra
  if (isLoadingFeatures) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    )
  }
  if (!features?.crm_tasks) {
    return (
      <div className="max-w-2xl mx-auto py-20">
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 text-white flex items-center justify-center shadow-lg mb-5">
            <CheckSquare size={28} />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">Tareas no disponibles en tu plan</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
            El sistema de tareas internas te permite organizar pendientes, llamadas y seguimientos por contacto y por miembro del equipo.
            Es parte de los planes superiores.
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
          onClick={() => setShowCompleted(s => !s)}
          className={`px-4 py-2.5 rounded-xl text-sm font-bold border flex items-center gap-2 transition-all ${showCompleted ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
        >
          <CheckCircle2 size={14} /> {showCompleted ? 'Ocultar completadas' : 'Mostrar completadas'}
        </button>
        <button
          onClick={() => setCreatingTask(true)}
          className="px-5 py-2.5 rounded-xl text-sm font-black bg-slate-900 hover:bg-slate-800 text-white shadow-md flex items-center gap-2"
        >
          <Plus size={16} /> Nueva tarea
        </button>
      </div>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`rounded-2xl p-4 border-2 ${counts.overdue > 0 ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-3">
            <AlertCircle size={20} className={counts.overdue > 0 ? 'text-rose-600' : 'text-slate-300'} />
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vencidas</p>
              <p className="text-2xl font-black text-slate-900 leading-tight">{counts.overdue}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border-2 border-blue-200">
          <div className="flex items-center gap-3">
            <Clock size={20} className="text-blue-600" />
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Para hoy</p>
              <p className="text-2xl font-black text-slate-900 leading-tight">{counts.today}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border-2 border-slate-200">
          <div className="flex items-center gap-3">
            <ListChecks size={20} className="text-slate-400" />
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pendientes</p>
              <p className="text-2xl font-black text-slate-900 leading-tight">{counts.total_pending}</p>
            </div>
          </div>
        </div>
      </div>

      {/* LISTA */}
      {isLoading ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-20 flex justify-center">
          <Loader2 className="animate-spin text-slate-400" />
        </div>
      ) : buckets.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-16 text-center">
          <CheckSquare size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-xl font-black text-slate-700 mb-2">Sin tareas pendientes</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            Cuando agregues tu primera tarea aparecerá aquí. Las puedes anclar a un contacto o asignarlas a alguien del equipo.
          </p>
          <button onClick={() => setCreatingTask(true)} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-black rounded-xl shadow-md inline-flex items-center gap-2">
            <Plus size={16} /> Crear mi primera tarea
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {buckets.map(([bucket, items]) => {
            const cfg = bucketLabels[bucket]
            const BIcon = cfg.icon
            return (
              <div key={bucket}>
                <div className="flex items-center gap-2 mb-3">
                  <BIcon size={16} className={cfg.color} />
                  <h3 className={`text-sm font-black uppercase tracking-wider ${cfg.color}`}>{cfg.label}</h3>
                  <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">{items.length}</span>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                  {items.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onToggleComplete={() => toggleCompleteMutation.mutate({ id: task.id, completed: !task.completed_at })}
                      onEdit={() => setEditingTask(task)}
                      onDelete={() => {
                        if (confirm('¿Eliminar esta tarea?')) deleteTaskMutation.mutate(task.id)
                      }}
                      onSnooze={(hours: number) => snoozeMutation.mutate({ id: task.id, hours })}
                      onOpenContact={() => task.contact_id && router.push(`/dashboard/inbox?contactId=${task.contact_id}`)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL CREAR/EDITAR */}
      {(editingTask || creatingTask) && companyId && userId && (
        <TaskModal
          task={editingTask}
          contacts={contacts}
          team={team}
          companyId={companyId}
          userId={userId}
          onClose={() => { setEditingTask(null); setCreatingTask(false) }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['tasksEnriched'] })
            setEditingTask(null); setCreatingTask(false)
          }}
        />
      )}
    </div>
  )
}

// ============================================================================
// TASK ROW
// ============================================================================
function TaskRow({ task, onToggleComplete, onEdit, onDelete, onSnooze, onOpenContact }: any) {
  const completed = !!task.completed_at
  const overdue = isOverdue(task.due_at, task.completed_at)
  const [snoozeOpen, setSnoozeOpen] = useState(false)

  return (
    <div className={`group px-4 py-3 hover:bg-slate-50/50 transition-colors ${completed ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button onClick={onToggleComplete} className="mt-0.5 shrink-0">
          {completed ? (
            <CheckCircle2 size={20} className="text-emerald-600" />
          ) : (
            <Square size={20} className="text-slate-300 hover:text-blue-500 transition-colors" />
          )}
        </button>

        {/* Contenido */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-bold ${completed ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                {task.title}
              </p>
              {task.description && (
                <p className={`text-xs mt-1 ${completed ? 'text-slate-400' : 'text-slate-600'}`}>
                  {task.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] font-medium">
                {task.due_at && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${overdue ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                    <Clock size={10} />
                    {formatDueLabel(task.due_at)}
                  </span>
                )}
                {task.priority === 'high' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 font-bold">
                    Alta
                  </span>
                )}
                {task.contact_name && (
                  <button onClick={onOpenContact} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">
                    <User size={10} /> {task.contact_name}
                  </button>
                )}
                {task.assigned_name && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700">
                    <User size={10} /> {task.assigned_name}
                  </span>
                )}
              </div>
            </div>

            {/* Acciones */}
            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity relative">
              {!completed && task.due_at && (
                <div className="relative">
                  <button
                    onClick={() => setSnoozeOpen(o => !o)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Posponer"
                  >
                    <Clock size={13} />
                  </button>
                  {snoozeOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden min-w-[120px] z-20">
                      {[
                        { h: 1, label: '+1 hora' },
                        { h: 4, label: '+4 horas' },
                        { h: 24, label: 'Mañana' },
                        { h: 168, label: 'En 1 semana' }
                      ].map(opt => (
                        <button
                          key={opt.h}
                          onClick={() => { onSnooze(opt.h); setSnoozeOpen(false) }}
                          className="w-full px-3 py-2 text-xs font-bold text-left hover:bg-slate-50"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button onClick={onEdit} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Editar">
                <Edit2 size={13} />
              </button>
              <button onClick={onDelete} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" title="Eliminar">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MODAL crear/editar tarea
// ============================================================================
function TaskModal({
  task, contacts, team, companyId, userId, onClose, onSaved
}: {
  task: Task | null
  contacts: Contact[]
  team: TeamMember[]
  companyId: string
  userId: string
  onClose: () => void
  onSaved: () => void
}) {
  const isEditing = !!task
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    due_at: task?.due_at ? new Date(task.due_at).toISOString().slice(0, 16) : '',
    contact_id: task?.contact_id || '',
    assigned_to: task?.assigned_to || '',
    priority: task?.priority || 'normal'
  })
  const [contactSearch, setContactSearch] = useState('')

  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contacts.slice(0, 50)
    const s = contactSearch.trim().toLowerCase()
    return contacts.filter(c =>
      c.name?.toLowerCase().includes(s) || c.phone?.includes(s)
    ).slice(0, 50)
  }, [contactSearch, contacts])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error('La tarea necesita un título')
      const payload: any = {
        company_id: companyId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
        contact_id: form.contact_id || null,
        assigned_to: form.assigned_to || null,
        priority: form.priority
      }
      if (isEditing) {
        const { error } = await supabase.from('tasks').update(payload).eq('id', task!.id)
        if (error) throw error
      } else {
        payload.created_by = userId
        const { error } = await supabase.from('tasks').insert([payload])
        if (error) throw error
      }
    },
    onSuccess: () => { toast.success(isEditing ? 'Tarea actualizada' : 'Tarea creada'); onSaved() },
    onError: (e: any) => toast.error(e.message)
  })

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900">{isEditing ? 'Editar tarea' : 'Nueva tarea'}</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Pendiente interno del equipo.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-2 hover:bg-slate-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Título *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="Ej. Llamar a Juan para confirmar pago"
              autoFocus
              className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Descripción (opcional)</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Detalle adicional, contexto, lo que sea útil..."
              className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-blue-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Vencimiento</label>
              <input
                type="datetime-local"
                value={form.due_at}
                onChange={e => setForm({ ...form, due_at: e.target.value })}
                className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:bg-white focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Prioridad</label>
              <select
                value={form.priority}
                onChange={e => setForm({ ...form, priority: e.target.value as any })}
                className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:bg-white focus:border-blue-500"
              >
                <option value="low">Baja</option>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Anclar a contacto (opcional)</label>
            <input
              type="text"
              placeholder="Buscar..."
              value={contactSearch}
              onChange={e => setContactSearch(e.target.value)}
              className="w-full mt-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-blue-500"
            />
            <select
              value={form.contact_id}
              onChange={e => setForm({ ...form, contact_id: e.target.value })}
              className="w-full mt-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:bg-white focus:border-blue-500"
            >
              <option value="">Ninguno</option>
              {filteredContacts.map(c => (
                <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Asignar a (opcional)</label>
            <select
              value={form.assigned_to}
              onChange={e => setForm({ ...form, assigned_to: e.target.value })}
              className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:bg-white focus:border-blue-500"
            >
              <option value="">Sin asignar</option>
              {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !form.title.trim()}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-black rounded-xl disabled:opacity-40 flex items-center gap-2"
          >
            {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isEditing ? 'Guardar' : 'Crear tarea'}
          </button>
        </div>
      </div>
    </div>
  )
}
