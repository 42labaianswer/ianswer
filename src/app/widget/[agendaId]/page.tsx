'use client'

import { useEffect, useState } from 'react'
import { Calendar as CalendarIcon, Clock, User, Phone, CheckCircle2, ChevronLeft, ChevronRight, Loader2, ArrowLeft } from 'lucide-react'
import IAnswerLoader from '../../../components/IAnswerLoader'

// Definimos params como 'any' para evitar quejas de TS, nosotros lo manejamos internamente
export default function WidgetPage({ params }: { params: any }) {
  const [agendaId, setAgendaId] = useState<string | null>(null)

  const [agenda, setAgenda] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [workingHours, setWorkingHours] = useState<any[]>([])
  const [disabledSlots, setDisabledSlots] = useState<any[]>([])
  const [busyEvents, setBusyEvents] = useState<any[]>([])
  const [webhookUrl, setWebhookUrl] = useState('')                 // calendario sync
  const [bookingWebhookUrl, setBookingWebhookUrl] = useState('')   // NUEVO v1.3 — agendar-widget

  const [isLoading, setIsLoading] = useState(true)
  const [isBooking, setIsBooking] = useState(false)
  const [bookingSuccess, setBookingSuccess] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)

  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)

  const [formData, setFormData] = useState({ name: '', phone: '', notes: '' })

  const formatYMD = (d: Date) => `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`

  // 0. FIX NEXT.JS 15: Desenvolver los params dinámicos
  useEffect(() => {
    Promise.resolve(params).then((resolvedParams) => {
      setAgendaId(resolvedParams.agendaId)
    })
  }, [params])

  // 1. Cargar Datos Públicos DESDE NUESTRA API SEGURA
  useEffect(() => {
    if (!agendaId) return; // Esperamos hasta tener el ID resuelto

    const fetchWidgetData = async () => {
      try {
        const response = await fetch(`/api/widget/${agendaId}`)
        if (!response.ok) throw new Error('Agenda no encontrada')
        
        const data = await response.json()
        
        setAgenda(data.agenda)
        setCompany(data.company)
        setWorkingHours(data.workingHours)
        setDisabledSlots(data.disabledSlots)
        setWebhookUrl(data.webhookUrl)
        setBookingWebhookUrl(data.bookingWebhookUrl || '')

      } catch (error) {
        console.error('Error cargando widget:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchWidgetData()
  }, [agendaId])

  // 2. Buscar eventos ocupados en Google Calendar al cambiar de mes/año
  useEffect(() => {
    const fetchAvailability = async () => {
      if (!agenda?.google_calendar_id || !webhookUrl) return

      const year = currentDate.getFullYear()
      const month = currentDate.getMonth()
      const timeMin = new Date(year, month, 1, 0, 0, 0).toISOString()
      const timeMax = new Date(year, month + 1, 0, 23, 59, 59).toISOString()

      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ calendarId: agenda.google_calendar_id, timeMin, timeMax })
        })

        if (response.ok) {
          const text = await response.text()
          let rawData;
          try { rawData = JSON.parse(text) } catch (e) { }

          let eventsArray: any[] = []
          if (Array.isArray(rawData)) eventsArray = rawData
          else if (rawData && Array.isArray(rawData.events)) eventsArray = rawData.events

          const formatted = eventsArray.map((rawItem: any) => {
            const gEvent = rawItem.json ? rawItem.json : rawItem
            const startDateTime = gEvent.start?.dateTime || gEvent.start?.date
            const endDateTime = gEvent.end?.dateTime || gEvent.end?.date
            if (!startDateTime) return null

            const dStart = new Date(startDateTime)
            const dEnd = endDateTime ? new Date(endDateTime) : new Date(dStart.getTime() + 30 * 60000)

            return {
              date: formatYMD(dStart),
              startMins: dStart.getHours() * 60 + dStart.getMinutes(),
              endMins: dEnd.getHours() * 60 + dEnd.getMinutes()
            }
          }).filter(Boolean)

          setBusyEvents(formatted)
        }
      } catch (error) {
        console.error("Error sincronizando disponibilidad:", error)
      }
    }

    if (!isLoading) fetchAvailability()
  }, [currentDate, agenda, webhookUrl, isLoading])

  // Lógica de validación de bloques
  const getAvailableSlotsForDate = (date: Date) => {
    const dayOfWeek = date.getDay()
    const workDay = workingHours.find(w => w.day_of_week === dayOfWeek)
    const dateStr = formatYMD(date)

    if (!workDay || !workDay.is_active || date < new Date(new Date().setHours(0,0,0,0))) return []

    const slots = []
    let [currH, currM] = workDay.start_time.split(':').map(Number)
    const [endH, endM] = workDay.end_time.split(':').map(Number)
    
    while (currH < endH || (currH === endH && currM < endM)) {
      const hh = currH.toString().padStart(2, '0')
      const mm = currM.toString().padStart(2, '0')
      const slotTime = `${hh}:${mm}`
      
      const slotMins = currH * 60 + currM
      const slotEndMins = slotMins + workDay.slot_duration

      // Validar comida
      let isBreak = false
      if (workDay.has_break) {
        const [bStartH, bStartM] = workDay.break_start_time.split(':').map(Number)
        const [bEndH, bEndM] = workDay.break_end_time.split(':').map(Number)
        isBreak = (bStartH * 60 + bStartM) < slotEndMins && (bEndH * 60 + bEndM) > slotMins
      }

      // Validar eventos de Google y Bloqueos Manuales
      const hasGoogleEvent = busyEvents.some(e => e.date === dateStr && e.startMins < slotEndMins && e.endMins > slotMins)
      const isManuallyDisabled = disabledSlots.some(d => d.date === dateStr && d.time === `${slotTime}:00`)

      if (!isBreak && !hasGoogleEvent && !isManuallyDisabled) {
        slots.push(slotTime)
      }

      currM += workDay.slot_duration
      if (currM >= 60) { currH += Math.floor(currM / 60); currM %= 60 }
    }
    return slots
  }

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsBooking(true)
    setBookingError(null)
    
    try {
      // FIX v1.3: la URL viene del admin (platform_settings.n8n_webhook_widget)
      if (!bookingWebhookUrl) {
        throw new Error('El webhook del Widget no esta configurado. Avisa al administrador.')
      }
      
      const response = await fetch(bookingWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agendaId: agendaId,
          companyId: company?.id,
          name: formData.name,
          phone: formData.phone,
          notes: formData.notes,
          date: formatYMD(selectedDate!),
          time: selectedTime
        })
      })

      if (!response.ok) throw new Error('Error en el servidor')
      
      setBookingSuccess(true)
    } catch (error) {
      setBookingError("Error al agendar la cita. Por favor intenta de nuevo.")
      console.error(error)
    } finally {
      setIsBooking(false)
    }
  }

  if (isLoading) return <div className="flex h-screen items-center justify-center bg-white"><IAnswerLoader size={32} /></div>
  if (!agenda) return <div className="flex h-screen items-center justify-center bg-white text-slate-500">Agenda no disponible</div>

  if (bookingSuccess) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-500">
        <div className="h-20 w-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 size={40} />
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">¡Cita Confirmada!</h2>
        <p className="text-slate-500 max-w-sm">Tu espacio el <strong>{selectedDate?.toLocaleDateString('es-MX')}</strong> a las <strong>{selectedTime}</strong> ha sido reservado con éxito.</p>
      </div>
    )
  }

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay()
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 flex flex-col">
      
      {/* Header del Widget */}
      <div className="p-6 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50">
        <div className="h-12 w-12 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-md font-bold text-xl">
          {company?.name?.charAt(0) || 'C'}
        </div>
        <div>
          <h1 className="font-black text-lg leading-tight">{company?.name || 'Empresa'}</h1>
          <p className="text-sm text-slate-500">Agenda tu cita en línea</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        
        {/* PASO 1: Seleccionar Fecha */}
        {!selectedTime && (
          <div className="animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold text-slate-800 text-lg">Selecciona un día</h2>
              <div className="flex gap-2">
                <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} className="p-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600"><ChevronLeft size={16}/></button>
                <span className="text-sm font-bold w-24 text-center">{monthNames[currentDate.getMonth()]}</span>
                <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} className="p-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600"><ChevronRight size={16}/></button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2 mb-6">
              {['Do','Lu','Ma','Mi','Ju','Vi','Sa'].map(d => <div key={d} className="text-center text-xs font-bold text-slate-400">{d}</div>)}
              {Array(firstDayOfMonth).fill(null).map((_, i) => <div key={`e-${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
                const isPast = date < new Date(new Date().setHours(0,0,0,0))
                const isSelected = selectedDate?.toDateString() === date.toDateString()
                const hasSlots = getAvailableSlotsForDate(date).length > 0

                return (
                  <button 
                    key={day} 
                    disabled={isPast || !hasSlots}
                    onClick={() => setSelectedDate(date)}
                    className={`aspect-square flex items-center justify-center rounded-full text-sm font-semibold transition-all
                      ${isSelected ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 
                        isPast || !hasSlots ? 'text-slate-300 cursor-not-allowed' : 'bg-slate-50 text-slate-700 hover:bg-blue-50 hover:text-blue-600'}`}
                  >
                    {day}
                  </button>
                )
              })}
            </div>

            {/* Horarios del día seleccionado */}
            {selectedDate && (
              <div className="animate-in fade-in slide-in-from-top-2">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3 border-t border-slate-100 pt-6">Horarios Disponibles</h3>
                <div className="grid grid-cols-3 gap-3">
                  {getAvailableSlotsForDate(selectedDate).map(time => (
                    <button 
                      key={time}
                      onClick={() => setSelectedTime(time)}
                      className="py-2.5 rounded-xl border border-blue-200 text-blue-700 font-bold text-sm bg-blue-50 hover:bg-blue-600 hover:text-white transition-colors"
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* PASO 2: Formulario de Reserva */}
        {selectedTime && (
          <div className="animate-in slide-in-from-right-4 duration-300">
            <button onClick={() => setSelectedTime(null)} className="flex items-center gap-2 text-slate-500 font-semibold text-sm mb-6 hover:text-slate-900">
              <ArrowLeft size={16} /> Cambiar horario
            </button>
            
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6 flex items-center gap-4">
              <div className="h-10 w-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-blue-600"><CalendarIcon size={20}/></div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase">Cita seleccionada</p>
                <p className="font-bold text-slate-900">{selectedDate?.toLocaleDateString('es-MX')} a las {selectedTime}</p>
              </div>
            </div>

            <form onSubmit={handleBooking} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">Tu Nombre Completo</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><User size={16}/></div>
                  <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium" placeholder="Ej. Juan Pérez" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">WhatsApp / Teléfono</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Phone size={16}/></div>
                  <input required value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium" placeholder="Ej. 5512345678" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">Motivo de consulta (Opcional)</label>
                <textarea rows={3} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium resize-none" placeholder="Breve descripción..."></textarea>
              </div>

              {bookingError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium rounded-xl px-4 py-3">
                  {bookingError}
                </div>
              )}
              <button disabled={isBooking} type="submit" className="w-full py-3.5 mt-2 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-blue-700 transition-colors disabled:opacity-70">
                {isBooking ? <Loader2 className="animate-spin" size={18} /> : 'Confirmar Cita'}
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  )
}