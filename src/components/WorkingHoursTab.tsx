 

'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Clock, Save, Loader2, LayoutGrid, Calendar } from 'lucide-react'
import { defaultWeek } from '../lib/agendaSetup'
import IAnswerLoader from './IAnswerLoader'
import WorkingHoursEditor, { type WorkingHour } from './WorkingHoursEditor'


type Agenda = {
  id: string
  name: string
  type: string
}


export default function WorkingHoursTab({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient()
  
  // ?agenda= lo manda el Calendario para abrir directo la agenda sin horario.
  const agendaParam = useSearchParams()?.get('agenda') ?? ''
  const [pickedAgendaId, setSelectedAgendaId] = useState<string>(agendaParam)
  // Cambios sin guardar de la agenda en pantalla; al cambiar de agenda se descartan.
  const [draft, setDraft] = useState<{ agendaId: string, hours: WorkingHour[] } | null>(null)

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

  // Se deriva en el render (no en un useEffect) para que el primer cuadro ya
  // tenga las agendas y no parpadee el aviso de "sin agendas".
  const agendas = fetchedAgendas ?? []
  const selectedAgendaId = agendas.some(a => a.id === pickedAgendaId) ? pickedAgendaId : (agendas[0]?.id ?? '')

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
        return defaultWeek()
      }
    }
  })

  const hours = draft?.agendaId === selectedAgendaId ? draft.hours : (fetchedHours ?? [])
  const setHours = (next: WorkingHour[]) => setDraft({ agendaId: selectedAgendaId, hours: next })

  // 3. TANSTACK MUTATION: Guardar horarios
  const saveHoursMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgendaId) throw new Error("No hay agenda seleccionada")

      // Borramos los anteriores DE ESTA AGENDA
      const { error: deleteError } = await supabase.from('working_hours').delete().eq('agenda_id', selectedAgendaId)
      if (deleteError) throw deleteError
      
      // Insertamos los nuevos ligándolos a ESTA AGENDA
      const insertData = hours.map(h => ({
        day_of_week: h.day_of_week,
        start_time: h.start_time,
        end_time: h.end_time,
        has_break: h.has_break,
        break_start_time: h.break_start_time,
        break_end_time: h.break_end_time,
        slot_duration: h.slot_duration,
        is_active: h.is_active,
        company_id: companyId,
        agenda_id: selectedAgendaId
      }))
      const { error: insertError } = await supabase.from('working_hours').insert(insertData)
      if (insertError) throw insertError
    },
    onSuccess: () => {
      toast.success('Horarios guardados correctamente')
      queryClient.invalidateQueries({ queryKey: ['workingHours', selectedAgendaId] })
      // Que el calendar se entere de los nuevos horarios al instante
      queryClient.invalidateQueries({ queryKey: ['calendarSpecifics'] })
      queryClient.invalidateQueries({ queryKey: ['calendarBaseData'] })
    },
    onError: (error) => {
      console.error(error)
      toast.error('Error al guardar los horarios')
    }
  })

  if (isLoadingAgendas || (isLoadingHours && selectedAgendaId)) {
    return <div className="h-64 flex items-center justify-center"><IAnswerLoader size={32} /></div>
  }

  if (agendas.length === 0) {
    return (
      <div className="bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center">
        <Calendar size={48} className="mx-auto text-slate-300 mb-4" />
        <h3 className="text-xl font-bold text-slate-700 mb-2">Aún no hay agendas creadas</h3>
        <p className="text-slate-500">Primero ve a la pestaña "Google Calendar" para conectar un calendario. Luego podrás configurarle sus horarios aquí.</p>
      </div>
    )
  }

  return (
    <div className="animate-in fade-in duration-200">

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
          <WorkingHoursEditor hours={hours} onChange={setHours} />
        </div>
      </div>
    </div>
  )
}
