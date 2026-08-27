// src/app/dashboard/calendar/page.tsx
'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import {
  Calendar as CalendarIcon, CheckCircle2, ChevronLeft, ChevronRight, ChevronDown, Clock,
  RefreshCw, ArrowLeft, Lock, Unlock, CalendarSync, LayoutGrid, Coffee, User,
  CalendarPlus, Trash2, CalendarClock, MessageSquare, List, Bell,
  Sparkles, TrendingUp, Zap, ChevronsRight, Eye, EyeOff, ExternalLink, Info
} from 'lucide-react'
import BookingModal from '../../../components/BookingModal'
import CancelDialog from '../../../components/CancelDialog'
import PageHeader from '../../../components/PageHeader'
import { usePlanFeatures } from '../../../hooks/usePlanFeatures'

type Agenda = {
  id: string
  name: string
  google_calendar_id: string
}

type CalendarEvent = {
  id: string
  date: string
  time: string
  rawTime: string
  startMins: number
  endMins: number
  title: string
  status: string
  motivo: string
  appointmentId?: string
  patientId?: string
  patientPhone?: string
  duration?: number
  source?: 'google_only' | 'supabase' | 'both'
}

type WorkingHour = {
  day_of_week: number; start_time: string; end_time: string; has_break: boolean; break_start_time: string; break_end_time: string; slot_duration: number; is_active: boolean; agenda_id?: string
}

type DisabledSlot = { date: string; time: string }

