 

'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useQuery } from '@tanstack/react-query'
import {
  MessageSquare, Calendar, Bell, CheckCircle2, XCircle, ArrowRight, RotateCcw,
  Loader2, Sparkles, User, Bot, UserCog, Filter, Clock
} from 'lucide-react'

// ============================================================================
// UnifiedActivityTimeline (v2.1)
// Mezcla citas, mensajes y recordatorios en un timeline cronológico único.
// ============================================================================

type TimelineKind = 'appointment' | 'message' | 'reminder' | 'stage_change'

type TimelineItem = {
  id: string
  kind: TimelineKind
  timestamp: string
  title: string
  description?: string
  meta?: string
  status?: string
  sender?: 'patient' | 'asistente' | 'admin'
  icon: any
  color: string    // tailwind color name
}

export default function UnifiedActivityTimeline({ patientId }: { patientId: string }) {
  const [kindFilter, setKindFilter] = useState<'all' | TimelineKind>('all')

  // 1. Citas (incluye historial completo)
  const { data: appointments = [], isLoading: l1 } = useQuery({
    queryKey: ['unifiedTL_appts', patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from('appointments')
        .select('id, appointment_date, appointment_time, status, notes, duration_minutes, created_at, cancelled_at, cancelled_reason, rescheduled_count')
        .eq('patient_id', patientId)
        .order('appointment_date', { ascending: false })
        .limit(50)
      return data || []
    }
  })

  // 2. Historial de cambios sobre las citas (appointment_history)
  const { data: apptHistory = [] } = useQuery({
    queryKey: ['unifiedTL_apptHistory', patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from('appointment_history')
        .select('id, appointment_id, action, snapshot, created_at, actor')
        .in('appointment_id', appointments.map((a: any) => a.id))
        .order('created_at', { ascending: false })
        .limit(100)
      return data || []
    },
    enabled: appointments.length > 0
  })

  // 3. Mensajes (últimos 100)
  const { data: messages = [], isLoading: l2 } = useQuery({
    queryKey: ['unifiedTL_msgs', patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from('messages')
        .select('id, content, sender, created_at')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(100)
      return data || []
    }
  })

  // 4. Recordatorios enviados o respondidos
  const { data: reminders = [], isLoading: l3 } = useQuery({
    queryKey: ['unifiedTL_reminders', patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from('reminder_queue')
        .select('id, status, scheduled_at, sent_at, patient_response, patient_responded_at, patient_response_message, rendered_content, reminder_rules(name)')
        .eq('contact_id', patientId)
        .in('status', ['sent', 'failed'])
        .order('scheduled_at', { ascending: false })
        .limit(30)
      return data || []
    }
  })

  const isLoading = l1 || l2 || l3

  // Construir items del timeline
  const items: TimelineItem[] = []

  // -- Citas --
  appointments.forEach((a: any) => {
    const date = new Date(`${a.appointment_date}T${a.appointment_time}`)
    const isCancelled = a.status === 'cancelled'
    const isCompleted = a.status === 'completed'
    const isNoShow = a.status === 'no_show'
    items.push({
      id: 'appt-' + a.id,
      kind: 'appointment',
      timestamp: a.created_at,
      title: isCancelled
        ? 'Cita cancelada'
        : isCompleted
        ? 'Cita completada'
        : isNoShow
        ? 'No se presentó'
        : 'Cita agendada',
      description: `${date.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'short' })} · ${a.appointment_time.slice(0, 5)}${a.duration_minutes ? ` · ${a.duration_minutes} min` : ''}`,
      meta: a.notes?.replace(/^Motivo:\s*/i, ''),
      status: a.status,
      icon: isCancelled ? XCircle : isCompleted ? CheckCircle2 : Calendar,
      color: isCancelled ? 'rose' : isCompleted ? 'emerald' : isNoShow ? 'amber' : 'blue'
    })
  })

  // -- Cambios de cita (reagendamiento) --
  apptHistory.forEach((h: any) => {
    if (h.action === 'rescheduled') {
      const snap = h.snapshot || {}
      items.push({
        id: 'hist-' + h.id,
        kind: 'appointment',
        timestamp: h.created_at,
        title: 'Cita reagendada',
        description: snap.from_date && snap.to_date
          ? `${snap.from_date} ${snap.from_time?.slice(0,5)} → ${snap.to_date} ${snap.to_time?.slice(0,5)}`
          : 'Cambio de fecha/hora',
        meta: h.actor ? `Por: ${h.actor}` : undefined,
        icon: RotateCcw,
        color: 'amber'
      })
    }
  })

  // -- Mensajes (agrupados solo los más relevantes — sin saturar) --
  messages.forEach((m: any) => {
    let icon, color, title
    if (m.sender === 'patient') {
      icon = User; color = 'slate'; title = 'Paciente'
    } else if (m.sender === 'asistente') {
      icon = Bot; color = 'blue'; title = 'Asistente IA'
    } else if (m.sender === 'admin') {
      icon = UserCog; color = 'purple'; title = 'Operador'
    } else {
      icon = MessageSquare; color = 'slate'; title = 'Mensaje'
    }
    const preview = (m.content || '').slice(0, 140)
    items.push({
      id: 'msg-' + m.id,
      kind: 'message',
      timestamp: m.created_at,
      title,
      description: preview + (m.content?.length > 140 ? '…' : ''),
      sender: m.sender,
      icon,
      color
    })
  })

  // -- Recordatorios --
  reminders.forEach((r: any) => {
    const responded = r.patient_response
    items.push({
      id: 'rem-' + r.id,
      kind: 'reminder',
      timestamp: r.sent_at || r.scheduled_at,
      title: r.reminder_rules?.name || 'Recordatorio enviado',
      description: (r.rendered_content || '').slice(0, 120) + ((r.rendered_content?.length || 0) > 120 ? '…' : ''),
      meta: responded === 'confirmed' ? '✓ Paciente confirmó' : responded === 'cancelled' ? '✗ Paciente canceló' : r.status === 'failed' ? '⚠ Falló envío' : undefined,
      icon: Bell,
      color: responded === 'confirmed' ? 'emerald' : responded === 'cancelled' ? 'rose' : r.status === 'failed' ? 'rose' : 'purple'
    })
  })

  // Ordenar cronológicamente (más reciente primero)
  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // Filtrar por kind
  const filtered = kindFilter === 'all' ? items : items.filter(i => i.kind === kindFilter)

  // Agrupar por fecha
  const grouped: Record<string, TimelineItem[]> = {}
  filtered.forEach(item => {
    const d = new Date(item.timestamp)
    const key = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(item)
  })

  const counts = {
    all: items.length,
    appointment: items.filter(i => i.kind === 'appointment').length,
    message: items.filter(i => i.kind === 'message').length,
    reminder: items.filter(i => i.kind === 'reminder').length
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-slate-400" /></div>
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-slate-200">
        <Sparkles size={36} className="mx-auto text-slate-300 mb-3" />
        <p className="text-sm font-bold text-slate-600">Sin actividad registrada</p>
        <p className="text-xs text-slate-400 mt-1">Cuando empieces a interactuar con este contacto, todo aparecerá aquí.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'all',         label: 'Todo',         count: counts.all },
          { id: 'appointment', label: 'Citas',        count: counts.appointment },
          { id: 'message',     label: 'Mensajes',     count: counts.message },
          { id: 'reminder',    label: 'Recordatorios', count: counts.reminder }
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setKindFilter(f.id as any)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${kindFilter === f.id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {f.label} <span className={`px-1.5 py-0.5 rounded text-[10px] ${kindFilter === f.id ? 'bg-white/20' : 'bg-slate-100'}`}>{f.count}</span>
          </button>
        ))}
      </div>

      {/* Timeline agrupado */}
      <div className="space-y-6">
        {Object.entries(grouped).map(([date, dayItems]) => (
          <div key={date}>
            <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm py-2 mb-3 -mx-2 px-2">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{date}</p>
            </div>
            <div className="space-y-2 relative pl-7 border-l-2 border-slate-100 ml-3">
              {dayItems.map((item, idx) => (
                <TimelineCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TimelineCard({ item }: { item: TimelineItem }) {
  const colorMap: any = {
    slate:   { bg: 'bg-slate-50',   text: 'text-slate-600',   ring: 'ring-slate-200' },
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-600',    ring: 'ring-blue-200' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-200' },
    rose:    { bg: 'bg-rose-50',    text: 'text-rose-600',    ring: 'ring-rose-200' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-600',   ring: 'ring-amber-200' },
    purple:  { bg: 'bg-purple-50',  text: 'text-purple-600',  ring: 'ring-purple-200' }
  }
  const c = colorMap[item.color] || colorMap.slate
  const time = new Date(item.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  const Icon = item.icon

  return (
    <div className="relative">
      {/* Dot del timeline */}
      <div className={`absolute -left-[34px] top-2 h-7 w-7 rounded-full ring-4 ring-white ${c.bg} ${c.text} flex items-center justify-center`}>
        <Icon size={13} />
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-3 hover:border-slate-300 transition-colors">
        <div className="flex items-center justify-between mb-1 gap-2">
          <p className={`text-xs font-black ${c.text}`}>{item.title}</p>
          <span className="text-[10px] font-bold text-slate-400 tabular-nums shrink-0">{time}</span>
        </div>
        {item.description && (
          <p className="text-xs text-slate-700 font-medium leading-relaxed">{item.description}</p>
        )}
        {item.meta && (
          <p className="text-[10px] text-slate-500 font-medium mt-1.5">{item.meta}</p>
        )}
      </div>
    </div>
  )
}
