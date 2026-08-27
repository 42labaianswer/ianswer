 

'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { X, Search, UserPlus, User, Phone, MessageSquare, Loader2, CheckCircle2, Clock, CalendarClock, Calendar as CalendarIcon, AlertTriangle, MessageCircle } from 'lucide-react'

type Contact = {
  id: string
  name: string | null
  phone: string | null
  external_id: string
}

type Mode = 'create' | 'reschedule'

type BusyEvent = {
  date: string
  startMins: number
  endMins: number
  appointmentId?: string
}

type BookingModalProps = {
  isOpen: boolean
  onClose: () => void
  mode: Mode
  companyId: string
  agendaId: string
  agendaName: string
  date: string                          // YYYY-MM-DD inicial
  time: string                          // HH:MM inicial
  defaultDuration: number
  allowEditDateTime?: boolean           // si true, muestra inputs de fecha/hora
  appointmentId?: string                // solo reschedule
  // v1.7: para notificación opcional al reagendar
  patientName?: string
  patientPhone?: string
  busyEvents?: BusyEvent[]              // TODAS las citas del mes (la modal filtra por su fecha)
  onSuccess: () => void
}

export default function BookingModal({
  isOpen, onClose, mode, companyId, agendaId, agendaName,
  date: initialDate, time: initialTime, defaultDuration, allowEditDateTime = false,
  appointmentId, patientName, patientPhone, busyEvents = [], onSuccess
}: BookingModalProps) {

  const [date, setDate] = useState(initialDate)
  const [time, setTime] = useState(initialTime)
  const [duration, setDuration] = useState(defaultDuration)

  const [tab, setTab] = useState<'search' | 'new'>('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<Contact[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  const [newPatient, setNewPatient] = useState({ name: '', phone: '' })
  const [notes, setNotes] = useState('')

  // v1.7: notificación opcional al paciente cuando reagendamos
  const [notifyPatient, setNotifyPatient] = useState(false)

  // Sincronizar props -> state al abrir
  useEffect(() => {
    if (isOpen) {
      setDate(initialDate)
      setTime(initialTime)
      setDuration(defaultDuration || 30)
    } else {
      setTab('search'); setSearchQuery(''); setResults([]); setSelectedContact(null)
      setNewPatient({ name: '', phone: '' }); setNotes('')
      setNotifyPatient(false)
    }
  }, [isOpen, initialDate, initialTime, defaultDuration])

  // Busqueda de contactos (solo create)
  useEffect(() => {
    if (!isOpen || mode !== 'create' || tab !== 'search') return
    const q = searchQuery.trim()
    if (q.length < 2) { setResults([]); return }
    setIsSearching(true)
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, name, phone, external_id')
        .eq('company_id', companyId)
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%,external_id.ilike.%${q}%`)
        .order('name')
        .limit(10)
      setResults(data || [])
      setIsSearching(false)
    }, 250)
    return () => clearTimeout(t)
  }, [searchQuery, tab, isOpen, companyId, mode])

  // Validación de solapamiento (recalcula al cambiar date/time/duration)
  const conflict = useMemo(() => {
    if (!time) return null
    const [h, m] = time.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return null
    const startMins = h * 60 + m
    const endMins = startMins + duration

    const dayBusy = busyEvents
      .filter(e => e.date === date)
      .filter(e => mode === 'reschedule' ? e.appointmentId !== appointmentId : true)

    return dayBusy.find(e => e.startMins < endMins && e.endMins > startMins) || null
  }, [date, time, duration, busyEvents, mode, appointmentId])

  // MUTATION
  const submitMutation = useMutation({
    mutationFn: async () => {

      // Validaciones — ahora throwean errors descriptivos en vez de bloquear el botón
      if (!date) throw new Error('Selecciona una fecha')
      if (!time) throw new Error('Selecciona una hora')

      if (mode === 'create') {
        if (tab === 'search' && !selectedContact) {
          throw new Error('Selecciona un paciente buscando arriba, o cambia a "Nuevo paciente"')
        }
        if (tab === 'new') {
          if (!newPatient.name.trim()) throw new Error('Escribe el nombre del nuevo paciente')
          if (!newPatient.phone.trim()) throw new Error('Escribe el WhatsApp del nuevo paciente')
        }
      }

      if (conflict) {
        const ch = Math.floor(conflict.startMins / 60).toString().padStart(2, '0')
        const cm = (conflict.startMins % 60).toString().padStart(2, '0')
        throw new Error(`El bloque elegido choca con la cita de las ${ch}:${cm}. Cambia la hora o reduce la duración.`)
      }

      const wField = mode === 'create' ? 'n8n_webhook_widget' : 'n8n_webhook_reschedule_appointment'
      const { data: psData, error: psErr } = await supabase.from('platform_settings').select(wField).single()
      if (psErr) {
        console.error('[BookingModal] error leyendo platform_settings', psErr)
        throw new Error(`No se pudo leer la configuración: ${psErr.message}`)
      }
      const webhookUrl = (psData as any)?.[wField]
      if (!webhookUrl) throw new Error(`Falta configurar la URL del webhook "${wField}" en Admin > Desarrollador.`)

      let body: any
      if (mode === 'create') {
        let patientName = '', patientPhone = ''
        if (tab === 'search') {
          patientName = selectedContact!.name || 'Paciente'
          patientPhone = selectedContact!.phone || selectedContact!.external_id
        } else {
          patientName = newPatient.name.trim()
          patientPhone = newPatient.phone.trim()
        }
        body = {
          agendaId, companyId,
          name: patientName, phone: patientPhone,
          notes: notes.trim(),
          date, time,
          duration_minutes: duration,
          source: 'manual_dashboard'
        }
      } else {
        if (!appointmentId) throw new Error('Falta el appointmentId')
        body = {
          appointmentId, newDate: date, newTime: time, newDuration: duration,
          notify_patient: notifyPatient,
          patient_phone: patientPhone || null,
          patient_name: patientName || null,
          old_date_label: null
        }
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!response.ok) {
        const txt = await response.text().catch(() => '')
        throw new Error(`Error del servidor (${response.status}). ${txt.slice(0, 200)}`)
      }
      return true
    },
    onSuccess: () => {
      toast.success(mode === 'create' ? 'Cita agendada correctamente' : 'Cita reagendada correctamente')
      onSuccess()
      onClose()
    },
    onError: (err: any) => {
      console.error('[BookingModal] error en submit:', err)
      toast.error(err.message || 'Error desconocido al agendar', { duration: 6000 })
    }
  })

  if (!isOpen) return null

  const title = mode === 'create' ? 'Agendar Cita Manual' : 'Reagendar Cita'
  const submitLabel = mode === 'create' ? 'Confirmar Cita' : 'Reagendar'
  const submitIcon = mode === 'create' ? <CheckCircle2 size={16} /> : <CalendarClock size={16} />

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget && !submitMutation.isPending) onClose() }}
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">

        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-black text-slate-900">{title}</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium truncate">{agendaName}</p>
          </div>
          <button onClick={onClose} disabled={submitMutation.isPending} className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors shrink-0 disabled:opacity-30">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">

          {/* Fecha y hora */}
          {allowEditDateTime || mode === 'reschedule' ? (
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2"><CalendarIcon size={12} /> Fecha</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2"><Clock size={12} /> Hora</label>
                <input
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-xl p-3 mb-5 text-sm font-medium text-slate-700 flex items-center gap-2">
              <CalendarIcon size={14} className="text-slate-400" />
              {date} a las <span className="text-blue-600 font-bold">{time}</span>
            </div>
          )}

          {/* Duración */}
          <div className="mb-5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2"><Clock size={12} /> Duración</label>
            <div className="grid grid-cols-4 gap-2">
              {[30, 60, 90, 120].map(d => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`py-2.5 rounded-xl text-sm font-bold transition-all border ${duration === d ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}
                >
                  {d} min
                </button>
              ))}
            </div>
          </div>

          {/* Alerta de conflicto */}
          {conflict && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-5 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <p className="text-sm text-rose-700 font-medium leading-relaxed">
                El bloque elegido se solapa con una cita existente. Cambia la hora o reduce la duración.
              </p>
            </div>
          )}

          {/* Paciente — solo modo create */}
          {mode === 'create' && (
            <>
              <div className="flex gap-2 mb-5 p-1 bg-slate-100 rounded-xl">
                <button onClick={() => setTab('search')} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${tab === 'search' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  <Search size={14} /> Buscar paciente
                </button>
                <button onClick={() => setTab('new')} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${tab === 'new' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  <UserPlus size={14} /> Nuevo paciente
                </button>
              </div>

              {tab === 'search' ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre o teléfono</label>
                    <div className="relative mt-2">
                      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        autoFocus
                        type="text"
                        value={searchQuery}
                        onChange={e => { setSearchQuery(e.target.value); setSelectedContact(null) }}
                        placeholder="Escribe al menos 2 letras..."
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  {searchQuery.trim().length >= 2 && (
                    <div className="max-h-56 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100">
                      {isSearching ? (
                        <div className="p-4 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
                          <Loader2 size={14} className="animate-spin" /> Buscando...
                        </div>
                      ) : results.length === 0 ? (
                        <div className="p-4 text-center">
                          <p className="text-sm text-slate-500">Sin coincidencias.</p>
                          <button
                            onClick={() => { setNewPatient({ name: searchQuery, phone: '' }); setTab('new') }}
                            className="text-xs text-blue-600 font-bold hover:underline mt-1"
                          >
                            + Crear nuevo paciente con "{searchQuery}"
                          </button>
                        </div>
                      ) : (
                        results.map(c => (
                          <button
                            key={c.id}
                            onClick={() => setSelectedContact(c)}
                            className={`w-full p-3 text-left hover:bg-slate-50 transition-colors flex items-center gap-3 ${selectedContact?.id === c.id ? 'bg-blue-50' : ''}`}
                          >
                            <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${selectedContact?.id === c.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                              {(c.name || 'P').charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-slate-900 text-sm truncate">{c.name || 'Sin nombre'}</p>
                              <p className="text-xs text-slate-500 font-mono truncate">{c.phone || c.external_id}</p>
                            </div>
                            {selectedContact?.id === c.id && <CheckCircle2 size={18} className="text-blue-600 shrink-0" />}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5"><User size={12} /> Nombre completo</label>
                    <input
                      autoFocus
                      type="text"
                      value={newPatient.name}
                      onChange={e => setNewPatient({ ...newPatient, name: e.target.value })}
                      placeholder="Ej. Juan Pérez"
                      className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5"><Phone size={12} /> WhatsApp / Teléfono</label>
                    <input
                      type="tel"
                      value={newPatient.phone}
                      onChange={e => setNewPatient({ ...newPatient, phone: e.target.value })}
                      placeholder="5219991234567"
                      className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    <p className="text-[11px] text-slate-400 mt-1.5">Con código de país, sin <code>+</code> ni espacios.</p>
                  </div>
                </div>
              )}

              <div className="mt-5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5"><MessageSquare size={12} /> Motivo (opcional)</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Breve descripción de la consulta..."
                  className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
                />
              </div>
            </>
          )}

          {mode === 'reschedule' && !conflict && (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
                <p className="text-sm text-blue-900 font-medium">La cita se moverá a esta nueva fecha y hora. Si tiene evento en Google Calendar, también se actualiza ahí.</p>
              </div>

              {/* Toggle de notificación al paciente */}
              <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${notifyPatient ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'} ${!patientPhone ? 'opacity-60' : ''}`}>
                <input
                  type="checkbox"
                  checked={notifyPatient}
                  disabled={!patientPhone}
                  onChange={e => setNotifyPatient(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <MessageCircle size={16} className={notifyPatient ? 'text-emerald-600' : 'text-slate-400'} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${notifyPatient ? 'text-emerald-900' : 'text-slate-700'}`}>
                    Avisar al paciente por WhatsApp
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {patientPhone
                      ? `Se enviará a ${patientPhone}`
                      : 'No hay teléfono registrado para este paciente.'}
                  </p>
                </div>
              </label>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
          <button onClick={onClose} disabled={submitMutation.isPending} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-40">
            Cancelar
          </button>
          <button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-black rounded-xl shadow-md disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
          >
            {submitMutation.isPending
              ? <><Loader2 size={16} className="animate-spin" /> Guardando...</>
              : <>{submitIcon} {submitLabel}</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
