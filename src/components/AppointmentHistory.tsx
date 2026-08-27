 

'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { CalendarPlus, CalendarClock, Trash2, CheckCircle2, AlertCircle, Loader2, History } from 'lucide-react'

type HistoryEvent = {
  id: string
  appointment_id: string
  action: 'created' | 'rescheduled' | 'cancelled' | 'completed' | 'no_show'
  old_date: string | null
  old_time: string | null
  new_date: string | null
  new_time: string | null
  old_status: string | null
  new_status: string | null
  reason: string | null
  actor: 'ai' | 'human' | 'system'
  created_at: string
}

const ACTION_CONFIG = {
  created:     { icon: CalendarPlus,  label: 'Cita creada',       color: 'emerald', verb: 'Agendada' },
  rescheduled: { icon: CalendarClock, label: 'Cita reagendada',   color: 'amber',   verb: 'Movida' },
  cancelled:   { icon: Trash2,        label: 'Cita cancelada',    color: 'rose',    verb: 'Cancelada' },
  completed:   { icon: CheckCircle2,  label: 'Cita completada',   color: 'blue',    verb: 'Completada' },
  no_show:     { icon: AlertCircle,   label: 'No asistió',         color: 'orange',  verb: 'No-show' }
} as const

const COLOR_CLASSES = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100', iconBg: 'bg-emerald-100' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-100',   iconBg: 'bg-amber-100' },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-100',    iconBg: 'bg-rose-100' },
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-100',    iconBg: 'bg-blue-100' },
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-100',  iconBg: 'bg-orange-100' }
}

const formatDate = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

const formatTime = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

const formatDateOnly = (d: string | null) => {
  if (!d) return ''
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

const formatTimeOnly = (t: string | null) => {
  if (!t) return ''
  return t.substring(0, 5) // HH:MM
}

export default function AppointmentHistory({ patientId }: { patientId: string }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['appointmentHistory', patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const { data } = await supabase
        .from('appointment_history')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(50)
      return (data as HistoryEvent[]) || []
    }
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="animate-spin text-slate-400" size={20} />
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-12 bg-white border border-slate-200 rounded-2xl border-dashed">
        <History className="mx-auto text-slate-300 mb-3" size={32} />
        <p className="text-slate-500 font-medium">Sin movimientos de citas registrados aún.</p>
        <p className="text-xs text-slate-400 mt-1.5">El historial se irá llenando solo conforme agendes, reagendes o canceles.</p>
      </div>
    )
  }

  // Agrupar por appointment_id para mostrar la historia de cada cita
  const byAppointment = new Map<string, HistoryEvent[]>()
  for (const ev of events) {
    if (!byAppointment.has(ev.appointment_id)) byAppointment.set(ev.appointment_id, [])
    byAppointment.get(ev.appointment_id)!.push(ev)
  }

  return (
    <div className="space-y-6">
      {Array.from(byAppointment.entries()).map(([apptId, evs]) => {
        // El más reciente determina el estado actual
        const latest = evs[0]
        const oldest = evs[evs.length - 1]
        const latestCfg = ACTION_CONFIG[latest.action]
        const latestColor = COLOR_CLASSES[latestCfg.color]

        return (
          <div key={apptId} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            
            {/* Header de la cita: estado actual */}
            <div className={`px-5 py-3 border-b border-slate-100 ${latestColor.bg} flex items-center justify-between gap-3`}>
              <div className={`flex items-center gap-2 ${latestColor.text}`}>
                <latestCfg.icon size={16} />
                <span className="text-sm font-black">{latestCfg.label}</span>
              </div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                {formatDate(latest.created_at)}
              </span>
            </div>

            {/* Timeline de eventos para esta cita */}
            <div className="p-5 space-y-3">
              {evs.map((ev, idx) => {
                const cfg = ACTION_CONFIG[ev.action]
                const color = COLOR_CLASSES[cfg.color]
                const isFirst = idx === evs.length - 1
                
                return (
                  <div key={ev.id} className="flex gap-3 items-start relative">
                    {/* Línea vertical conectando eventos */}
                    {!isFirst && (
                      <div className="absolute left-[15px] top-8 -bottom-2 w-px bg-slate-200" aria-hidden></div>
                    )}
                    {/* Icono */}
                    <div className={`h-8 w-8 rounded-full ${color.iconBg} ${color.text} flex items-center justify-center shrink-0 z-10`}>
                      <cfg.icon size={14} />
                    </div>
                    {/* Contenido */}
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-baseline justify-between gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900">{cfg.verb}</span>
                        <span className="text-[11px] text-slate-400 font-medium">{formatDate(ev.created_at)} · {formatTime(ev.created_at)}</span>
                      </div>
                      
                      {/* Detalles según acción */}
                      {ev.action === 'created' && ev.new_date && (
                        <p className="text-xs text-slate-500 mt-0.5 font-medium">
                          Para <span className="font-bold text-slate-700">{formatDateOnly(ev.new_date)}</span> a las <span className="font-bold text-slate-700">{formatTimeOnly(ev.new_time)}</span>
                        </p>
                      )}
                      {ev.action === 'rescheduled' && (
                        <p className="text-xs text-slate-500 mt-0.5 font-medium">
                          De <span className="text-rose-600 line-through">{formatDateOnly(ev.old_date)} {formatTimeOnly(ev.old_time)}</span>
                          {' → '}
                          <span className="font-bold text-amber-700">{formatDateOnly(ev.new_date)} {formatTimeOnly(ev.new_time)}</span>
                        </p>
                      )}
                      {ev.action === 'cancelled' && ev.reason && (
                        <p className="text-xs text-slate-500 mt-0.5 italic">"{ev.reason}"</p>
                      )}
                      {ev.actor && ev.actor !== 'system' && (
                        <span className="inline-block mt-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {ev.actor === 'ai' ? 'Por IA' : 'Por humano'}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
