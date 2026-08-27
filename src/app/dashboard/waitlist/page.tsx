 

'use client'

import { useState, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '../../../components/WorkspaceContext'
import { usePlanFeatures } from '../../../hooks/usePlanFeatures'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  ListChecks, Plus, X, Save, Loader2, User, Phone, Calendar as CalendarIcon,
  Clock, Send, Trash2, Search, Archive, CheckCircle2, AlertCircle,
  ChevronRight, Sparkles, RefreshCw, MessageSquare, Sun, Sunset, Moon
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================
type WaitlistStatus = 'active' | 'notified' | 'accepted' | 'declined' | 'expired' | 'archived'
type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'any'

type WaitlistEntry = {
  id: string
  company_id: string
  contact_id: string
  agenda_id: string | null
  preferred_date_from: string | null
  preferred_date_to: string | null
  preferred_time_of_day: TimeOfDay
  notes: string | null
  status: WaitlistStatus
  notified_at: string | null
  notified_slot_date: string | null
  notified_slot_time: string | null
  notified_agenda_id: string | null
  expires_at: string
  created_at: string
  updated_at: string
  // Enriched
  contact_name: string | null
  contact_phone: string | null
  contact_symptoms: string | null
  contact_lifecycle_stage: string | null
  agenda_name: string | null
  days_waiting: number
}

type Contact = { id: string, name: string, phone: string }
type Agenda = { id: string, name: string }

const STATUS_LABELS: Record<WaitlistStatus, { label: string, color: string }> = {
  active:   { label: 'Activo',      color: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  notified: { label: 'Notificado',  color: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200' },
  accepted: { label: 'Aceptado',    color: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  declined: { label: 'Declinó',     color: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200' },
  expired:  { label: 'Expirado',    color: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' },
  archived: { label: 'Archivado',   color: 'bg-slate-100 text-slate-400 ring-1 ring-slate-200' }
}

const TIME_LABELS: Record<TimeOfDay, { label: string, icon: any, range: string }> = {
  morning:   { label: 'Mañana',     icon: Sun,    range: '08:00 - 12:00' },
  afternoon: { label: 'Tarde',      icon: Sunset, range: '12:00 - 17:00' },
  evening:   { label: 'Noche',      icon: Moon,   range: '17:00 - 21:00' },
  any:       { label: 'Cualquiera', icon: Clock,  range: 'Sin preferencia' }
}

// ============================================================================
// PÁGINA PRINCIPAL
// ============================================================================
export default function WaitlistPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { labels } = useWorkspace()
  const { data: features, isLoading: isLoadingFeatures } = usePlanFeatures()

  const [statusFilter, setStatusFilter] = useState<'all' | WaitlistStatus>('active')
  const [agendaFilter, setAgendaFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [creatingEntry, setCreatingEntry] = useState(false)
  const [notifyTarget, setNotifyTarget] = useState<WaitlistEntry | null>(null)

  // Profile
  const { data: profile } = useQuery({
    queryKey: ['currentUserProfile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      const { data } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      return data
    }
  })

  const companyId = profile?.company_id || ''

  // Waitlist
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['waitlist', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_waitlist_enriched')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as WaitlistEntry[]
    }
  })

  // Agendas
  const { data: agendas = [] } = useQuery({
    queryKey: ['waitlistAgendas', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase.from('agendas').select('id, name').eq('company_id', companyId)
      return (data || []) as Agenda[]
    }
  })

  // Filtered entries
  const filtered = useMemo(() => {
    let r = entries
    if (statusFilter !== 'all') r = r.filter(e => e.status === statusFilter)
    if (agendaFilter !== 'all') r = r.filter(e => e.agenda_id === agendaFilter || (agendaFilter === 'any' && !e.agenda_id))
    if (search.trim()) {
      const s = search.toLowerCase()
      r = r.filter(e => 
        (e.contact_name || '').toLowerCase().includes(s) ||
        (e.contact_phone || '').toLowerCase().includes(s) ||
        (e.notes || '').toLowerCase().includes(s)
      )
    }
    return r
  }, [entries, statusFilter, agendaFilter, search])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: entries.length }
    for (const s of Object.keys(STATUS_LABELS)) {
      c[s] = entries.filter(e => e.status === s).length
    }
    return c
  }, [entries])

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('waitlist').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Entrada eliminada')
      queryClient.invalidateQueries({ queryKey: ['waitlist'] })
    },
    onError: (e: any) => toast.error(e.message)
  })

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('waitlist').update({ status: 'archived' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Archivado')
      queryClient.invalidateQueries({ queryKey: ['waitlist'] })
    },
    onError: (e: any) => toast.error(e.message)
  })

  // ===== Guards =====
  if (isLoadingFeatures) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    )
  }
  if (!features?.crm_waitlist) {
    return (
      <div className="max-w-2xl mx-auto py-20">
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 text-white flex items-center justify-center shadow-lg mb-5">
            <ListChecks size={28} />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">Lista de espera no disponible en tu plan</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
            La lista de espera te permite registrar pacientes que quieren cita pero no hay slot, y notificarlos automáticamente cuando se libera uno por cancelación.
            Es la forma más rápida de recuperar ingresos perdidos.
          </p>
          <button onClick={() => router.push('/dashboard/plans')} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-black rounded-xl shadow-md inline-flex items-center gap-2">
            Ver planes disponibles
          </button>
        </div>
      </div>
    )
  }

  return (
<div className="px-4 md:px-8 py-4 md:py-6 space-y-4 md:space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => setCreatingEntry(true)}
          className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white text-sm font-black rounded-xl shadow-md flex items-center gap-2"
        >
          <Plus size={16} /> Agregar paciente
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Activos" value={counts.active} icon={Clock} color="blue" />
        <StatCard label="Notificados" value={counts.notified} icon={Send} color="purple" />
        <StatCard label="Aceptaron" value={counts.accepted} icon={CheckCircle2} color="emerald" />
        <StatCard label="Total" value={counts.all} icon={ListChecks} color="slate" />
      </div>

      {/* FILTROS */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text" placeholder="Buscar por nombre, teléfono o notas..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-blue-500"
          />
        </div>

        <select
          value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold cursor-pointer focus:bg-white focus:border-blue-500 outline-none"
        >
          <option value="all">Todos los estados ({counts.all})</option>
          <option value="active">Activos ({counts.active})</option>
          <option value="notified">Notificados ({counts.notified})</option>
          <option value="accepted">Aceptaron ({counts.accepted})</option>
          <option value="declined">Declinaron ({counts.declined})</option>
          <option value="expired">Expirados ({counts.expired})</option>
          <option value="archived">Archivados ({counts.archived})</option>
        </select>

        <select
          value={agendaFilter} onChange={e => setAgendaFilter(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold cursor-pointer focus:bg-white focus:border-blue-500 outline-none"
        >
          <option value="all">Todas las agendas</option>
          <option value="any">Sin agenda específica</option>
          {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {/* LISTA */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-16 text-center">
          <ListChecks size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-xl font-black text-slate-700 mb-2">
            {entries.length === 0 ? 'Aún no tienes pacientes en lista' : 'Sin resultados con estos filtros'}
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            {entries.length === 0
              ? 'Cuando un paciente quiera una cita y no tengas slot, agrégalo aquí. Te avisará cuando se libere uno.'
              : 'Ajusta los filtros o limpia la búsqueda para ver más entradas.'}
          </p>
          {entries.length === 0 && (
            <button onClick={() => setCreatingEntry(true)} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-black rounded-xl shadow-md inline-flex items-center gap-2">
              <Plus size={16} /> Agregar primer paciente
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(entry => (
            <WaitlistCard
              key={entry.id}
              entry={entry}
              onNotify={() => setNotifyTarget(entry)}
              onDelete={() => {
                if (confirm(`¿Eliminar a ${entry.contact_name} de la lista?`)) deleteMutation.mutate(entry.id)
              }}
              onArchive={() => archiveMutation.mutate(entry.id)}
              onMessage={() => router.push(`/dashboard/inbox?contactId=${entry.contact_id}`)}
            />
          ))}
        </div>
      )}

      {/* MODALES */}
      {creatingEntry && companyId && (
        <WaitlistFormModal
          companyId={companyId}
          agendas={agendas}
          onClose={() => setCreatingEntry(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['waitlist'] })
            setCreatingEntry(false)
          }}
        />
      )}

      {notifyTarget && (
        <NotifyModal
          entry={notifyTarget}
          agendas={agendas}
          onClose={() => setNotifyTarget(null)}
          onSent={() => {
            queryClient.invalidateQueries({ queryKey: ['waitlist'] })
            setNotifyTarget(null)
          }}
        />
      )}
    </div>
  )
}


// ============================================================================
// StatCard (KPI)
// ============================================================================
function StatCard({ icon: Icon, label, value, color }: { icon: any, label: string, value: number, color: string }) {
  const colorMap: Record<string, string> = {
    blue:    'bg-blue-50 text-blue-600',
    purple:  'bg-purple-50 text-purple-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    slate:   'bg-slate-50 text-slate-600'
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${colorMap[color]}`}>
          <Icon size={18} />
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-black text-slate-900 tabular-nums leading-none mt-0.5">{value}</p>
        </div>
      </div>
    </div>
  )
}


// ============================================================================
// WaitlistCard
// ============================================================================
function WaitlistCard({
  entry, onNotify, onDelete, onArchive, onMessage
}: {
  entry: WaitlistEntry
  onNotify: () => void
  onDelete: () => void
  onArchive: () => void
  onMessage: () => void
}) {
  const status = STATUS_LABELS[entry.status]
  const timeOfDay = TIME_LABELS[entry.preferred_time_of_day]
  const TimeIcon = timeOfDay.icon
  const daysWaiting = Math.floor(entry.days_waiting)

  const dateRange = (() => {
    if (entry.preferred_date_from && entry.preferred_date_to) {
      return `${formatShortDate(entry.preferred_date_from)} - ${formatShortDate(entry.preferred_date_to)}`
    }
    if (entry.preferred_date_from) return `Desde ${formatShortDate(entry.preferred_date_from)}`
    if (entry.preferred_date_to) return `Hasta ${formatShortDate(entry.preferred_date_to)}`
    return 'Sin fechas preferidas'
  })()

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-black text-slate-900 text-base truncate flex items-center gap-2">
            <User size={14} className="text-slate-400 shrink-0" />
            {entry.contact_name || 'Sin nombre'}
          </h3>
          {entry.contact_phone && (
            <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-1.5">
              <Phone size={10} /> {entry.contact_phone}
            </p>
          )}
        </div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${status.color}`}>
          {status.label}
        </span>
      </div>

      {/* Preferencias */}
      <div className="bg-slate-50 rounded-xl p-3 mb-3 border border-slate-100 space-y-1.5">
        <div className="flex items-center gap-2 text-xs">
          <CalendarIcon size={11} className="text-slate-400 shrink-0" />
          <span className="text-slate-600 font-medium">{dateRange}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <TimeIcon size={11} className="text-slate-400 shrink-0" />
          <span className="text-slate-600 font-medium">{timeOfDay.label}</span>
          <span className="text-slate-400 text-[10px]">· {timeOfDay.range}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <ListChecks size={11} className="text-slate-400 shrink-0" />
          <span className="text-slate-600 font-medium">
            {entry.agenda_name || 'Cualquier agenda'}
          </span>
        </div>
        {entry.notes && (
          <div className="pt-1.5 mt-1.5 border-t border-slate-200/60">
            <p className="text-xs text-slate-500 italic line-clamp-2">{entry.notes}</p>
          </div>
        )}
      </div>

      {/* Esperando + sintomas */}
      <div className="flex items-center justify-between mb-3 text-[11px]">
        <div className="flex items-center gap-1.5">
          <Clock size={10} className="text-amber-500" />
          <span className="font-bold text-amber-700">
            {daysWaiting === 0 ? 'Hoy' : daysWaiting === 1 ? '1 día esperando' : `${daysWaiting} días esperando`}
          </span>
        </div>
        {entry.contact_symptoms && (
          <span className="text-slate-500 italic truncate max-w-[200px]" title={entry.contact_symptoms}>
            {entry.contact_symptoms}
          </span>
        )}
      </div>

      {/* Si fue notificado, mostrar el slot */}
      {entry.status === 'notified' && entry.notified_slot_date && (
        <div className="bg-purple-50 rounded-xl p-2.5 mb-3 border border-purple-100">
          <p className="text-[10px] font-black text-purple-700 uppercase tracking-wider mb-0.5">Slot ofrecido</p>
          <p className="text-xs text-purple-900 font-bold">
            {formatShortDate(entry.notified_slot_date)} a las {entry.notified_slot_time?.slice(0, 5)}
          </p>
        </div>
      )}

      {/* Acciones */}
      <div className="flex items-center gap-1.5 pt-3 border-t border-slate-100 flex-wrap">
        {entry.status === 'active' && (
          <button
            onClick={onNotify}
            className="flex-1 text-xs font-black py-2 rounded-lg text-white bg-purple-600 hover:bg-purple-700 inline-flex items-center justify-center gap-1.5 transition-colors min-w-[100px]"
          >
            <Send size={11} /> Notificar slot
          </button>
        )}
        <button
          onClick={onMessage}
          title="Abrir chat"
          className="text-xs font-bold py-2 px-3 rounded-lg text-slate-600 hover:bg-slate-100 inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <MessageSquare size={11} />
        </button>
        {entry.status !== 'archived' && (
          <button
            onClick={onArchive}
            title="Archivar"
            className="text-xs font-bold py-2 px-3 rounded-lg text-slate-500 hover:bg-slate-100 inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            <Archive size={11} />
          </button>
        )}
        <button
          onClick={onDelete}
          title="Eliminar"
          className="text-xs font-bold py-2 px-3 rounded-lg text-rose-500 hover:bg-rose-50 inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}


// ============================================================================
// WaitlistFormModal — agregar entrada nueva
// ============================================================================
function WaitlistFormModal({
  companyId, agendas, onClose, onSaved
}: {
  companyId: string
  agendas: Agenda[]
  onClose: () => void
  onSaved: () => void
}) {
  const [contactSearch, setContactSearch] = useState('')
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [agendaId, setAgendaId] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('any')
  const [notes, setNotes] = useState('')

  // Search contacts
  const { data: contacts = [], isLoading: searchingContacts } = useQuery({
    queryKey: ['waitlistContactSearch', companyId, contactSearch],
    enabled: !!companyId && contactSearch.length >= 2 && !selectedContact,
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, name, phone')
        .eq('company_id', companyId)
        .or(`name.ilike.%${contactSearch}%,phone.ilike.%${contactSearch}%`)
        .limit(8)
      return (data || []) as Contact[]
    }
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedContact) throw new Error('Selecciona un contacto')

      const payload: any = {
        company_id: companyId,
        contact_id: selectedContact.id,
        agenda_id: agendaId || null,
        preferred_date_from: dateFrom || null,
        preferred_date_to: dateTo || null,
        preferred_time_of_day: timeOfDay,
        notes: notes.trim() || null,
        status: 'active'
      }

      const { error } = await supabase.from('waitlist').insert([payload])
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(`${selectedContact?.name} agregado a la lista`)
      onSaved()
    },
    onError: (e: any) => toast.error(e.message || 'Error al guardar')
  })

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-br from-purple-50 to-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
              <ListChecks size={18} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Agregar a lista de espera</h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">El paciente quedará pendiente hasta que se libere un slot</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-2 hover:bg-white rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Selección de contacto */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Paciente</label>
            {selectedContact ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-emerald-900">{selectedContact.name}</p>
                  <p className="text-xs text-emerald-700 font-medium">{selectedContact.phone}</p>
                </div>
                <button onClick={() => { setSelectedContact(null); setContactSearch('') }} className="text-emerald-700 hover:text-emerald-900 text-xs font-bold underline">
                  Cambiar
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Busca por nombre o teléfono..."
                    value={contactSearch}
                    onChange={e => setContactSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-purple-500"
                  />
                </div>
                {contactSearch.length >= 2 && (
                  <div className="mt-2 bg-white border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    {searchingContacts ? (
                      <div className="p-3 text-center text-xs text-slate-400">Buscando...</div>
                    ) : contacts.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-400">Sin coincidencias</div>
                    ) : (
                      contacts.map(c => (
                        <button
                          key={c.id}
                          onClick={() => setSelectedContact(c)}
                          className="w-full px-3 py-2.5 text-left hover:bg-slate-50 transition-colors flex items-center gap-3"
                        >
                          <div className="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                            <User size={13} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-slate-800 truncate">{c.name || 'Sin nombre'}</p>
                            <p className="text-[11px] text-slate-500 font-medium">{c.phone}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Agenda */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Agenda preferida</label>
            <select value={agendaId} onChange={e => setAgendaId(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-purple-500">
              <option value="">Cualquier agenda disponible</option>
              {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          {/* Fechas preferidas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Desde</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-purple-500" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Hasta</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-purple-500" />
            </div>
          </div>

          {/* Horario preferido */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Horario preferido</label>
            <div className="grid grid-cols-4 gap-2">
              {(['morning', 'afternoon', 'evening', 'any'] as TimeOfDay[]).map(t => {
                const cfg = TIME_LABELS[t]
                const Icon = cfg.icon
                const isActive = timeOfDay === t
                return (
                  <button
                    key={t}
                    onClick={() => setTimeOfDay(t)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all ${isActive ? 'bg-purple-600 border-purple-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-purple-300'}`}
                  >
                    <Icon size={16} />
                    <span className="text-[10px] font-black uppercase tracking-wider">{cfg.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Notas internas (opcional)</label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ej. prefiere mañanas pero acepta tardes si urge"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-purple-500 resize-none"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !selectedContact}
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-black rounded-xl disabled:opacity-40 flex items-center gap-2 shadow-md"
          >
            {saveMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            Agregar a lista
          </button>
        </div>
      </div>
    </div>
  )
}


// ============================================================================
// NotifyModal — notificar al paciente de un slot disponible
// ============================================================================
function NotifyModal({
  entry, agendas, onClose, onSent
}: {
  entry: WaitlistEntry
  agendas: Agenda[]
  onClose: () => void
  onSent: () => void
}) {
  const [slotDate, setSlotDate] = useState('')
  const [slotTime, setSlotTime] = useState('')
  const [slotAgenda, setSlotAgenda] = useState<string>(entry.agenda_id || '')
  const [customMessage, setCustomMessage] = useState('')

  const defaultMessage = `Hola ${entry.contact_name || ''}, ¡buenas noticias! Se acaba de liberar un espacio: ${slotDate ? new Date(slotDate + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long' }) : '[fecha]'} a las ${slotTime || '[hora]'}. ¿Lo quieres? Si me confirmas en las próximas horas, te lo reservo.`

  const notifyMutation = useMutation({
    mutationFn: async () => {
      if (!slotDate || !slotTime) throw new Error('Define fecha y hora del slot')
      const message = customMessage.trim() || defaultMessage

      // 1. Crear entrada en reminder_queue para enviar ahora
      const { error: queueError } = await supabase.from('reminder_queue').insert([{
        company_id: entry.company_id,
        contact_id: entry.contact_id,
        appointment_id: null,
        rule_id: null,
        scheduled_at: new Date().toISOString(),
        status: 'pending',
        rendered_content: message
      }])
      if (queueError) throw queueError

      // 2. Actualizar la entrada de waitlist a status 'notified'
      const { error: updateError } = await supabase.from('waitlist').update({
        status: 'notified',
        notified_at: new Date().toISOString(),
        notified_slot_date: slotDate,
        notified_slot_time: slotTime,
        notified_agenda_id: slotAgenda || null
      }).eq('id', entry.id)
      if (updateError) throw updateError
    },
    onSuccess: () => {
      toast.success(`Notificación programada a ${entry.contact_name}`)
      onSent()
    },
    onError: (e: any) => toast.error(e.message || 'Error al notificar')
  })

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-br from-emerald-50 to-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <Send size={18} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Notificar a {entry.contact_name}</h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">Avisarle por WhatsApp que se liberó un slot</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-2 hover:bg-white rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Fecha del slot</label>
              <input type="date" value={slotDate} onChange={e => setSlotDate(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-emerald-500" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Hora</label>
              <input type="time" value={slotTime} onChange={e => setSlotTime(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-emerald-500" />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Agenda</label>
            <select value={slotAgenda} onChange={e => setSlotAgenda(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-emerald-500">
              <option value="">Sin especificar</option>
              {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Mensaje (opcional, usa default si lo dejas vacío)</label>
            <textarea
              rows={5}
              value={customMessage}
              onChange={e => setCustomMessage(e.target.value)}
              placeholder={defaultMessage}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-emerald-500 resize-none"
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2.5">
            <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 font-medium">
              Al notificar marcamos la entrada como <strong>Notificado</strong>. Tú decides después si el paciente aceptó y reagendas la cita manualmente.
            </p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
          <button
            onClick={() => notifyMutation.mutate()}
            disabled={notifyMutation.isPending || !slotDate || !slotTime}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black rounded-xl disabled:opacity-40 flex items-center gap-2 shadow-md"
          >
            {notifyMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
            Enviar notificación
          </button>
        </div>
      </div>
    </div>
  )
}


// ============================================================================
// Helpers
// ============================================================================
function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}
