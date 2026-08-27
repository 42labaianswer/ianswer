 

'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Clock, Save, Coffee, Loader2, LayoutGrid, Calendar } from 'lucide-react'

type WorkingHour = {
  day_of_week: number
  start_time: string
  end_time: string
  has_break: boolean
  break_start_time: string
  break_end_time: string
  slot_duration: number
  is_active: boolean
  agenda_id?: string
}

type Agenda = {
  id: string
  name: string
  type: string
}

const DAYS_OF_WEEK = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DEFAULT_HOURS = { start_time: '09:00', end_time: '18:00', slot_duration: 30, has_break: false, break_start_time: '13:00', break_end_time: '14:00' }

export default function WorkingHoursTab({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient()
  
  const [agendas, setAgendas] = useState<Agenda[]>([])
  const [selectedAgendaId, setSelectedAgendaId] = useState<string>('')
  const [hours, setHours] = useState<WorkingHour[]>([])

  // 1. TANSTACK QUERY: Obtener Agendas Disponibles
  const { data: fetchedAgendas, isLoading: isLoadingAgendas } = useQuery({
    queryKey: ['agendasList', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from('agendas').select('id, name, type').eq('company_id', companyId).order('created_at')
      if (error) throw error
      return (data as Agenda[]) || []
    }
  })

  // Setear agenda por defecto
  useEffect(() => {
    if (fetchedAgendas) {
      setAgendas(fetchedAgendas)
      if (fetchedAgendas.length > 0 && !selectedAgendaId) {
        setSelectedAgendaId(fetchedAgendas[0].id)
      }
    }
  }, [fetchedAgendas, selectedAgendaId])

  // 2. TANSTACK QUERY: Obtener horarios de LA AGENDA SELECCIONADA
  const { data: fetchedHours, isLoading: isLoadingHours } = useQuery({
    queryKey: ['workingHours', selectedAgendaId],
    enabled: !!selectedAgendaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('working_hours')
        .select('*')
        .eq('agenda_id', selectedAgendaId)
        .order('day_of_week', { ascending: true })
      
      if (error) throw error

      if (data && data.length > 0) {
        return data as WorkingHour[]
      } else {
        // Generar defaults si esta agenda no tiene horarios aún
        return DAYS_OF_WEEK.map((_, i) => ({
          day_of_week: i,
          start_time: DEFAULT_HOURS.start_time,
          end_time: DEFAULT_HOURS.end_time,
          has_break: DEFAULT_HOURS.has_break,
          break_start_time: DEFAULT_HOURS.break_start_time,
          break_end_time: DEFAULT_HOURS.break_end_time,
          slot_duration: DEFAULT_HOURS.slot_duration,
          is_active: i > 0 && i < 6
        }))
      }
    }
  })

  useEffect(() => {
    if (fetchedHours) setHours(fetchedHours)
  }, [fetchedHours])

  // 3. TANSTACK MUTATION: Guardar horarios
  const saveHoursMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgendaId) throw new Error("No hay agenda seleccionada")

      // Borramos los anteriores DE ESTA AGENDA
      const { error: deleteError } = await supabase.from('working_hours').delete().eq('agenda_id', selectedAgendaId)
      if (deleteError) throw deleteError
      
      // Insertamos los nuevos ligándolos a ESTA AGENDA
      const insertData = hours.map(h => ({ 
        ...h, 
        company_id: companyId,
        agenda_id: selectedAgendaId 
      }))
      const { error: insertError } = await supabase.from('working_hours').insert(insertData)
      if (insertError) throw insertError
    },
    onSuccess: () => {
      toast.success('Horarios guardados correctamente')
      queryClient.invalidateQueries({ queryKey: ['workingHours', selectedAgendaId] })
      // FIX v1.6.2: que el calendar se entere de los nuevos horarios al instante
      queryClient.invalidateQueries({ queryKey: ['calendarSpecifics'] })
      queryClient.invalidateQueries({ queryKey: ['calendarBaseData'] })
    },
    onError: (error) => {
      console.error(error)
      toast.error('Error al guardar los horarios')
    }
  })

  const updateDay = (dayIndex: number, field: keyof WorkingHour, value: any) => {
    setHours(prev => prev.map(h => h.day_of_week === dayIndex ? { ...h, [field]: value } : h))
  }

  const updateAllDurations = (duration: number) => {
    setHours(prev => prev.map(h => ({ ...h, slot_duration: duration })))
  }

  if (isLoadingAgendas || (isLoadingHours && selectedAgendaId)) {
    return <div className="animate-pulse h-64 bg-slate-50 rounded-3xl border border-slate-100"></div>
  }

  if (agendas.length === 0) {
    return (
      <div className="bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center animate-in fade-in">
        <Calendar size={48} className="mx-auto text-slate-300 mb-4" />
        <h3 className="text-xl font-bold text-slate-700 mb-2">Aún no hay agendas creadas</h3>
        <p className="text-slate-500">Primero ve a la pestaña "Agendas (Calendar)" para crear un calendario. Luego podrás configurarle sus horarios aquí.</p>
      </div>
    )
  }

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      
      {agendas.length > 1 && (
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
          <div className="flex items-center gap-3">
            <LayoutGrid size={20} className="text-blue-500" />
            <div>
              <p className="text-sm font-bold text-slate-800">Selecciona la agenda a configurar</p>
              <p className="text-xs text-slate-500 font-medium">Cada sede, sala o especialista puede tener sus propios horarios.</p>
            </div>
          </div>
          <select 
            value={selectedAgendaId} 
            onChange={e => setSelectedAgendaId(e.target.value)}
            className="w-full md:w-auto px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none text-sm font-black text-slate-700 shadow-sm cursor-pointer"
          >
            {agendas.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <Clock size={20} className="text-slate-400 shrink-0" />
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                Horarios: <span className="text-blue-600">{agendas.find(a => a.id === selectedAgendaId)?.name}</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">Define los bloques en los que la IA agendará citas.</p>
            </div>
          </div>
          <button 
            onClick={() => saveHoursMutation.mutate()} 
            disabled={saveHoursMutation.isPending} 
            className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-70"
          >
            {saveHoursMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <><Save size={16}/> Guardar Cambios</>}
          </button>
        </div>

        <div className="p-8">
          <div className="mb-6 pb-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm font-bold text-slate-700">Duración de cada cita (aplica para todos los días)</p>
            <select 
              value={hours[1]?.slot_duration || 30} 
              onChange={(e) => updateAllDurations(Number(e.target.value))}
              className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={15}>15 Minutos</option>
              <option value={20}>20 Minutos</option>
              <option value={30}>30 Minutos</option>
              <option value={45}>45 Minutos</option>
              <option value={60}>1 Hora</option>
            </select>
          </div>

          <div className="space-y-3">
            {hours.map((day) => (
              <div key={day.day_of_week} className={`flex flex-col p-4 rounded-xl border transition-all ${day.is_active ? 'bg-white border-blue-100 shadow-sm' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 w-48">
                    <input 
                      type="checkbox" 
                      checked={day.is_active} 
                      onChange={(e) => updateDay(day.day_of_week, 'is_active', e.target.checked)}
                      className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="font-bold text-sm text-slate-700 uppercase tracking-wide">{DAYS_OF_WEEK[day.day_of_week]}</span>
                  </div>
                  
                  <div className="flex items-center gap-3 opacity-100 transition-opacity flex-wrap" style={{ opacity: day.is_active ? 1 : 0.5 }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400">DE</span>
                      <input type="time" disabled={!day.is_active} value={day.start_time} onChange={(e) => updateDay(day.day_of_week, 'start_time', e.target.value)} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400">A</span>
                      <input type="time" disabled={!day.is_active} value={day.end_time} onChange={(e) => updateDay(day.day_of_week, 'end_time', e.target.value)} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold" />
                    </div>
                  </div>
                </div>

                {day.is_active && (
                  <div className="mt-3 pt-3 border-t border-slate-50 flex flex-col md:flex-row md:items-center gap-4 md:pl-[3.25rem]">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-500 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={day.has_break} 
                        onChange={(e) => updateDay(day.day_of_week, 'has_break', e.target.checked)}
                        className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                      />
                      <Coffee size={14} className={day.has_break ? "text-orange-500" : "text-slate-400"} />
                      Añadir Descanso / Comida
                    </label>
                    
                    {day.has_break && (
                      <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400">INICIA</span>
                          <input type="time" value={day.break_start_time} onChange={(e) => updateDay(day.day_of_week, 'break_start_time', e.target.value)} className="px-2 py-1 bg-orange-50 border border-orange-200 rounded text-xs outline-none focus:ring-1 focus:ring-orange-500 font-bold text-orange-800" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400">TERMINA</span>
                          <input type="time" value={day.break_end_time} onChange={(e) => updateDay(day.day_of_week, 'break_end_time', e.target.value)} className="px-2 py-1 bg-orange-50 border border-orange-200 rounded text-xs outline-none focus:ring-1 focus:ring-orange-500 font-bold text-orange-800" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
