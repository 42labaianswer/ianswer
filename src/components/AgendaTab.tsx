 

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useEntitlements } from '../hooks/useEntitlements'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Save, Calendar, CalendarPlus, CheckCircle2, ShieldAlert, ShieldCheck, Copy, Trash2, Loader2, MapPin, User, DoorOpen, Lock } from 'lucide-react'

type Agenda = {
  id: string
  bot_id?: string
  type: 'location' | 'doctor' | 'room'
  name: string
  schedule_rules: string
  google_calendar_id: string
  is_verified: boolean
  location_id?: string
  staff_id?: string
  room_name?: string
}

export default function AgendasTab({ companyId, planSlug }: { companyId: string, planSlug: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: entitlements } = useEntitlements()
  
  const [isAdding, setIsAdding] = useState(false)
  const [newAgenda, setNewAgenda] = useState({
    type: 'location' as 'location' | 'doctor' | 'room',
    google_calendar_id: '',
    schedule_rules: '',
    location_id: '',
    staff_id: '',
    room_name: ''
  })

  // v3.0: maxAgendas viene de entitlements (mergea plan + addons). Fallback a 1.
  const maxAgendas = (entitlements as any)?.capacity?.max_agendas ?? 1
  // Para mostrar los selectores avanzados (multi-location, doctor, room) ahora dependen
  // del feature flag multi_location_enabled (que viene activado en todos los planes v3).
  const showAdvancedTypes = !!(entitlements?.features as Record<string, any> | undefined)?.multi_location_enabled

  // 1. TANSTACK QUERY: Obtener configuraciones y dependencias
  const { data, isLoading } = useQuery({
    queryKey: ['agendasContextData', companyId],
    enabled: !!companyId, // <--- EL FIX ESTRELLA: Esperamos a tener el ID antes de buscar
    queryFn: async () => {
      const [platformRes, agendasRes, locRes, teamRes] = await Promise.all([
        supabase.from('platform_settings').select('google_service_account, n8n_webhook_calendar').limit(1).maybeSingle(), // Fallback seguro
        supabase.from('agendas').select('*').eq('company_id', companyId).order('created_at'),
        supabase.from('locations').select('*').eq('company_id', companyId),
        supabase.from('team').select('*').eq('company_id', companyId)
      ])

      return {
        serviceAccount: platformRes.data?.google_service_account || '',
        webhookUrl: platformRes.data?.n8n_webhook_calendar || '',
        agendas: (agendasRes.data as Agenda[]) || [],
        locations: locRes.data || [],
        team: teamRes.data || []
      }
    }
  })

  const { serviceAccount, webhookUrl, agendas, locations, team } = data || { serviceAccount: '', webhookUrl: '', agendas: [], locations: [], team: [] }

  const verifyCalendarWithN8N = async (calendarId: string) => {
    try {
      if (!webhookUrl) return false
      const verifyUrl = webhookUrl.replace('obtener-calendario', 'verificar-calendario')
      const response = await fetch(verifyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calendarId }) })
      const text = await response.text()
      if (response.ok) {
        try { return JSON.parse(text).status === 'ok' } catch (e) { return text.includes('ok') }
      }
      return false
    } catch (error) { return false }
  }

  // 2. TANSTACK MUTATION: Crear y verificar agenda
  const createAgendaMutation = useMutation({
    mutationFn: async () => {
      // Autogenerar nombre según el tipo seleccionado
      let finalName = 'Calendario Principal'
      if (newAgenda.type === 'location' && newAgenda.location_id) {
        finalName = `Sede: ${locations.find((l: any) => l.id === newAgenda.location_id)?.name || 'Desconocida'}`
      } else if (newAgenda.type === 'doctor' && newAgenda.staff_id) {
        const doc: any = team.find((t: any) => t.id === newAgenda.staff_id)
        finalName = `Dr/a: ${doc?.name || doc?.full_name || 'Especialista'}` // <-- Doble chequeo de nombre
      } else if (newAgenda.type === 'room') {
        finalName = `Cuarto/Sala: ${newAgenda.room_name}`
      }

      const { data: insertedAgenda, error } = await supabase.from('agendas').insert([{ 
        company_id: companyId,
        is_verified: false, 
        name: finalName, 
        type: newAgenda.type, 
        google_calendar_id: newAgenda.google_calendar_id, 
        schedule_rules: newAgenda.schedule_rules,
        location_id: newAgenda.type === 'location' ? newAgenda.location_id : null,
        staff_id: newAgenda.type === 'doctor' ? newAgenda.staff_id : null,
        room_name: newAgenda.type === 'room' ? newAgenda.room_name : null
      }]).select().single()

      if (error || !insertedAgenda) throw new Error("Error guardando en la Base de Datos")

      const isVerified = await verifyCalendarWithN8N(insertedAgenda.google_calendar_id)
      if (isVerified) await supabase.from('agendas').update({ is_verified: true }).eq('id', insertedAgenda.id)

      return { isVerified }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['agendasContextData', companyId] })
      setIsAdding(false)
      setNewAgenda({ type: 'location', google_calendar_id: '', schedule_rules: '', location_id: '', staff_id: '', room_name: '' })
      if (result.isVerified) toast.success("¡Agenda guardada y verificada exitosamente!")
      else toast.error("Guardada, pero Google denegó el acceso. Verifica permisos.")
    },
    onError: (error) => toast.error(error.message)
  })

  // Mutaciones Auxiliares (Verificar Manual y Borrar)
  const manualVerifyMutation = useMutation({
    mutationFn: async (agenda: Agenda) => {
      const isVerified = await verifyCalendarWithN8N(agenda.google_calendar_id)
      if (isVerified) {
        await supabase.from('agendas').update({ is_verified: true }).eq('id', agenda.id)
        return true
      }
      throw new Error("Fallo de Verificación. Google nos denegó el acceso.")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendasContextData', companyId] })
      toast.success("¡Verificación exitosa!")
    },
    onError: (error) => toast.error(error.message)
  })

  const deleteAgendaMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('agendas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendasContextData', companyId] })
      toast.success("Calendario eliminado")
    }
  })

  const handleDelete = (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este calendario?')) return
    deleteAgendaMutation.mutate(id)
  }

  if (isLoading) return <div className="animate-pulse h-64 bg-slate-50 rounded-3xl border border-slate-100"></div>

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        
        <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar size={20} className="text-slate-400" />
            <div>
              <h2 className="text-lg font-bold text-slate-800">Agendas Inteligentes (Google Calendar)</h2>
              <p className="text-xs text-slate-500 font-medium">Plan permite ({agendas.length}/{maxAgendas}) agendas</p>
            </div>
          </div>
          <button onClick={() => setIsAdding(!isAdding)} disabled={agendas.length >= maxAgendas} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50">
            <CalendarPlus size={16}/> {isAdding ? 'Cancelar' : `Agregar Agenda`}
          </button>
        </div>

        <div className="p-8">
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 mb-8">
            <h3 className="text-indigo-900 font-bold mb-2 flex items-center gap-2"><ShieldCheck size={18}/> ¿Cómo conectar tu calendario?</h3>
            <p className="text-sm text-indigo-700 mb-4">Abre tu Google Calendar, ve a Configuración, Agregar Personas, y pega este correo dándole permiso de <strong>Realizar cambios en eventos</strong>:</p>
            <div className="flex items-center gap-2 bg-white border border-indigo-200 p-2 rounded-xl">
              <input readOnly value={serviceAccount || 'Cargando correo...'} className="flex-1 bg-transparent outline-none text-sm font-mono text-slate-600 px-2" />
              <button type="button" onClick={() => { navigator.clipboard.writeText(serviceAccount); toast.success("Copiado") }} className="px-3 py-1.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-lg text-xs font-bold flex items-center gap-2"><Copy size={14}/> Copiar</button>
            </div>
          </div>

          {isAdding && (
            <form onSubmit={(e) => { e.preventDefault(); createAgendaMutation.mutate() }} className="mb-8 p-8 bg-slate-50 border border-slate-200 rounded-3xl space-y-6 animate-in slide-in-from-top-4">
              
              {/* LÓGICA DE PLANES: Selector de Arquitectura */}
              {showAdvancedTypes && (
                <div className="space-y-4 border-b border-slate-200 pb-6">
                  <label className="text-sm font-black text-slate-800 uppercase tracking-widest">Configuración de Agenda</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className={`p-4 border-2 rounded-2xl cursor-pointer flex flex-col items-center gap-2 transition-all ${newAgenda.type === 'location' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-300'}`}>
                      <input type="radio" name="type" className="hidden" checked={newAgenda.type === 'location'} onChange={() => setNewAgenda({...newAgenda, type: 'location'})} />
                      <MapPin size={24} /> <span className="font-bold text-sm">Por Sede</span>
                    </label>
                    <label className={`p-4 border-2 rounded-2xl cursor-pointer flex flex-col items-center gap-2 transition-all ${newAgenda.type === 'doctor' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-300'}`}>
                      <input type="radio" name="type" className="hidden" checked={newAgenda.type === 'doctor'} onChange={() => setNewAgenda({...newAgenda, type: 'doctor'})} />
                      <User size={24} /> <span className="font-bold text-sm">Por Especialista</span>
                    </label>
                    {showAdvancedTypes && (
                      <label className={`p-4 border-2 rounded-2xl cursor-pointer flex flex-col items-center gap-2 transition-all ${newAgenda.type === 'room' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-300'}`}>
                        <input type="radio" name="type" className="hidden" checked={newAgenda.type === 'room'} onChange={() => setNewAgenda({...newAgenda, type: 'room'})} />
                        <DoorOpen size={24} /> <span className="font-bold text-sm">Por Sala/Cuarto</span>
                      </label>
                    )}
                  </div>

                  {/* Selectores dinámicos */}
                  <div className="pt-2">
                    {newAgenda.type === 'location' && (
                      <select required value={newAgenda.location_id} onChange={e => setNewAgenda({...newAgenda, location_id: e.target.value})} className="w-full p-3 rounded-xl border border-slate-300 bg-white font-bold text-slate-700">
                        <option value="">-- Selecciona a qué sede pertenece --</option>
                        {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    )}
                    {newAgenda.type === 'doctor' && (
                      <select required value={newAgenda.staff_id} onChange={e => setNewAgenda({...newAgenda, staff_id: e.target.value})} className="w-full p-3 rounded-xl border border-slate-300 bg-white font-bold text-slate-700">
                        <option value="">-- Selecciona el especialista --</option>
                        {/* Se agrega fallback a full_name por si acaso */}
                        {team.map((t: any) => <option key={t.id} value={t.id}>{t.name || t.full_name}</option>)}
                      </select>
                    )}
                    {newAgenda.type === 'room' && (
                      <input type="text" required placeholder="Ej. Quirófano 1" value={newAgenda.room_name} onChange={e => setNewAgenda({...newAgenda, room_name: e.target.value})} className="w-full p-3 rounded-xl border border-slate-300 bg-white font-bold text-slate-700" />
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-slate-700">ID de Google Calendar (Correo)</label>
                  <input type="text" required value={newAgenda.google_calendar_id} onChange={e => setNewAgenda({...newAgenda, google_calendar_id: e.target.value})} placeholder="clinica@gmail.com" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-slate-700">Instrucciones extra para la IA (Reglas de esta agenda)</label>
                  <textarea required value={newAgenda.schedule_rules} onChange={e => setNewAgenda({...newAgenda, schedule_rules: e.target.value})} placeholder="Ej. El Dr. solo atiende niños por las mañanas..." className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm min-h-[100px] resize-none" />
                </div>
              </div>
              
              <div className="flex justify-end pt-4">
                <button type="submit" disabled={createAgendaMutation.isPending} className="bg-slate-900 text-white px-8 py-3 rounded-xl text-sm font-black shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center gap-2">
                  {createAgendaMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Guardar Calendario y Verificar
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {agendas.map((agenda) => (
              <div key={agenda.id} className={`p-6 border-2 rounded-2xl flex flex-col gap-4 transition-colors ${agenda.is_verified ? 'bg-white border-emerald-100 hover:border-emerald-300 shadow-sm' : 'bg-rose-50 border-rose-200'}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-black tracking-widest uppercase text-slate-400 mb-1 block">
                      {agenda.type === 'location' ? '📍 Sede' : agenda.type === 'doctor' ? '👨‍⚕️ Especialista' : '🚪 Sala/Cuarto'}
                    </span>
                    <h3 className="font-bold text-slate-900 text-xl">{agenda.name}</h3>
                  </div>
                  {agenda.is_verified ? <CheckCircle2 size={24} className="text-emerald-500" /> : <ShieldAlert size={24} className="text-rose-500" />}
                </div>
                
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-xs text-slate-500 font-mono break-all">{agenda.google_calendar_id}</p>
                </div>

                <div className="mt-auto flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  {!agenda.is_verified && (
                    <button onClick={() => manualVerifyMutation.mutate(agenda)} disabled={manualVerifyMutation.isPending} className="text-rose-600 font-bold text-xs hover:underline flex items-center gap-1">
                      {manualVerifyMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Verificar Acceso'}
                    </button>
                  )}
                  <button onClick={() => handleDelete(agenda.id)} disabled={deleteAgendaMutation.isPending} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}
