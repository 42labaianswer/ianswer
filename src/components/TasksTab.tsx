 

'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  CheckSquare, Plus, Loader2, AlertCircle, Calendar as CalendarIcon,
  Edit2, Trash2, Clock, CheckCircle2, Square, X, Save
} from 'lucide-react'
import { useConfirm } from '../hooks/useConfirm'

// ============================================================================
// TasksTab — embebido en el modal de /contacts
// Solo muestra tareas ancladas a este contacto.
// ============================================================================

type Task = {
  id: string
  title: string
  description: string | null
  due_at: string | null
  completed_at: string | null
  contact_id: string | null
  assigned_to: string | null
  priority: 'low' | 'normal' | 'high'
  assigned_name?: string
  bucket: string
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

export default function TasksTab({ contactId, companyId, userId }: { contactId: string, companyId: string, userId: string }) {
  const { confirm, ConfirmDialog } = useConfirm()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['contactTasks', contactId],
    queryFn: async () => {
      const { data } = await supabase
        .from('v_tasks_enriched')
        .select('*')
        .eq('contact_id', contactId)
        .order('completed_at', { ascending: true, nullsFirst: true })
        .order('due_at', { ascending: true, nullsFirst: false })
      return (data || []) as Task[]
    }
  })

  const toggleCompleteMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string, completed: boolean }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ completed_at: completed ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contactTasks', contactId] })
  })

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Tarea eliminada')
      queryClient.invalidateQueries({ queryKey: ['contactTasks', contactId] })
      queryClient.invalidateQueries({ queryKey: ['tasksEnriched'] })
    }
  })

  const pending = tasks.filter(t => !t.completed_at)
  const completed = tasks.filter(t => t.completed_at)

  return (
    <div className="space-y-4">
      {/* Header de la pestaña */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <CheckSquare size={14} className="text-slate-400" /> Tareas de este contacto
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            {pending.length} pendiente{pending.length !== 1 ? 's' : ''} · {completed.length} completada{completed.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-black bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-sm"
        >
          <Plus size={12} /> Nueva tarea
        </button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
      ) : tasks.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
          <CheckSquare size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-700 mb-1">Sin tareas para este contacto</p>
          <p className="text-xs text-slate-500 mb-4">Crea una para recordar llamarle, pedirle un dato o cualquier seguimiento.</p>
          <button onClick={() => setCreating(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-lg inline-flex items-center gap-1.5">
            <Plus size={12} /> Crear tarea
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Pendientes */}
          {pending.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {pending.map(t => (
                <TaskItem
                  key={t.id}
                  task={t}
                  onToggle={() => toggleCompleteMutation.mutate({ id: t.id, completed: !t.completed_at })}
                  onEdit={() => setEditing(t)}
                  onDelete={async () => { if (await confirm('¿Eliminar tarea?', { title: 'Eliminar tarea', danger: true, confirmText: 'Eliminar' })) deleteTaskMutation.mutate(t.id) }}
                />
              ))}
            </div>
          )}

          {/* Completadas */}
          {completed.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mt-4 mb-2 px-1">Completadas</p>
              <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {completed.map(t => (
                  <TaskItem
                    key={t.id}
                    task={t}
                    onToggle={() => toggleCompleteMutation.mutate({ id: t.id, completed: !t.completed_at })}
                    onEdit={() => setEditing(t)}
                    onDelete={async () => { if (await confirm('¿Eliminar tarea?', { title: 'Eliminar tarea', danger: true, confirmText: 'Eliminar' })) deleteTaskMutation.mutate(t.id) }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal crear/editar */}
      {(creating || editing) && (
        <QuickTaskModal
          task={editing}
          contactId={contactId}
          companyId={companyId}
          userId={userId}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['contactTasks', contactId] })
            queryClient.invalidateQueries({ queryKey: ['tasksEnriched'] })
            setCreating(false); setEditing(null)
          }}
        />
      )}
      {ConfirmDialog}
    </div>
  )
}

function TaskItem({ task, onToggle, onEdit, onDelete }: any) {
  const completed = !!task.completed_at
  const overdue = isOverdue(task.due_at, task.completed_at)

  return (
    <div className={`group px-4 py-3 hover:bg-slate-50/50 transition-colors ${completed ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <button onClick={onToggle} className="mt-0.5 shrink-0">
          {completed ? (
            <CheckCircle2 size={18} className="text-emerald-600" />
          ) : (
            <Square size={18} className="text-slate-300 hover:text-blue-500 transition-colors" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-bold ${completed ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                {task.title}
              </p>
              {task.description && (
                <p className={`text-xs mt-0.5 ${completed ? 'text-slate-400' : 'text-slate-600'}`}>
                  {task.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[11px] font-medium">
                {task.due_at && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${overdue ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                    <Clock size={10} />
                    {formatDueLabel(task.due_at)}
                  </span>
                )}
                {task.priority === 'high' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 font-bold">Alta</span>
                )}
                {task.assigned_name && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700">{task.assigned_name}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={onEdit} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                <Edit2 size={12} />
              </button>
              <button onClick={onDelete} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function QuickTaskModal({
  task, contactId, companyId, userId, onClose, onSaved
}: {
  task: Task | null
  contactId: string
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
    priority: task?.priority || 'normal'
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error('La tarea necesita un título')
      const payload: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
        priority: form.priority
      }
      if (isEditing) {
        const { error } = await supabase.from('tasks').update(payload).eq('id', task!.id)
        if (error) throw error
      } else {
        payload.company_id = companyId
        payload.contact_id = contactId
        payload.created_by = userId
        const { error } = await supabase.from('tasks').insert([payload])
        if (error) throw error
      }
    },
    onSuccess: () => { toast.success(isEditing ? 'Tarea actualizada' : 'Tarea creada'); onSaved() },
    onError: (e: any) => toast.error(e.message)
  })

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-black text-slate-900 text-base">{isEditing ? 'Editar tarea' : 'Nueva tarea para este contacto'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-2 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Título *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              autoFocus
              placeholder="Llamar para confirmar pago..."
              className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Descripción</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-blue-500 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vencimiento</label>
              <input
                type="datetime-local"
                value={form.due_at}
                onChange={e => setForm({ ...form, due_at: e.target.value })}
                className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:bg-white focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Prioridad</label>
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
        </div>
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !form.title.trim()}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-black rounded-xl disabled:opacity-40 flex items-center gap-2"
          >
            {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isEditing ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}
