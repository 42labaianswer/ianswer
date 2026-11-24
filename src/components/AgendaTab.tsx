 

'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useEntitlements } from '../hooks/useEntitlements'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Save, Calendar, CalendarPlus, CheckCircle2, ShieldAlert, ShieldCheck, Copy, Trash2, Loader2, MapPin, User, DoorOpen, Lock, ExternalLink } from 'lucide-react'
import { useConfirm } from '../hooks/useConfirm'
import { calendarVerifyUrl, defaultWeek, parseVerifyResponse, type VerifyResult } from '../lib/agendaSetup'

const NEW_LOCATION = '__new__'

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
  const { confirm, ConfirmDialog } = useConfirm()
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
  const [newLocationName, setNewLocationName] = useState('')

  // maxAgendas viene de entitlements (mergea plan + addons). Fallback a 1.
  const maxAgendas = (entitlements as any)?.capacity?.max_agendas ?? 1
  // Los selectores avanzados (multi-location, doctor, room) dependen del feature
  // flag multi_location_enabled (activado en todos los planes actuales).
  const showAdvancedTypes = !!(entitlements?.features as Record<string, any> | undefined)?.multi_location_enabled

  // 1. TANSTACK QUERY: Obtener configuraciones y dependencias
  const { data, isLoading } = useQuery({
    queryKey: ['agendasContextData', companyId],
    enabled: !!companyId, // Espera a tener el ID antes de buscar
    queryFn: async () => {
      const [platformRes, agendasRes, locRes, teamRes] = await Promise.all([
        supabase.from('platform_settings').select('google_service_account, n8n_webhook_calendar, n8n_webhook_calendar_verify').limit(1).maybeSingle(),
        supabase.from('agendas').select('*').eq('company_id', companyId).order('created_at'),
        supabase.from('locations').select('*').eq('company_id', companyId),
        supabase.from('team').select('*').eq('company_id', companyId)
      ])

      return {
        serviceAccount: platformRes.data?.google_service_account || '',
        verifyUrl: calendarVerifyUrl(platformRes.data || {}),
        agendas: (agendasRes.data as Agenda[]) || [],
        locations: locRes.data || [],
        team: teamRes.data || []
      }
    }
  })

  const { serviceAccount, verifyUrl, agendas, locations, team } = data || { serviceAccount: '', verifyUrl: '', agendas: [], locations: [], team: [] }

  const maxLocations = entitlements?.capacity?.max_locations ?? 1
  const canAddLocation = locations.length < maxLocations
  // Sin sedes no hay nada que elegir: se pide el nombre de la primera.
  const creatingLocation = canAddLocation && (locations.length === 0 || newAgenda.location_id === NEW_LOCATION)

  const verifyCalendarWithN8N = async (calendarId: string): Promise<VerifyResult> => {
    if (!verifyUrl) return { ok: false, message: 'La verificación de calendarios no está configurada. Avísale a soporte de iAnswer.' }
    try {
      const response = await fetch(verifyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calendarId: calendarId.trim() }) })
      return parseVerifyResponse(response.status, await response.text())
    } catch {
      return { ok: false, message: 'No se pudo contactar al servicio de verificación. Revisa tu conexión e intenta de nuevo.' }
    }
  }

  // 2. TANSTACK MUTATION: Crear y verificar agenda
  const createAgendaMutation = useMutation({
    mutationFn: async () => {
      let locationId = newAgenda.location_id
      let locationName = locations.find((l: any) => l.id === locationId)?.name as string | undefined
      if (showAdvancedTypes && newAgenda.type === 'location' && creatingLocation) {
        const name = newLocationName.trim()
        if (!name) throw new Error('Escribe el nombre de la sede')
        const { data: loc, error: locError } = await supabase
          .from('locations').insert([{ company_id: companyId, name }]).select('id, name').single()
        if (locError || !loc) throw new Error('No se pudo crear la sede')
        locationId = loc.id
        locationName = loc.name
      }

      // Autogenerar nombre según el tipo seleccionado
      let finalName = 'Calendario Principal'
      if (newAgenda.type === 'location' && locationId) {
        finalName = `Sede: ${locationName || 'Desconocida'}`
      } else if (newAgenda.type === 'doctor' && newAgenda.staff_id) {
        const person: any = team.find((t: any) => t.id === newAgenda.staff_id)
        finalName = `Agenda de ${person?.name || person?.full_name || 'especialista'}`
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
        location_id: newAgenda.type === 'location' && locationId ? locationId : null,
        staff_id: newAgenda.type === 'doctor' ? newAgenda.staff_id : null,
        room_name: newAgenda.type === 'room' ? newAgenda.room_name : null
      }]).select().single()

      if (error || !insertedAgenda) throw new Error("Error guardando en la Base de Datos")

      // Sin filas en working_hours el calendario marca todos los días como no laborables.
      const { error: hoursError } = await supabase.from('working_hours').insert(
        defaultWeek().map(d => ({ ...d, company_id: companyId, agenda_id: insertedAgenda.id }))
      )

      const verification = await verifyCalendarWithN8N(insertedAgenda.google_calendar_id)
      if (verification.ok) await supabase.from('agendas').update({ is_verified: true }).eq('id', insertedAgenda.id)

      return { verification, hoursSaved: !hoursError }
    },
    onSuccess: ({ verification, hoursSaved }) => {
      void queryClient.invalidateQueries({ queryKey: ['agendasContextData', companyId] })
      void queryClient.invalidateQueries({ queryKey: ['workingHours'] })
      setIsAdding(false)
      setNewAgenda({ type: 'location', google_calendar_id: '', schedule_rules: '', location_id: '', staff_id: '', room_name: '' })
      setNewLocationName('')
      if (verification.ok) toast.success('Agenda guardada y verificada')
      else toast.error(`Agenda guardada, pero sin acceso todavía. ${verification.message}`, { duration: 8000 })
      if (hoursSaved) toast.success('Le pusimos horario de lunes a viernes de 9 a 6. Puedes cambiarlo en Horarios de Atención.', { duration: 6000 })
    },
    onError: (error) => toast.error(error.message)
  })

  // Mutaciones Auxiliares (Verificar Manual y Borrar)
  const manualVerifyMutation = useMutation({
    mutationFn: async (agenda: Agenda) => {
      const verification = await verifyCalendarWithN8N(agenda.google_calendar_id)
      if (!verification.ok) throw new Error(verification.message)
      const { error } = await supabase.from('agendas').update({ is_verified: true }).eq('id', agenda.id)
      if (error) throw new Error('Google dio acceso, pero no se pudo guardar. Intenta de nuevo.')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agendasContextData', companyId] })
      toast.success('Calendario verificado')
    },
    onError: (error) => toast.error(error.message, { duration: 8000 })
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

  const handleDelete = async (id: string) => {
    if (!(await confirm('¿Seguro que deseas eliminar este calendario?', { title: 'Eliminar calendario', danger: true, confirmText: 'Eliminar' }))) return
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
            <h3 className="text-indigo-900 font-bold mb-1 flex items-center gap-2"><ShieldCheck size={18}/> ¿Cómo conectar tu calendario?</h3>
            <p className="text-sm text-indigo-700 mb-5">Son dos partes: compartir tu calendario con iAnswer desde Google y después agregarlo aquí.</p>

            <ol className="space-y-5">
              <GuideStep n={1} title="Abre Google Calendar">
                <p>
                  Entra a{' '}
                  <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" className="font-bold text-indigo-700 underline inline-flex items-center gap-1">
                    calendar.google.com <ExternalLink size={12} />
                  </a>{' '}
                  con la cuenta donde quieres recibir las citas. Te recomendamos crear un calendario solo para las citas del negocio
                  (en la barra izquierda, junto a <strong>Otros calendarios</strong>, presiona <strong>+</strong> y luego <strong>Crear calendario</strong>).
                </p>
              </GuideStep>

              <GuideStep n={2} title="Compártelo con iAnswer">
                <p>
                  En la barra izquierda, en <strong>Mis calendarios</strong>, pasa el cursor sobre el calendario, presiona los <strong>tres puntos</strong> y
                  elige <strong>Configuración y uso compartido</strong>. En <strong>Compartido con</strong> presiona <strong>Agregar personas y grupos</strong>,
                  pega este correo y en permisos elige <strong>Realizar cambios en los eventos</strong>:
                </p>
                <div className="mt-2 flex items-center gap-2 bg-white border border-indigo-200 p-2 rounded-xl">
                  <input readOnly value={serviceAccount || 'Cargando correo...'} className="flex-1 min-w-0 bg-transparent outline-none text-sm font-mono text-slate-600 px-2" />
                  <button type="button" onClick={() => { void navigator.clipboard.writeText(serviceAccount); toast.success('Correo copiado') }} className="shrink-0 px-3 py-1.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-lg text-xs font-bold flex items-center gap-2"><Copy size={14}/> Copiar</button>
                </div>
              </GuideStep>

              <GuideStep n={3} title="Copia el ID del calendario">
                <p>
                  En esa misma página baja hasta <strong>Integrar el calendario</strong> y copia el <strong>ID de calendario</strong>.
                  Si usas tu calendario principal, el ID es tu correo de Gmail.
                </p>
              </GuideStep>

              <GuideStep n={4} title="Agrégalo aquí">
                <p>Vuelve a esta página, presiona <strong>Agregar agenda</strong>, pega el ID y guarda. iAnswer revisa que tenga acceso al momento.</p>
                {!isAdding && agendas.length < maxAgendas && (
                  <button type="button" onClick={() => setIsAdding(true)} className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm">
                    <CalendarPlus size={16}/> Agregar agenda
                  </button>
                )}
              </GuideStep>
            </ol>
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
                      <div className="space-y-2">
                        {locations.length > 0 && (
                          <select required value={newAgenda.location_id} onChange={e => setNewAgenda({...newAgenda, location_id: e.target.value})} className="w-full p-3 rounded-xl border border-slate-300 bg-white font-bold text-slate-700">
                            <option value="">-- Selecciona a qué sede pertenece --</option>
                            {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                            {canAddLocation && <option value={NEW_LOCATION}>+ Crear una sede nueva</option>}
                          </select>
                        )}
                        {creatingLocation && (
                          <>
                            <input
                              type="text"
                              required
                              value={newLocationName}
                              onChange={e => setNewLocationName(e.target.value)}
                              placeholder="Ej. Sucursal Centro"
                              className="w-full p-3 rounded-xl border border-slate-300 bg-white font-bold text-slate-700"
                            />
                            <p className="text-xs text-slate-500">
                              {locations.length === 0
                                ? 'Aún no tienes sedes. Escribe el nombre de tu sucursal o local y se guardará junto con la agenda.'
                                : 'La sede nueva se guardará junto con la agenda.'}
                            </p>
                          </>
                        )}
                      </div>
                    )}
                    {newAgenda.type === 'doctor' && (
                      <select required value={newAgenda.staff_id} onChange={e => setNewAgenda({...newAgenda, staff_id: e.target.value})} className="w-full p-3 rounded-xl border border-slate-300 bg-white font-bold text-slate-700">
                        <option value="">-- Selecciona el especialista --</option>
                        {/* Se agrega fallback a full_name por si acaso */}
                        {team.map((t: any) => <option key={t.id} value={t.id}>{t.name || t.full_name}</option>)}
                      </select>
                    )}
                    {newAgenda.type === 'room' && (
                      <input type="text" required placeholder="Ej. Sala 1" value={newAgenda.room_name} onChange={e => setNewAgenda({...newAgenda, room_name: e.target.value})} className="w-full p-3 rounded-xl border border-slate-300 bg-white font-bold text-slate-700" />
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-slate-700">ID de Google Calendar</label>
                  <input type="text" required value={newAgenda.google_calendar_id} onChange={e => setNewAgenda({...newAgenda, google_calendar_id: e.target.value.trim()})} placeholder="tunegocio@gmail.com" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium" />
                  <p className="text-xs text-slate-500">Está en Google Calendar, en la configuración del calendario, sección <strong>Integrar el calendario</strong> (paso 3).</p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-slate-700">Instrucciones extra para la IA (Reglas de esta agenda)</label>
                  <textarea required value={newAgenda.schedule_rules} onChange={e => setNewAgenda({...newAgenda, schedule_rules: e.target.value})} placeholder="Ej. Solo se agendan citas por las mañanas y los sábados hasta las 2 pm." className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm min-h-[100px] resize-none" />
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
                    <span className="text-[10px] font-black tracking-widest uppercase text-slate-400 mb-1 flex items-center gap-1">
                      {agenda.type === 'location' ? <><MapPin size={11} /> Sede</> : agenda.type === 'doctor' ? <><User size={11} /> Especialista</> : <><DoorOpen size={11} /> Sala/Cuarto</>}
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
      {ConfirmDialog}
    </div>
  )
}

function GuideStep({ n, title, children }: { n: number, title: string, children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="h-7 w-7 shrink-0 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center">{n}</span>
      <div className="min-w-0 text-sm text-indigo-800 leading-relaxed">
        <p className="font-bold text-indigo-950 mb-0.5">{title}</p>
        {children}
      </div>
    </li>
  )
}