export default function CalendarPage() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { data: features } = usePlanFeatures()

  const [companyId, setCompanyId] = useState('')
  const [agendas, setAgendas] = useState<Agenda[]>([])
  const [selectedAgendaId, setSelectedAgendaId] = useState<string>('')
  
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [syncSuccess, setSyncSuccess] = useState(false)
  
  const [workingHours, setWorkingHours] = useState<WorkingHour[]>([])
  const [disabledSlots, setDisabledSlots] = useState<DisabledSlot[]>([])
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  const [bookingSlot, setBookingSlot] = useState<{ date: string, time: string } | null>(null)
  const [rescheduleSlot, setRescheduleSlot] = useState<{ date: string, time: string, appointmentId: string, duration: number, patientName?: string, patientPhone?: string } | null>(null)
  const [cancelTarget, setCancelTarget] = useState<{ appointmentId: string, label: string, patientName: string, patientPhone?: string } | null>(null)
  const [globalBookingOpen, setGlobalBookingOpen] = useState(false)
  const [globalBookingDate, setGlobalBookingDate] = useState('')
  const [globalBookingTime, setGlobalBookingTime] = useState('')

  const [dayViewMode, setDayViewMode] = useState<'grid' | 'list'>('grid')
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false)
  const [reminderTarget, setReminderTarget] = useState<UpcomingItem | null>(null)

  const formatYMD = (d: Date) => `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`

  // 1. TANSTACK QUERY: Datos Base (agendas, webhook, company)
  const { data: baseData } = useQuery({
    queryKey: ['calendarBaseData'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      if (!profile?.company_id) throw new Error('No se encontró la compañía')
      const [agendasRes, platformRes] = await Promise.all([
        supabase.from('agendas').select('id, name, google_calendar_id').eq('company_id', profile.company_id),
        supabase.from('platform_settings').select('n8n_webhook_calendar').single()
      ])
      return {
        companyId: profile.company_id,
        agendas: agendasRes.data || [],
        webhookUrl: platformRes.data?.n8n_webhook_calendar || null
      }
    }
  })

  useEffect(() => {
    if (baseData) {
      setCompanyId(baseData.companyId)
      setAgendas(baseData.agendas)
      if (baseData.agendas.length > 0 && !selectedAgendaId) {
        setSelectedAgendaId(baseData.agendas[0].id)
      }
    }
  }, [baseData, selectedAgendaId])

  // 2. TANSTACK QUERY: Eventos
  const { data: specificData, isFetching: isLoadingEvents, refetch: refetchEvents } = useQuery({
    queryKey: ['calendarSpecifics', selectedAgendaId, currentDate.getFullYear(), currentDate.getMonth()],
    enabled: !!companyId && !!selectedAgendaId,
    queryFn: async () => {
      const agendaObj = baseData?.agendas.find(a => a.id === selectedAgendaId)
      const monthStart = formatYMD(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1))
      const monthEnd = formatYMD(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0))

      const [whRes, dsRes, apptsRes] = await Promise.all([
        supabase.from('working_hours').select('*').eq('agenda_id', selectedAgendaId).order('day_of_week'),
        supabase.from('disabled_slots').select('date, time').eq('company_id', companyId),
        supabase.from('appointments')
          .select('id, patient_id, appointment_date, appointment_time, status, duration_minutes, notes, google_event_id, source, contacts(name, phone)')
          .eq('agenda_id', selectedAgendaId)
          .neq('status', 'cancelled')
          .gte('appointment_date', monthStart)
          .lte('appointment_date', monthEnd)
      ])

      const supabaseEvents: CalendarEvent[] = (apptsRes.data || []).map((a: any) => {
        const [h, m] = (a.appointment_time || '00:00:00').split(':').map(Number)
        const startMins = h * 60 + m
        const dur = a.duration_minutes || 30
        const patientName = a.contacts?.name || 'Paciente'
        const patientPhone = a.contacts?.phone || a.patient_id
        const endH = Math.floor((startMins + dur) / 60).toString().padStart(2, '0')
        const endM = ((startMins + dur) % 60).toString().padStart(2, '0')
        return {
          id: a.id,
          date: a.appointment_date,
          time: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
          rawTime: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
          startMins,
          endMins: startMins + dur,
          title: patientName,
          status: a.status,
          motivo: a.notes || '',
          appointmentId: a.id,
          patientId: a.patient_id,
          patientPhone,
          duration: dur,
          source: a.google_event_id ? 'both' : 'supabase'
        }
      })

      const googleEvents: CalendarEvent[] = []
      if (agendaObj?.google_calendar_id && baseData?.webhookUrl) {
        const timeMin = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 0, 0, 0).toISOString()
        const timeMax = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59).toISOString()

        try {
          const response = await fetch(baseData.webhookUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ calendarId: agendaObj.google_calendar_id, timeMin, timeMax, _t: Date.now() })
          })

          if (response.ok) {
            const text = await response.text()
            let rawData; try { rawData = JSON.parse(text) } catch (e) {}

            let eventsArray: any[] = []
            if (Array.isArray(rawData)) eventsArray = rawData
            else if (rawData && Array.isArray(rawData.events)) eventsArray = rawData.events
            else if (rawData && Array.isArray(rawData.data)) eventsArray = rawData.data

            eventsArray.forEach((rawItem: any) => {
              const gEvent = rawItem.json ? rawItem.json : rawItem
              const startDateTime = gEvent.start?.dateTime || gEvent.start?.date
              const endDateTime = gEvent.end?.dateTime || gEvent.end?.date
              if (!startDateTime) return

              let dStart = startDateTime.includes('T') ? new Date(startDateTime) : new Date(startDateTime.split('-')[0], startDateTime.split('-')[1] - 1, startDateTime.split('-')[2])

              const dateStr = formatYMD(dStart)
              let timeStr = 'Todo el día', rawTimeStr = '', startMins = 0, endMins = 1440

              if (gEvent.start?.dateTime) {
                timeStr = dStart.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
                rawTimeStr = `${dStart.getHours().toString().padStart(2, '0')}:${dStart.getMinutes().toString().padStart(2, '0')}`
                startMins = dStart.getHours() * 60 + dStart.getMinutes()
                if (endDateTime && endDateTime.includes('T')) {
                  const dEnd = new Date(endDateTime)
                  endMins = dEnd.getHours() * 60 + dEnd.getMinutes()
                } else { endMins = startMins + 30 }
              }

              googleEvents.push({
                id: gEvent.id || Math.random().toString(),
                date: dateStr, time: timeStr, rawTime: rawTimeStr, startMins, endMins,
                title: gEvent.summary || 'Cita Reservada', status: gEvent.status || 'confirmed',
                motivo: gEvent.description || '',
                source: 'google_only'
              })
            })
          }
        } catch (err) {
          console.error('Error sincronizando Google:', err)
        }
      }

      const linkedGoogleIds = new Set(
        (apptsRes.data || [])
          .map((a: any) => a.google_event_id)
          .filter(Boolean)
      )
      const googleStandalone = googleEvents.filter(g => !linkedGoogleIds.has(g.id))

      const formattedEvents = [...supabaseEvents, ...googleStandalone]

      return { workingHours: whRes.data || [], disabledSlots: dsRes.data || [], events: formattedEvents }
    }
  })

  useEffect(() => {
    if (specificData) {
      setWorkingHours(specificData.workingHours)
      setDisabledSlots(specificData.disabledSlots)
      setEvents(specificData.events)
    }
  }, [specificData])

  // ============================================================================
  // v1.9: Próximas Citas
  // ============================================================================
  const { data: upcomingData = [] } = useQuery({
    queryKey: ['upcomingAppointments', companyId, selectedAgendaId],
    enabled: !!companyId && !!selectedAgendaId,
    queryFn: async () => {
      const today = formatYMD(new Date())
      const in14days = new Date()
      in14days.setDate(in14days.getDate() + 14)
      const horizon = formatYMD(in14days)

      const { data } = await supabase
        .from('appointments')
        .select('id, patient_id, appointment_date, appointment_time, status, duration_minutes, notes, google_event_id, contacts(name, phone)')
        .eq('agenda_id', selectedAgendaId)
        .neq('status', 'cancelled')
        .gte('appointment_date', today)
        .lte('appointment_date', horizon)
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true })

      return (data || []).map((a: any) => {
        const [h, m] = (a.appointment_time || '00:00:00').split(':').map(Number)
        const startMins = h * 60 + m
        const dur = a.duration_minutes || 30
        return {
          appointmentId: a.id,
          patientId: a.patient_id,
          patientName: a.contacts?.name || 'Paciente',
          patientPhone: a.contacts?.phone || a.patient_id,
          date: a.appointment_date,
          time: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
          startMins,
          endMins: startMins + dur,
          duration: dur,
          motivo: (a.notes || '').replace(/^Motivo:\s*/i, '').trim(),
          status: a.status
        }
      })
    }
  })

  const kpis = useMemo(() => {
    const now = new Date()
    const todayStr = formatYMD(now)
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay())
    const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6)
    const startWeekStr = formatYMD(startOfWeek)
    const endWeekStr = formatYMD(endOfWeek)

    const citasHoy = upcomingData.filter(c => c.date === todayStr).length
    const citasSemana = upcomingData.filter(c => c.date >= startWeekStr && c.date <= endWeekStr).length

    const nowMins = now.getHours() * 60 + now.getMinutes()
    const proxima = upcomingData.find(c => {
      if (c.date > todayStr) return true
      if (c.date === todayStr && c.startMins > nowMins) return true
      return false
    })

    let proximaLabel = '—'
    let proximaDetalle = ''
    if (proxima) {
      const isToday = proxima.date === todayStr
      const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
      const isTomorrow = proxima.date === formatYMD(tomorrow)
      
      if (isToday) {
        const diffMins = proxima.startMins - nowMins
        if (diffMins < 60) {
          proximaLabel = `en ${diffMins} min`
        } else {
          const hrs = Math.floor(diffMins / 60)
          const mins = diffMins % 60
          proximaLabel = mins > 0 ? `en ${hrs}h ${mins}m` : `en ${hrs}h`
        }
        proximaDetalle = `${proxima.patientName} · ${proxima.time}`
      } else if (isTomorrow) {
        proximaLabel = `Mañana ${proxima.time}`
        proximaDetalle = proxima.patientName
      } else {
        const date = new Date(proxima.date + 'T00:00:00')
        proximaLabel = date.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit' }).replace('.', '')
        proximaDetalle = `${proxima.patientName} · ${proxima.time}`
      }
    }

    let capacidadSemana = 0
    for (let d = 0; d < 7; d++) {
      const wh = workingHours.find(w => w.day_of_week === d && w.is_active)
      if (!wh) continue
      const [sh, sm] = wh.start_time.split(':').map(Number)
      const [eh, em] = wh.end_time.split(':').map(Number)
      let minutos = (eh * 60 + em) - (sh * 60 + sm)
      if (wh.has_break) {
        const [bsh, bsm] = (wh.break_start_time || '00:00').split(':').map(Number)
        const [beh, bem] = (wh.break_end_time || '00:00').split(':').map(Number)
        minutos -= (beh * 60 + bem) - (bsh * 60 + bsm)
      }
      capacidadSemana += Math.floor(minutos / (wh.slot_duration || 30))
    }
    const ocupacionPct = capacidadSemana > 0
      ? Math.min(100, Math.round((citasSemana / capacidadSemana) * 100))
      : null

    return { citasHoy, citasSemana, proximaLabel, proximaDetalle, ocupacionPct, capacidadSemana, proxima }
  }, [upcomingData, workingHours])

  const upcomingGrouped = useMemo(() => {
    const groups = new Map<string, typeof upcomingData>()
    for (const c of upcomingData) {
      if (!groups.has(c.date)) groups.set(c.date, [])
      groups.get(c.date)!.push(c)
    }
    return Array.from(groups.entries())
  }, [upcomingData])

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const todayYMD = formatYMD(today)
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
    const tomorrowYMD = formatYMD(tomorrow)
    
    if (dateStr === todayYMD) return 'HOY'
    if (dateStr === tomorrowYMD) return 'MAÑANA'
    
    const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    const label = d.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'short' })
    if (diffDays > 1 && diffDays <= 14) {
      return `${label} · en ${diffDays} días`
    }
    return label
  }

  const toggleSlotMutation = useMutation({
    mutationFn: async ({ dateStr, timeStr }: { dateStr: string, timeStr: string }) => {
      const timeFormatted = `${timeStr}:00`
      const isCurrentlyDisabled = disabledSlots.some(d => d.date === dateStr && d.time === timeFormatted)
      
      if (isCurrentlyDisabled) {
        await supabase.from('disabled_slots').delete().match({ company_id: companyId, date: dateStr, time: timeFormatted })
        return { action: 'deleted', dateStr, timeFormatted }
      } else {
        await supabase.from('disabled_slots').insert([{ company_id: companyId, date: dateStr, time: timeFormatted }])
        return { action: 'inserted', dateStr, timeFormatted }
      }
    },
    onSuccess: (result) => {
      if (result.action === 'deleted') {
        setDisabledSlots(prev => prev.filter(d => !(d.date === result.dateStr && d.time === result.timeFormatted)))
        toast.success('Bloque habilitado', { id: 'slot-toast' })
      } else {
        setDisabledSlots(prev => [...prev, { date: result.dateStr, time: result.timeFormatted }])
        toast.success('Bloque inhabilitado', { id: 'slot-toast' })
      }
      queryClient.invalidateQueries({ queryKey: ['calendarSpecifics'] })
      queryClient.invalidateQueries({ queryKey: ['upcomingAppointments'] })
    },
    onError: () => toast.error('Error al modificar el bloque')
  })

  const toggleDisableSlot = (dateStr: string, timeStr: string) => toggleSlotMutation.mutate({ dateStr, timeStr })

  const handleSync = () => {
    if (!baseData?.webhookUrl) { toast.error('Falta configurar el Webhook'); return }
    setSyncSuccess(false)
    toast.promise(refetchEvents().then(() => { setSyncSuccess(true); setTimeout(() => setSyncSuccess(false), 3000) }), {
      loading: 'Sincronizando con Google...', success: 'Calendario actualizado', error: 'Error al sincronizar'
    })
  }

  const generateTimeSlots = (start: string, end: string, durationMin: number) => {
    const slots = []
    let [currH, currM] = start.split(':').map(Number)
    const [endH, endM] = end.split(':').map(Number)
    while (currH < endH || (currH === endH && currM < endM)) {
      slots.push(`${currH.toString().padStart(2, '0')}:${currM.toString().padStart(2, '0')}`)
      currM += durationMin
      if (currM >= 60) { currH += Math.floor(currM / 60); currM %= 60 }
    }
    return slots
  }

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() 
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
  const daysOfWeek = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const activeAgenda = agendas.find(a => a.id === selectedAgendaId)
  const hasCalendarId = !!activeAgenda?.google_calendar_id

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      
      {/* HEADER DE CALENDARIOS */}
      <PageHeader
        title="Calendarios"
        description="Gestiona agendas de equipos y locaciones."
        actions={
          <AgendaSwitcher
            agendas={agendas}
            selectedAgendaId={selectedAgendaId}
            onChange={setSelectedAgendaId}
          />
        }
      />

      {/* Tarjeta de estado y acciones */}
      <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="relative z-10">
          <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-2">Estado de Google Calendar</h3>
          {hasCalendarId ? (
            <p className="text-sm text-slate-700 font-mono bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 inline-block shadow-inner break-all">{activeAgenda.google_calendar_id}</p>
          ) : (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <p className="text-sm text-amber-600 font-bold bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">No has vinculado un calendario de Google</p>
              <a
                href="/dashboard/settings?tab=calendars"
                className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
              >
                Ir a configuración <ExternalLink size={12} />
              </a>
            </div>
          )}
        </div>
        
        <div className="relative z-10 w-full md:w-auto flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => {
              const today = formatYMD(new Date())
              setGlobalBookingDate(today)
              setGlobalBookingTime('09:00')
              setGlobalBookingOpen(true)
            }}
            disabled={!activeAgenda}
            className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-black text-sm shadow-md transition-all hover:-translate-y-0.5 active:translate-y-0 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          >
            <CalendarPlus size={18} /> Agendar Cita
          </button>
          <button 
            onClick={handleSync} disabled={isLoadingEvents || !hasCalendarId}
            className={`flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-black text-sm shadow-md transition-all hover:-translate-y-0.5 active:translate-y-0 ${syncSuccess ? 'bg-emerald-500 text-white' : 'bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-50'}`}
          >
            {isLoadingEvents ? <><RefreshCw size={18} className="animate-spin" /> Actualizando...</> : syncSuccess ? <><CheckCircle2 size={18} /> ¡Sincronizado!</> : <><CalendarSync size={18} /> Forzar Sincronización Google</>}
          </button>
          {hasCalendarId && (
            <a
              href="https://calendar.google.com/calendar"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-black text-sm shadow-md transition-all hover:-translate-y-0.5 active:translate-y-0 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <ExternalLink size={18} /> Abrir Google Calendar
            </a>
          )}
        </div>
      </div>

      {/* BLOQUE DE INSTRUCCIONES (solo si NO hay agenda o NO tiene calendar_id) */}
      {(!activeAgenda || !hasCalendarId) && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="flex items-start gap-2.5 flex-1">
            <Info size={20} className="text-blue-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-blue-900">Para conectar tu calendario</p>
              <ol className="text-xs text-blue-800 font-medium leading-relaxed list-decimal list-inside space-y-1 mt-1">
                <li>Ve a <strong>Configuración → Google Calendar</strong> desde el menú lateral.</li>
                <li>Crea una agenda y pega el ID de tu calendario de Google (ej. <code className="bg-blue-100 px-1 rounded">tucorreo@gmail.com</code>).</li>
                <li>Comparte tu calendario con la cuenta de servicio que aparece en esa pantalla y dale permisos de <strong>edición</strong>.</li>
                <li>Guarda la agenda y luego usa el botón <strong>"Forzar Sincronización"</strong> para verificar la conexión.</li>
              </ol>
            </div>
          </div>
          <a
            href="/dashboard/settings?tab=calendars"
            className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1"
          >
            Ir a Configuración <ExternalLink size={14} />
          </a>
        </div>
      )}

      {/* ============================================================ */}
      {/* v1.9: TARJETAS KPI - solo si hay agenda y calendar_id */}
      {/* ============================================================ */}
      {activeAgenda && hasCalendarId && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <CalendarIcon size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hoy</p>
              <p className="text-2xl font-black text-slate-900 leading-tight">{kpis.citasHoy}</p>
              <p className="text-[11px] text-slate-500 font-medium">{kpis.citasHoy === 1 ? 'cita' : 'citas'}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <TrendingUp size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Esta semana</p>
              <p className="text-2xl font-black text-slate-900 leading-tight">{kpis.citasSemana}</p>
              <p className="text-[11px] text-slate-500 font-medium">{kpis.citasSemana === 1 ? 'cita' : 'citas'}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Zap size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Próxima</p>
              <p className="text-base font-black text-slate-900 leading-tight truncate">{kpis.proximaLabel}</p>
              <p className="text-[11px] text-slate-500 font-medium truncate">{kpis.proximaDetalle || 'sin citas próximas'}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Sparkles size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ocupación sem.</p>
              <p className="text-2xl font-black text-slate-900 leading-tight">{kpis.ocupacionPct !== null ? `${kpis.ocupacionPct}%` : '—'}</p>
              <p className="text-[11px] text-slate-500 font-medium">{kpis.capacidadSemana > 0 ? `de ${kpis.capacidadSemana} bloques` : 'configura horarios'}</p>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* Toggle del panel en mobile */}
      {/* ============================================================ */}
      {activeAgenda && hasCalendarId && (
        <div className="lg:hidden">
          <button
            onClick={() => setMobilePanelOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3 bg-white border border-slate-200 rounded-2xl shadow-sm font-bold text-sm text-slate-700"
          >
            <span className="flex items-center gap-2">
              <ChevronsRight size={16} className="text-blue-500" />
              {mobilePanelOpen ? 'Ocultar próximas citas' : 'Ver próximas citas (14 días)'}
            </span>
            {mobilePanelOpen ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* Layout 2-col - Calendar + Panel "Próximas Citas" */}
      {/* ============================================================ */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Panel en mobile - arriba si está abierto */}
        {activeAgenda && hasCalendarId && mobilePanelOpen && (
          <div className="lg:hidden">
            <UpcomingPanel
              grouped={upcomingGrouped}
              formatDateLabel={formatDateLabel}
              onReschedule={(c) => setRescheduleSlot({ date: c.date, time: c.time, appointmentId: c.appointmentId, duration: c.duration, patientName: c.patientName, patientPhone: c.patientPhone })}
              onCancel={(c) => setCancelTarget({ appointmentId: c.appointmentId, label: `${c.date} a las ${c.time}`, patientName: c.patientName, patientPhone: c.patientPhone })}
              onMessage={(c) => router.push(`/dashboard/inbox?contactId=${c.patientId}`)}
              onReminder={(c) => setReminderTarget(c)}
              canSendReminders={!!features?.crm_reminders}
            />
          </div>
        )}

        {/* Calendar principal */}
        <div className="flex-1 min-w-0">
          {activeAgenda && hasCalendarId ? (
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden relative min-h-[600px]">
              {isLoadingEvents && !selectedDay && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex items-center justify-center">
                  <div className="flex items-center gap-3 bg-white px-6 py-4 rounded-full shadow-2xl border border-slate-100 font-black text-blue-600"><RefreshCw size={20} className="animate-spin" /> Descargando eventos...</div>
                </div>
              )}

              {selectedDay ? (
                <div className="animate-in slide-in-from-right-4 duration-300">
                  <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-4">
                      <button onClick={() => setSelectedDay(null)} className="p-3 border border-slate-200 bg-white rounded-xl text-slate-500 hover:text-blue-600 hover:border-blue-300 hover:shadow-md transition-all"><ArrowLeft size={20} /></button>
                      <h2 className="text-2xl font-black text-slate-900">{daysOfWeek[selectedDay.getDay()]}, {selectedDay.getDate()} de {monthNames[selectedDay.getMonth()]}</h2>
                    </div>

                    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                      <button
                        onClick={() => setDayViewMode('grid')}
                        className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${dayViewMode === 'grid' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                        title="Ver bloques"
                      >
                        <LayoutGrid size={14} /> Bloques
                      </button>
                      <button
                        onClick={() => setDayViewMode('list')}
                        className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${dayViewMode === 'list' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                        title="Ver lista de citas"
                      >
                        <List size={14} /> Lista
                      </button>
                    </div>
                  </div>
                  
                  <div className="p-8 max-w-3xl mx-auto relative">
                    {dayViewMode === 'list' ? (
                      (() => {
                        const dateStr = formatYMD(selectedDay)
                        const dayAppointments = events
                          .filter(e => e.date === dateStr && e.appointmentId)
                          .sort((a, b) => a.startMins - b.startMins)

                        if (dayAppointments.length === 0) {
                          return (
                            <div className="text-center py-16 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                              <List size={48} className="mx-auto text-slate-300 mb-4" />
                              <p className="text-slate-500 font-bold text-lg">Sin citas este día.</p>
                              <p className="text-sm text-slate-400 font-medium mt-1">Cambia a "Bloques" para agendar.</p>
                            </div>
                          )
                        }

                        return (
                          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                              <h3 className="text-sm font-black text-slate-700">{dayAppointments.length} {dayAppointments.length === 1 ? 'cita' : 'citas'} hoy</h3>
                              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ordenadas por hora</span>
                            </div>
                            <div className="divide-y divide-slate-100">
                              {dayAppointments.map(ev => {
                                const paciente = ev.title.replace(/^(Paciente|Cita):\s*/i, '').replace(/\s*\(Widget\)\s*$/i, '')
                                const motivo = ev.motivo.replace(/^Motivo:\s*/i, '').trim()
                                const endHH = Math.floor(ev.endMins / 60).toString().padStart(2, '0')
                                const endMM = (ev.endMins % 60).toString().padStart(2, '0')
                                return (
                                  <div key={ev.appointmentId} className="px-5 py-4 hover:bg-slate-50 transition-colors flex items-center gap-4">
                                    <div className="shrink-0 text-right">
                                      <p className="text-base font-black text-slate-900 tabular-nums">{ev.time}</p>
                                      <p className="text-[10px] font-bold text-slate-400 tabular-nums">a {endHH}:{endMM}</p>
                                    </div>
                                    <div className="h-10 w-px bg-slate-200"></div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-bold text-slate-900 text-sm truncate flex items-center gap-1.5">
                                        <User size={13} className="text-slate-400" /> {paciente}
                                      </p>
                                      {motivo && <p className="text-xs text-slate-500 mt-0.5 truncate">{motivo}</p>}
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{ev.duration || 30} min</p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        onClick={() => {
                                          const [h, m] = ev.time.split(':').map(Number)
                                          const t = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
                                          setRescheduleSlot({ date: ev.date, time: t, appointmentId: ev.appointmentId!, duration: ev.duration || 30, patientName: paciente, patientPhone: ev.patientPhone })
                                        }}
                                        title="Reagendar"
                                        className="p-2 rounded-lg bg-white border border-blue-200 text-blue-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors"
                                      >
                                        <CalendarClock size={14} />
                                      </button>
                                      <button
                                        onClick={() => setCancelTarget({ appointmentId: ev.appointmentId!, label: `${ev.date} a las ${ev.time}`, patientName: paciente, patientPhone: ev.patientPhone })}
                                        title="Cancelar"
                                        className="p-2 rounded-lg bg-white border border-rose-200 text-rose-600 hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-colors"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })()
                    ) : (
                      (() => {
                        const dayOfWeek = selectedDay.getDay()
                        const workDay = workingHours.find(w => w.day_of_week === dayOfWeek)
                        const dateStr = formatYMD(selectedDay)

                        if (!workDay || !workDay.is_active) {
                          return <div className="text-center py-16 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200"><p className="text-slate-500 font-bold text-lg">Día configurado como NO laborable.</p></div>
                        }

                        const slots = generateTimeSlots(workDay.start_time, workDay.end_time, workDay.slot_duration)

                        return (
                          <div className="space-y-4">
                            {slots.map(slotTime => {
                              const [slotH, slotM] = slotTime.split(':').map(Number)
                              const slotMins = slotH * 60 + slotM
                              const slotEndMins = slotMins + workDay.slot_duration

                              const isBreak = (() => {
                                if (!workDay.has_break || !workDay.break_start_time || !workDay.break_end_time) return false;
                                const [bStartH, bStartM] = workDay.break_start_time.split(':').map(Number);
                                const [bEndH, bEndM] = workDay.break_end_time.split(':').map(Number);
                                return (bStartH * 60 + bStartM) < slotEndMins && (bEndH * 60 + bEndM) > slotMins;
                              })();

                              const eventsInThisSlot = events.filter(e => e.date === dateStr && e.startMins < slotEndMins && e.endMins > slotMins)
                              const isDisabled = disabledSlots.some(d => d.date === dateStr && d.time === `${slotTime}:00`)
                              const hasEvents = eventsInThisSlot.length > 0

                              return (
                                <div key={slotTime} className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 rounded-2xl border-2 transition-all gap-4 ${isBreak ? 'bg-orange-50/50 border-orange-100 opacity-80' : hasEvents ? 'bg-rose-50 border-rose-200 shadow-sm' : isDisabled ? 'bg-slate-50 border-slate-200 opacity-70' : 'bg-white border-slate-100 hover:border-blue-300 shadow-sm'}`}>
                                  <div className="flex items-start gap-5 flex-1 w-full">
                                    <div className={`px-4 py-2 rounded-xl text-sm font-black tracking-wider shrink-0 mt-0.5 ${isBreak ? 'bg-orange-100 text-orange-800' : hasEvents ? 'bg-rose-100 text-rose-700' : isDisabled ? 'bg-slate-200 text-slate-500' : 'bg-blue-50 text-blue-700 shadow-inner'}`}>{slotTime}</div>
                                    {isBreak ? (
                                      <p className="font-bold text-orange-600 text-sm italic flex items-center gap-2 mt-1.5"><Coffee size={16}/> Horario de Descanso</p>
                                    ) : hasEvents ? (
                                      <div className="flex flex-col gap-2 w-full">
                                        {eventsInThisSlot.map((ev, idx) => {
                                          const paciente = ev.title.replace(/^(Paciente|Cita):\s*/i, '').replace(/\s*\(Widget\)\s*$/i, '')
                                          const motivo = ev.motivo.replace(/^Motivo:\s*/i, '').trim()
                                          const endHH = Math.floor(ev.endMins / 60).toString().padStart(2, '0')
                                          const endMM = (ev.endMins % 60).toString().padStart(2, '0')
                                          return (
                                            <div key={idx} className="bg-white/80 p-3 rounded-xl border border-rose-100 shadow-sm">
                                              <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                  <p className="font-black text-rose-900 text-sm flex items-center gap-2 truncate"><User size={14}/> {paciente}</p>
                                                  <p className="text-xs text-rose-600 font-bold flex items-center gap-1 mt-1.5 opacity-80"><Clock size={12}/> {ev.time} a {endHH}:{endMM} ({ev.duration || 30} min)</p>
                                                  {motivo && <p className="text-xs text-rose-500/90 mt-1.5 flex items-start gap-1"><MessageSquare size={11} className="mt-0.5 shrink-0"/> {motivo}</p>}
                                                  {ev.source === 'google_only' && (
                                                    <p className="text-[10px] text-amber-700 font-bold mt-1.5 italic">⚠ Solo en Google Calendar (no en el sistema)</p>
                                                  )}
                                                </div>
                                                {ev.appointmentId && (
                                                  <div className="flex items-center gap-1.5 shrink-0">
                                                    <button
                                                      onClick={() => setRescheduleSlot({ date: dateStr, time: slotTime, appointmentId: ev.appointmentId!, duration: ev.duration || 30, patientName: paciente, patientPhone: ev.patientPhone })}
                                                      title="Reagendar"
                                                      className="p-2 rounded-lg bg-white border border-blue-200 text-blue-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors"
                                                    >
                                                      <CalendarClock size={14} />
                                                    </button>
                                                    <button
                                                      onClick={() => setCancelTarget({ appointmentId: ev.appointmentId!, label: `${dateStr} a las ${slotTime}`, patientName: paciente, patientPhone: ev.patientPhone })}
                                                      title="Cancelar"
                                                      className="p-2 rounded-lg bg-white border border-rose-200 text-rose-600 hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-colors"
                                                    >
                                                      <Trash2 size={14} />
                                                    </button>
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    ) : isDisabled ? (
                                      <p className="font-bold text-slate-500 text-sm italic flex items-center gap-2 mt-1.5"><Lock size={16}/> Bloqueado Manualmente</p>
                                    ) : (
                                      <p className="font-bold text-emerald-600 text-sm mt-1.5">Bloque Disponible</p>
                                    )}
                                  </div>

                                  {!hasEvents && !isBreak && (
                                    <div className="flex gap-2 w-full sm:w-auto shrink-0">
                                      {!isDisabled && (
                                        <button
                                          onClick={() => setBookingSlot({ date: dateStr, time: slotTime })}
                                          className="p-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 flex-1 sm:flex-initial shadow-sm bg-blue-600 text-white hover:bg-blue-700"
                                        >
                                          <CalendarPlus size={16}/> Agendar
                                        </button>
                                      )}
                                      <button 
                                        onClick={() => toggleDisableSlot(dateStr, slotTime)} disabled={toggleSlotMutation.isPending && toggleSlotMutation.variables?.timeStr === slotTime}
                                        className={`p-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 flex-1 sm:flex-initial shadow-sm ${isDisabled ? 'bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50' : 'bg-slate-100 text-slate-600 hover:bg-rose-500 hover:text-white hover:border-transparent'} ${toggleSlotMutation.isPending && toggleSlotMutation.variables?.timeStr === slotTime ? 'opacity-50 cursor-not-allowed' : ''}`}
                                      >
                                        {isDisabled ? <><Unlock size={16}/> Habilitar Bloque</> : <><Lock size={16}/> Inhabilitar Bloque</>}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()
                    )}
                  </div>
                </div>
              ) : (
                <div className="animate-in fade-in duration-300">
                  <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h2 className="text-2xl font-black text-slate-900 capitalize">{monthNames[month]} {year}</h2>
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                      <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"><ChevronLeft size={20} /></button>
                      <button onClick={() => setCurrentDate(new Date())} className="px-4 py-2 rounded-lg text-slate-700 font-bold text-sm hover:bg-slate-100 transition-colors">Hoy</button>
                      <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"><ChevronRight size={20} /></button>
                    </div>
                  </div>

                  <div className="p-8">
                    <div className="grid grid-cols-7 gap-4 mb-4">
                      {daysOfWeek.map(day => <div key={day} className="text-center text-xs font-black text-slate-400 uppercase tracking-widest">{day}</div>)}
                    </div>

                    <div className="grid grid-cols-7 gap-4">
                      {Array(firstDayOfMonth).fill(null).map((_, i) => <div key={`empty-${i}`} className="min-h-[140px] rounded-3xl bg-slate-50/50 border-2 border-dashed border-slate-100 opacity-50"></div>)}
                      
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                        const targetDate = new Date(year, month, day)
                        const currentDateString = formatYMD(targetDate)
                        const dayEvents = events.filter(app => app.date === currentDateString)
                        const isToday = new Date().toDateString() === targetDate.toDateString()

                        return (
                          <div 
                            key={day} onClick={() => setSelectedDay(targetDate)}
                            className={`min-h-[140px] rounded-3xl border-2 p-4 flex flex-col transition-all hover:shadow-lg hover:-translate-y-1 cursor-pointer group
                              ${isToday ? 'border-blue-400 bg-blue-50/20 shadow-md ring-4 ring-blue-500/10' : 'border-slate-100 bg-white hover:border-blue-200'}`}
                          >
                            <div className="flex justify-between items-start mb-3">
                              <span className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-black shadow-sm
                                ${isToday ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-700'}`}>
                                {day}
                              </span>
                            </div>
                            
                            <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                              {dayEvents.slice(0, 4).map((app, idx) => {
                                const paciente = app.title.replace(/^(Paciente|Cita):\s*/i, '').replace(/\s*\(Widget\)\s*$/i, '')
                                const motivo = app.motivo.replace(/^Motivo:\s*/i, '').trim()
                                return (
                                  <div
                                    key={app.id || idx}
                                    title={`${app.time} · ${paciente}${motivo ? ' · ' + motivo : ''}`}
                                    className="bg-rose-50 text-rose-700 text-[10px] px-1.5 py-0.5 rounded border border-rose-100 flex items-center gap-1.5 overflow-hidden min-w-0"
                                  >
                                    <span className="tabular-nums font-black shrink-0">{app.time}</span>
                                    {paciente && <span className="truncate font-medium text-rose-600/90 min-w-0">{paciente}</span>}
                                  </div>
                                )
                              })}
                              {dayEvents.length > 4 && (
                                <div className="text-[10px] font-black text-slate-400 pl-1">+ {dayEvents.length - 4} más</div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200 p-16 text-center shadow-inner">
              <CalendarIcon size={64} className="mx-auto text-slate-300 mb-6" />
              <h3 className="text-2xl font-black text-slate-800 mb-2">No hay agendas configuradas</h3>
              <p className="text-slate-500 font-medium">Ve a Configuración y agrega un calendario para empezar a recibir citas.</p>
            </div>
          )}
        </div>

        {/* Panel "Próximas Citas" - solo desktop */}
        {activeAgenda && hasCalendarId && (
          <div className="hidden lg:block lg:w-72 xl:w-80 2xl:w-96 shrink-0">
            <UpcomingPanel
              grouped={upcomingGrouped}
              formatDateLabel={formatDateLabel}
              onReschedule={(c) => setRescheduleSlot({ date: c.date, time: c.time, appointmentId: c.appointmentId, duration: c.duration, patientName: c.patientName, patientPhone: c.patientPhone })}
              onCancel={(c) => setCancelTarget({ appointmentId: c.appointmentId, label: `${c.date} a las ${c.time}`, patientName: c.patientName, patientPhone: c.patientPhone })}
              onMessage={(c) => router.push(`/dashboard/inbox?contactId=${c.patientId}`)}
              onReminder={(c) => setReminderTarget(c)}
              canSendReminders={!!features?.crm_reminders}
            />
          </div>
        )}
      </div>

      {/* MODALES (Booking, Cancel, QuickReminder) - SIN CAMBIOS */}
      <BookingModal
        isOpen={!!bookingSlot}
        onClose={() => setBookingSlot(null)}
        mode="create"
        companyId={companyId}
        agendaId={selectedAgendaId}
        agendaName={activeAgenda?.name || ''}
        date={bookingSlot?.date || ''}
        time={bookingSlot?.time || ''}
        defaultDuration={
          bookingSlot
            ? (workingHours.find(w => w.day_of_week === new Date(bookingSlot.date + 'T00:00').getDay())?.slot_duration || 30)
            : 30
        }
        busyEvents={events.map(e => ({ date: e.date, startMins: e.startMins, endMins: e.endMins, appointmentId: e.appointmentId }))}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['calendarSpecifics'] })
          queryClient.invalidateQueries({ queryKey: ['upcomingAppointments'] })
          refetchEvents()
        }}
      />

      <BookingModal
        isOpen={globalBookingOpen}
        onClose={() => setGlobalBookingOpen(false)}
        mode="create"
        companyId={companyId}
        agendaId={selectedAgendaId}
        agendaName={activeAgenda?.name || ''}
        date={globalBookingDate}
        time={globalBookingTime}
        defaultDuration={30}
        allowEditDateTime={true}
        busyEvents={events.map(e => ({ date: e.date, startMins: e.startMins, endMins: e.endMins, appointmentId: e.appointmentId }))}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['calendarSpecifics'] })
          queryClient.invalidateQueries({ queryKey: ['upcomingAppointments'] })
          refetchEvents()
        }}
      />

      <BookingModal
        isOpen={!!rescheduleSlot}
        onClose={() => setRescheduleSlot(null)}
        mode="reschedule"
        companyId={companyId}
        agendaId={selectedAgendaId}
        agendaName={activeAgenda?.name || ''}
        date={rescheduleSlot?.date || ''}
        time={rescheduleSlot?.time || ''}
        defaultDuration={rescheduleSlot?.duration || 30}
        appointmentId={rescheduleSlot?.appointmentId}
        patientName={rescheduleSlot?.patientName}
        patientPhone={rescheduleSlot?.patientPhone}
        busyEvents={events.map(e => ({ date: e.date, startMins: e.startMins, endMins: e.endMins, appointmentId: e.appointmentId }))}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['calendarSpecifics'] })
          queryClient.invalidateQueries({ queryKey: ['upcomingAppointments'] })
          refetchEvents()
        }}
      />

      <CancelDialog
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        appointmentId={cancelTarget?.appointmentId || ''}
        patientName={cancelTarget?.patientName}
        patientPhone={cancelTarget?.patientPhone}
        dateLabel={cancelTarget?.label}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['calendarSpecifics'] })
          queryClient.invalidateQueries({ queryKey: ['upcomingAppointments'] })
          refetchEvents()
        }}
      />

      {reminderTarget && (
        <QuickReminderModal
          target={reminderTarget}
          companyId={companyId}
          onClose={() => setReminderTarget(null)}
        />
      )}
    </div>
  )
}

// ============================================================================
// COMPONENTES AUXILIARES (sin cambios)
// ============================================================================

type UpcomingItem = {
  appointmentId: string
  patientId: string
  patientName: string
  patientPhone: string
  date: string
  time: string
  startMins: number
  endMins: number
  duration: number
  motivo: string
  status: string
}

function UpcomingPanel({
  grouped,
  formatDateLabel,
  onReschedule,
  onCancel,
  onMessage,
  onReminder,
  canSendReminders
}: {
  grouped: [string, UpcomingItem[]][]
  formatDateLabel: (d: string) => string
  onReschedule: (c: UpcomingItem) => void
  onCancel: (c: UpcomingItem) => void
  onMessage: (c: UpcomingItem) => void
  onReminder: (c: UpcomingItem) => void
  canSendReminders: boolean
}) {
  const totalCount = grouped.reduce((acc, [, items]) => acc + items.length, 0)

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <Sparkles size={16} className="text-blue-500" />
            Próximas Citas
          </h3>
          <span className="text-[11px] font-bold text-slate-500 bg-white px-2.5 py-1 rounded-full border border-slate-200">
            {totalCount}
          </span>
        </div>
        <p className="text-[11px] text-slate-500 font-medium mt-1">Próximos 14 días</p>
      </div>

      <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
        {totalCount === 0 ? (
          <div className="px-5 py-12 text-center">
            <CalendarIcon size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-500 font-bold">Sin citas en los próximos 14 días</p>
            <p className="text-xs text-slate-400 mt-1">Agenda una nueva desde el calendario</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {grouped.map(([dateStr, items]) => (
              <div key={dateStr}>
                <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-100 sticky top-0 z-10">
                  <p className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                    {formatDateLabel(dateStr)}
                  </p>
                </div>
                {items.map(c => {
                  const endH = Math.floor(c.endMins / 60).toString().padStart(2, '0')
                  const endM = (c.endMins % 60).toString().padStart(2, '0')
                  return (
                    <div
                      key={c.appointmentId}
                      className="group px-4 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="shrink-0 text-center min-w-[42px]">
                          <p className="text-sm font-black text-slate-900 tabular-nums leading-tight">{c.time}</p>
                          <p className="text-[9px] font-bold text-slate-400 tabular-nums">a {endH}:{endM}</p>
                        </div>
                        <div className="w-px bg-slate-200 self-stretch"></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
                            <User size={12} className="text-slate-400 shrink-0" />
                            {c.patientName}
                          </p>
                          {c.motivo && (
                            <p className="text-xs text-slate-500 truncate mt-0.5">{c.motivo}</p>
                          )}
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{c.duration} min</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 mt-2 pl-[54px] flex-wrap">
                        <button
                          onClick={() => onMessage(c)}
                          title="Abrir chat con el paciente"
                          className="px-2 py-1 rounded-md text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors flex items-center gap-1"
                        >
                          <MessageSquare size={11} /> Chat
                        </button>
                        {canSendReminders && (
                          <button
                            onClick={() => onReminder(c)}
                            title="Programar recordatorio para esta cita"
                            className="px-2 py-1 rounded-md text-[10px] font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 transition-colors flex items-center gap-1"
                          >
                            <Bell size={11} /> Recordar
                          </button>
                        )}
                        <button
                          onClick={() => onReschedule(c)}
                          title="Reagendar"
                          className="px-2 py-1 rounded-md text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors flex items-center gap-1"
                        >
                          <CalendarClock size={11} /> Mover
                        </button>
                        <button
                          onClick={() => onCancel(c)}
                          title="Cancelar"
                          className="px-2 py-1 rounded-md text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors flex items-center gap-1"
                        >
                          <Trash2 size={11} /> Cancelar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AgendaSwitcher({
  agendas,
  selectedAgendaId,
  onChange
}: {
  agendas: Agenda[]
  selectedAgendaId: string
  onChange: (id: string) => void
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = agendas.find(a => a.id === selectedAgendaId)

  if (agendas.length === 1) {
    return (
      <div className="flex items-center gap-2.5 bg-white border border-slate-200 px-4 py-3 rounded-2xl shadow-sm">
        <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
          <CalendarIcon size={15} />
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Agenda activa</p>
          <p className="text-sm font-black text-slate-800 leading-tight">{agendas[0].name}</p>
        </div>
      </div>
    )
  }

  if (agendas.length <= 5) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm inline-flex items-center gap-1 flex-wrap">
        {agendas.map(a => {
          const isActive = a.id === selectedAgendaId
          return (
            <button
              key={a.id}
              onClick={() => onChange(a.id)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <CalendarIcon size={13} className={isActive ? 'text-white' : 'text-slate-400'} />
              {a.name}
            </button>
          )
        })}
      </div>
    )
  }

  const filtered = search.trim()
    ? agendas.filter(a => a.name.toLowerCase().includes(search.trim().toLowerCase()))
    : agendas

  return (
    <div className="relative">
      <button
        onClick={() => setDropdownOpen(o => !o)}
        className="flex items-center gap-3 bg-white border border-slate-200 px-4 py-3 rounded-2xl shadow-sm hover:border-blue-300 hover:shadow-md transition-all min-w-[240px]"
      >
        <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
          <CalendarIcon size={15} />
        </div>
        <div className="flex-1 text-left">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Agenda activa</p>
          <p className="text-sm font-black text-slate-800 leading-tight truncate">{selected?.name || 'Selecciona'}</p>
        </div>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
      </button>

      {dropdownOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setDropdownOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-40 bg-white border border-slate-200 rounded-2xl shadow-2xl w-72 overflow-hidden">
            <div className="p-2 border-b border-slate-100">
              <input
                autoFocus
                type="text"
                placeholder="Buscar agenda..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:bg-white focus:border-blue-500"
              />
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-slate-400 font-medium">Sin coincidencias</div>
              ) : (
                filtered.map(a => {
                  const isActive = a.id === selectedAgendaId
                  return (
                    <button
                      key={a.id}
                      onClick={() => { onChange(a.id); setDropdownOpen(false); setSearch('') }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors ${isActive ? 'bg-blue-50' : ''}`}
                    >
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        <CalendarIcon size={12} />
                      </div>
                      <span className={`text-sm font-bold flex-1 truncate ${isActive ? 'text-blue-900' : 'text-slate-700'}`}>{a.name}</span>
                      {isActive && <CheckCircle2 size={14} className="text-blue-600 shrink-0" />}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function QuickReminderModal({
  target,
  companyId,
  onClose
}: {
  target: UpcomingItem
  companyId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [selectedOffset, setSelectedOffset] = useState<number>(60)
  const [customMessage, setCustomMessage] = useState('')

  const appointmentTime = new Date(`${target.date}T${target.time}:00`)
  const sendTime = new Date(appointmentTime.getTime() - selectedOffset * 60 * 1000)
  const isPastSendTime = sendTime < new Date()

  const offsetOptions = [
    { mins: 60,   label: '1 hora antes' },
    { mins: 120,  label: '2 horas antes' },
    { mins: 240,  label: '4 horas antes' },
    { mins: 1440, label: '24 horas antes' },
    { mins: 2880, label: '2 días antes' }
  ]

  const defaultMessage = `Hola ${target.patientName}, te recordamos tu cita el ${new Date(target.date).toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long' })} a las ${target.time}. Si necesitas reagendar o cancelar, respóndenos por aquí.`

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      const message = customMessage.trim() || defaultMessage
      const { error } = await supabase.from('reminder_queue').insert([{
        company_id: companyId,
        contact_id: target.patientId,
        appointment_id: target.appointmentId,
        rule_id: null,
        scheduled_at: sendTime.toISOString(),
        status: 'pending',
        rendered_content: message
      }])
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Recordatorio programado')
      queryClient.invalidateQueries({ queryKey: ['reminderQueue'] })
      onClose()
    },
    onError: (e: any) => toast.error(e.message || 'Error al programar')
  })

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-br from-purple-50 to-white">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
              <Bell size={18} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Recordatorio para {target.patientName}</h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Cita: {new Date(target.date).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' })} · {target.time}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-2 hover:bg-white rounded-lg">
            <span className="text-xl leading-none">×</span>
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">¿Cuándo enviar el recordatorio?</label>
            <div className="grid grid-cols-2 gap-2">
              {offsetOptions.map(opt => {
                const optTime = new Date(appointmentTime.getTime() - opt.mins * 60 * 1000)
                const isPast = optTime < new Date()
                const isActive = selectedOffset === opt.mins
                return (
                  <button
                    key={opt.mins}
                    onClick={() => !isPast && setSelectedOffset(opt.mins)}
                    disabled={isPast}
                    className={`px-3 py-2.5 rounded-xl text-sm font-bold border-2 transition-all text-left ${
                      isActive && !isPast
                        ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                        : isPast
                        ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-purple-300'
                    }`}
                  >
                    {opt.label}
                    {isPast && <span className="block text-[10px] mt-0.5 opacity-60">(en el pasado)</span>}
                  </button>
                )
              })}
            </div>
            {!isPastSendTime && (
              <p className="text-xs text-slate-500 mt-2">
                Se enviará el <strong>{sendTime.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'short' })}</strong> a las <strong>{sendTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })}</strong>
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Mensaje (opcional, usa default si lo dejas vacío)</label>
            <textarea
              rows={4}
              value={customMessage}
              onChange={e => setCustomMessage(e.target.value)}
              placeholder={defaultMessage}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-purple-500 resize-none"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
          <button
            onClick={() => scheduleMutation.mutate()}
            disabled={scheduleMutation.isPending || isPastSendTime}
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-black rounded-xl disabled:opacity-40 flex items-center gap-2 shadow-md"
          >
            {scheduleMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Bell size={14} />}
            Programar recordatorio
          </button>
        </div>
      </div>
    </div>
  )
}