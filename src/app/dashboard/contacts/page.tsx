 

'use client'

import { useState, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useWorkspace } from '../../../components/WorkspaceContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Users, Plus, Search, Edit2, Trash2, X, Save,
  Bot, Phone, Stethoscope, ClipboardList, Building2, Filter, Loader2,
  UploadCloud, FileType, CheckCircle2, History, Calendar as CalendarIcon, UserCircle,
  Activity, MessageSquare, Sparkles, CalendarPlus,
  SlidersHorizontal, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, Power, PowerOff,
  Clock, LayoutGrid, List, CheckSquare, Square, Download, UserCog, Lock,
  Share2, ExternalLink, Tag, Wand2
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import UnifiedActivityTimeline from '../../../components/UnifiedActivityTimeline'
import BookingModal from '../../../components/BookingModal'
import ContactKanban from '../../../components/ContactKanban'
import TasksTab from '../../../components/TasksTab'
import { usePlanFeatures } from '../../../hooks/usePlanFeatures'
import { useConfirm } from '../../../hooks/useConfirm'

type LifecycleStage = 'new_lead' | 'hot_lead' | 'payment' | 'customer'

type EnrichedContact = {
  id: string
  company_id: string
  name: string
  phone: string
  external_id: string
  ai_active: boolean
  lifecycle_stage: LifecycleStage
  symptoms: string
  notes: string
  gender?: string
  birth_date?: string
  staff_id?: string
  created_at: string
  last_inbound_at?: string | null
  days_since_inbound?: number | null
  next_appointment?: { id: string, date: string, time: string, status: string, agenda_id: string } | null
  first_visit_at?: string | null
  last_visit_at?: string | null
  total_appointments: number
  completed_appointments: number
  cancelled_appointments: number
  no_show_appointments: number
  total_messages: number
  inbound_messages: number
  reminders_sent: number
  reminders_confirmed: number
  reminders_cancelled: number
  // v2.8: referidos
  referral_source?: ReferralSource | null
  referred_by_contact_id?: string | null
}

type ReferralSource = 'patient' | 'doctor' | 'google' | 'facebook' | 'instagram' | 'direct' | 'event' | 'other'

const REFERRAL_LABELS: Record<ReferralSource, { label: string, icon_name: string, color: string }> = {
  patient:   { label: 'Otro paciente',     icon_name: 'Users',     color: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  doctor:    { label: 'Otro médico',       icon_name: 'UserCog',   color: 'bg-blue-50 text-blue-700 ring-blue-200' },
  google:    { label: 'Google',            icon_name: 'Search',    color: 'bg-amber-50 text-amber-700 ring-amber-200' },
  facebook:  { label: 'Facebook',          icon_name: 'MessageSquare', color: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  instagram: { label: 'Instagram',         icon_name: 'MessageSquare', color: 'bg-pink-50 text-pink-700 ring-pink-200' },
  direct:    { label: 'Recomendación directa', icon_name: 'Sparkles', color: 'bg-purple-50 text-purple-700 ring-purple-200' },
  event:     { label: 'Evento/feria',      icon_name: 'Calendar',  color: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  other:     { label: 'Otra fuente',       icon_name: 'Sparkles',  color: 'bg-slate-50 text-slate-700 ring-slate-200' }
}

type Company = { id: string, name: string }
type TeamMember = { id: string, name: string, company_id: string }
type Agenda = { id: string, name: string }
type SortKey = 'name' | 'created_at' | 'last_inbound_at' | 'next_appointment' | 'total_appointments'
type Temperature = 'activo' | 'reciente' | 'pausado' | 'inactivo' | 'sin_datos'

const formatWhatsAppPhone = (rawPhone: string) => {
  let clean = rawPhone.replace(/\D/g, '')
  if (clean.length === 10) clean = '521' + clean
  return clean
}

const calculateAge = (dateString?: string | null) => {
  if (!dateString) return null
  const today = new Date()
  const birthDate = new Date(dateString)
  let age = today.getFullYear() - birthDate.getFullYear()
  const m = today.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
  return age
}

const getTemperature = (days?: number | null): Temperature => {
  if (days === null || days === undefined) return 'sin_datos'
  if (days < 1) return 'activo'
  if (days < 7) return 'reciente'
  if (days < 30) return 'pausado'
  return 'inactivo'
}

const temperatureStyle: Record<Temperature, { label: string, color: string, icon: any }> = {
  activo:    { label: 'Activo',       color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  reciente:  { label: 'Reciente',     color: 'bg-blue-100 text-blue-700 border-blue-200',           icon: Clock },
  pausado:   { label: 'Pausado',      color: 'bg-amber-100 text-amber-700 border-amber-200',         icon: Clock },
  inactivo:  { label: 'Inactivo',     color: 'bg-slate-200 text-slate-600 border-slate-300',        icon: Clock },
  sin_datos: { label: 'Sin contacto', color: 'bg-slate-100 text-slate-500 border-slate-200',         icon: Clock }
}

const formatRelativeTime = (timestamp?: string | null): string => {
  if (!timestamp) return 'Sin actividad'
  const diff = (Date.now() - new Date(timestamp).getTime()) / 1000
  if (diff < 60) return 'Ahora mismo'
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`
  if (diff < 604800) return `Hace ${Math.floor(diff / 86400)} días`
  if (diff < 2592000) return `Hace ${Math.floor(diff / 604800)} semanas`
  return `Hace ${Math.floor(diff / 2592000)} meses`
}

const formatNextAppointment = (next?: any): { label: string, isSoon: boolean } | null => {
  if (!next) return null
  const date = new Date(`${next.date}T${next.time}`)
  const now = new Date()
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const diffHours = (date.getTime() - now.getTime()) / (1000 * 60 * 60)
  const isSoon = diffHours < 24

  if (date.toDateString() === today.toDateString()) return { label: `Hoy ${next.time.slice(0, 5)}`, isSoon: true }
  if (date.toDateString() === tomorrow.toDateString()) return { label: `Mañana ${next.time.slice(0, 5)}`, isSoon: true }
  return {
    label: `${date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} ${next.time.slice(0, 5)}`,
    isSoon
  }
}

// v2.5: formato corto para fechas de primera/última visita
const formatVisitDate = (dateStr?: string | null): string => {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })
}

export default function ContactsPage() {
  const { confirm, ConfirmDialog } = useConfirm()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { labels, primaryTemplate: vertical, isLoadingWorkspace } = useWorkspace()
  const { data: features } = usePlanFeatures()

  const [searchTerm, setSearchTerm] = useState('')
  const [stageFilter, setStageFilter] = useState<'all' | LifecycleStage>('all')
  const [staffFilter, setStaffFilter] = useState<'all' | 'unassigned' | string>('all')
  const [activityFilter, setActivityFilter] = useState<'all' | Temperature>('all')
  const [upcomingFilter, setUpcomingFilter] = useState<'all' | 'with' | 'without'>('all')
  const [botFilter, setBotFilter] = useState<'all' | 'on' | 'off'>('all')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [sortBy, setSortBy] = useState<SortKey>('last_inbound_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'info' | 'history' | 'tasks'>('info')
  const [editingContact, setEditingContact] = useState<EnrichedContact | null>(null)

  // v2.2: vista tabla o kanban
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table')

  // v2.2: bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importStep, setImportStep] = useState<1 | 2>(1)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvData, setCsvData] = useState<string[][]>([])
  const [importMapping, setImportMapping] = useState({ name: '', phone: '' })
  const [importCompanyId, setImportCompanyId] = useState('')

  const [bookingAgendaId, setBookingAgendaId] = useState<string | null>(null)
  const [agendaPickerOpen, setAgendaPickerOpen] = useState(false)
  const [bookingContact, setBookingContact] = useState<EnrichedContact | null>(null)

  const [formData, setFormData] = useState({
    phone: '', name: '', company_id: '', lifecycle_stage: 'new_lead' as LifecycleStage,
    ai_active: true, symptoms: '', notes: '', gender: '', birth_date: '', staff_id: '',
    // v2.8: referidos
    referral_source: '' as ReferralSource | '',
    referred_by_contact_id: ''
  })

  const { data: userProfile } = useQuery({
    queryKey: ['currentUserProfile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      const { data } = await supabase.from('profiles').select('company_id, id').eq('id', user.id).single()
      return data
    }
  })
  const userCompanyId = userProfile?.company_id
  const userId = userProfile?.id

  const { data: contactsList = [], isLoading: isLoadingContacts } = useQuery({
    queryKey: ['contactsEnriched', userCompanyId],
    enabled: !!userCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_contacts_enriched').select('*').eq('company_id', userCompanyId)
      if (error) throw error
      return (data as EnrichedContact[]) || []
    }
  })

  // v2.9: Tags y assignments (solo si feature activa)
  const { data: allTags = [] } = useQuery({
    queryKey: ['allTags', userCompanyId],
    enabled: !!userCompanyId && !!features?.crm_tags_visual,
    queryFn: async () => {
      const { data } = await supabase
        .from('tags')
        .select('id, name, color, ai_aware')
        .eq('company_id', userCompanyId)
        .order('display_order', { ascending: true })
      return (data || []) as Array<{ id: string, name: string, color: string, ai_aware: boolean }>
    }
  })

  const { data: tagAssignments = [] } = useQuery({
    queryKey: ['tagAssignments', userCompanyId],
    enabled: !!userCompanyId && !!features?.crm_tags_visual,
    queryFn: async () => {
      // Trae todas las asignaciones de tags para los contactos de esta compañía
      const { data } = await supabase
        .from('contact_tags')
        .select('contact_id, tag_id, contacts!inner(company_id)')
        .eq('contacts.company_id', userCompanyId)
      return (data || []) as Array<{ contact_id: string, tag_id: string }>
    }
  })

  // Helper para obtener tags asignadas a un contacto
  const getContactTags = (contactId: string) => {
    const assignedTagIds = tagAssignments.filter(a => a.contact_id === contactId).map(a => a.tag_id)
    return allTags.filter(t => assignedTagIds.includes(t.id))
  }

  const { data: companies = [], isLoading: isLoadingCompanies } = useQuery({
    queryKey: ['companiesData', userCompanyId],
    enabled: !!userCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id, name').eq('id', userCompanyId)
      return (data as Company[]) || []
    }
  })

  const { data: team = [], isLoading: isLoadingTeam } = useQuery({
    queryKey: ['teamData', userCompanyId],
    enabled: !!userCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from('team').select('id, name:full_name, company_id').eq('company_id', userCompanyId)
      return (data as TeamMember[]) || []
    }
  })

  const { data: agendas = [] } = useQuery({
    queryKey: ['agendasForContacts', userCompanyId],
    enabled: !!userCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from('agendas').select('id, name').eq('company_id', userCompanyId)
      return (data as Agenda[]) || []
    }
  })

  const saveContactMutation = useMutation({
    mutationFn: async () => {
      const formattedPhone = formatWhatsAppPhone(formData.phone)
      const payload = {
        name: formData.name,
        company_id: formData.company_id || userCompanyId,
        lifecycle_stage: formData.lifecycle_stage,
        ai_active: formData.ai_active,
        symptoms: formData.symptoms,
        notes: formData.notes,
        gender: formData.gender || null,
        birth_date: formData.birth_date || null,
        staff_id: formData.staff_id || null,
        // v2.8: referidos
        referral_source: formData.referral_source || null,
        referred_by_contact_id: formData.referral_source === 'patient' ? (formData.referred_by_contact_id || null) : null
      }
      if (editingContact) {
        const { error } = await supabase.from('contacts').update(payload).eq('id', editingContact.id)
        if (error) throw error
      } else {
        // El id NO puede ser el teléfono: es único en toda la plataforma, así
        // que dos empresas distintas no podrían tener al mismo cliente. El
        // teléfono vive en `external_id`, que es por lo que n8n y `messages`
        // enlazan. Mismo criterio que useContactsForOrder y que el nodo
        // "4. Crear Contacto" de n8n.
        const { error } = await supabase.from('contacts').insert([{
          id: crypto.randomUUID(), phone: formattedPhone, external_id: formattedPhone,
          ...payload, platform: 'whatsapp', status: 'lead'
        }])
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editingContact ? 'Ficha actualizada' : 'Contacto añadido')
      queryClient.invalidateQueries({ queryKey: ['contactsEnriched'] })
      closeModal()
    },
    onError: () => toast.error('Hubo un error. Verifica que el número no exista.')
  })

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contacts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Contacto eliminado')
      queryClient.invalidateQueries({ queryKey: ['contactsEnriched'] })
    }
  })

  const toggleBotMutation = useMutation({
    mutationFn: async ({ id, ai_active }: { id: string, ai_active: boolean }) => {
      const { error } = await supabase.from('contacts').update({ ai_active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contactsEnriched'] })
  })

  const updateStageMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string, stage: LifecycleStage }) => {
      const { error } = await supabase.from('contacts').update({ lifecycle_stage: stage, stage_updated_by: 'human' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Etapa actualizada')
      queryClient.invalidateQueries({ queryKey: ['contactsEnriched'] })
    }
  })

  // v2.2: BULK mutations
  const bulkUpdateStage = useMutation({
    mutationFn: async ({ ids, stage }: { ids: string[], stage: LifecycleStage }) => {
      const { error } = await supabase.from('contacts').update({ lifecycle_stage: stage, stage_updated_by: 'human' }).in('id', ids)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      toast.success(`${vars.ids.length} contactos actualizados`)
      queryClient.invalidateQueries({ queryKey: ['contactsEnriched'] })
      setSelectedIds(new Set())
    }
  })

  const bulkUpdateStaff = useMutation({
    mutationFn: async ({ ids, staff_id }: { ids: string[], staff_id: string | null }) => {
      const { error } = await supabase.from('contacts').update({ staff_id }).in('id', ids)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      toast.success(`${vars.ids.length} contactos asignados`)
      queryClient.invalidateQueries({ queryKey: ['contactsEnriched'] })
      setSelectedIds(new Set())
    }
  })

  const bulkToggleBot = useMutation({
    mutationFn: async ({ ids, ai_active }: { ids: string[], ai_active: boolean }) => {
      const { error } = await supabase.from('contacts').update({ ai_active }).in('id', ids)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      toast.success(`Bot ${vars.ai_active ? 'activado' : 'pausado'} en ${vars.ids.length} contactos`)
      queryClient.invalidateQueries({ queryKey: ['contactsEnriched'] })
      setSelectedIds(new Set())
    }
  })

  const importContactsMutation = useMutation({
    mutationFn: async () => {
      const nameIndex = csvHeaders.indexOf(importMapping.name)
      const phoneIndex = csvHeaders.indexOf(importMapping.phone)
      if (phoneIndex === -1) throw new Error('Selecciona la columna de teléfono.')
      const recordsToInsert = csvData.flatMap(row => {
        const rawPhone = row[phoneIndex] || ''
        const formattedPhone = formatWhatsAppPhone(rawPhone)
        if (!formattedPhone) return []
        return [{
          id: crypto.randomUUID(), phone: formattedPhone, external_id: formattedPhone,
          name: nameIndex !== -1 && row[nameIndex] ? row[nameIndex] : 'Sin Nombre',
          company_id: importCompanyId, lifecycle_stage: 'new_lead',
          ai_active: true, platform: 'whatsapp', status: 'lead'
        }]
      })
      if (recordsToInsert.length === 0) throw new Error('No se encontraron teléfonos válidos.')

      // Antes esto hacía upsert con onConflict: 'id' e ignoreDuplicates. Como
      // el id era el teléfono —único en toda la plataforma— un contacto que ya
      // existía EN OTRA EMPRESA se saltaba en silencio y nunca se importaba.
      // Ahora se deduplica dentro de la empresa, por (company_id, external_id).
      const telefonos = recordsToInsert.map(r => r.external_id)
      const { data: existentes, error: lookupError } = await supabase
        .from('contacts')
        .select('external_id')
        .eq('company_id', importCompanyId)
        .in('external_id', telefonos)
      if (lookupError) throw lookupError

      const yaExisten = new Set((existentes || []).map((c: any) => c.external_id))
      const nuevos = recordsToInsert.filter(r => !yaExisten.has(r.external_id))
      if (nuevos.length === 0) return 0

      const { error } = await supabase.from('contacts').insert(nuevos)
      if (error) throw error
      return nuevos.length
    },
    onSuccess: (count) => {
      toast.success(count === 0
        ? 'Todos los contactos del archivo ya existían'
        : `Se importaron ${count} contactos`)
      queryClient.invalidateQueries({ queryKey: ['contactsEnriched'] })
      closeImportModal()
    },
    onError: (e: any) => toast.error(e.message || 'Error al importar')
  })

  const stageLabels = {
    new_lead: { label: vertical?.funnels?.new_lead || 'Nuevo Lead',          color: 'bg-blue-100 text-blue-700 ring-blue-200' },
    hot_lead: { label: vertical?.funnels?.hot_lead || 'Interesado',          color: 'bg-orange-100 text-orange-700 ring-orange-200' },
    payment:  { label: vertical?.funnels?.payment  || 'En Proceso',          color: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
    customer: { label: vertical?.funnels?.customer || labels?.client || 'Cliente', color: 'bg-purple-100 text-purple-700 ring-purple-200' }
  }

  const kpis = useMemo(() => {
    const total = contactsList.length
    const activeWeek = contactsList.filter(c => c.days_since_inbound !== null && c.days_since_inbound !== undefined && c.days_since_inbound < 7).length
    const cold = contactsList.filter(c => {
      const t = getTemperature(c.days_since_inbound)
      return t === 'pausado' || t === 'inactivo'
    }).length
    const withUpcoming = contactsList.filter(c => c.next_appointment).length
    return { total, activeWeek, cold, withUpcoming }
  }, [contactsList])

  const filteredContacts = useMemo(() => {
    let result = contactsList

    if (searchTerm.trim()) {
      const s = searchTerm.trim().toLowerCase()
      result = result.filter(c =>
        c.name?.toLowerCase().includes(s) ||
        c.phone?.includes(s) ||
        c.id?.includes(s)
      )
    }
    if (stageFilter !== 'all') result = result.filter(c => c.lifecycle_stage === stageFilter)
    if (staffFilter === 'unassigned') result = result.filter(c => !c.staff_id)
    else if (staffFilter !== 'all') result = result.filter(c => c.staff_id === staffFilter)
    if (activityFilter !== 'all') result = result.filter(c => getTemperature(c.days_since_inbound) === activityFilter)
    if (upcomingFilter === 'with') result = result.filter(c => !!c.next_appointment)
    else if (upcomingFilter === 'without') result = result.filter(c => !c.next_appointment)
    if (botFilter === 'on') result = result.filter(c => c.ai_active)
    else if (botFilter === 'off') result = result.filter(c => !c.ai_active)

    result = [...result].sort((a, b) => {
      let av: any, bv: any
      switch (sortBy) {
        case 'name':              av = (a.name || '').toLowerCase(); bv = (b.name || '').toLowerCase(); break
        case 'created_at':        av = a.created_at; bv = b.created_at; break
        case 'last_inbound_at':   av = a.last_inbound_at || '0000'; bv = b.last_inbound_at || '0000'; break
        case 'next_appointment':
          av = a.next_appointment ? `${a.next_appointment.date}T${a.next_appointment.time}` : 'zzz'
          bv = b.next_appointment ? `${b.next_appointment.date}T${b.next_appointment.time}` : 'zzz'
          break
        case 'total_appointments': av = a.total_appointments; bv = b.total_appointments; break
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [contactsList, searchTerm, stageFilter, staffFilter, activityFilter, upcomingFilter, botFilter, sortBy, sortDir])

  const isLoadingAll = isLoadingContacts || isLoadingCompanies || isLoadingTeam || isLoadingWorkspace

  const handleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortDir('desc') }
  }

  const openModal = (contact?: EnrichedContact) => {
    setActiveTab('info')
    if (contact) {
      setEditingContact(contact)
      setFormData({
        phone: contact.id, name: contact.name || '',
        company_id: contact.company_id || userCompanyId || '',
        lifecycle_stage: contact.lifecycle_stage || 'new_lead',
        ai_active: contact.ai_active ?? true,
        symptoms: contact.symptoms || '', notes: contact.notes || '',
        gender: contact.gender || '', birth_date: contact.birth_date || '',
        staff_id: contact.staff_id || '',
        referral_source: (contact.referral_source || '') as ReferralSource | '',
        referred_by_contact_id: contact.referred_by_contact_id || ''
      })
    } else {
      setEditingContact(null)
      setFormData({
        phone: '', name: '', company_id: userCompanyId || '',
        lifecycle_stage: 'new_lead', ai_active: true,
        symptoms: '', notes: '', gender: '', birth_date: '', staff_id: '',
        referral_source: '', referred_by_contact_id: ''
      })
    }
    setIsModalOpen(true)
  }

  const closeModal = () => { setIsModalOpen(false); setEditingContact(null) }
  const closeImportModal = () => {
    setIsImportModalOpen(false); setImportStep(1)
    setCsvHeaders([]); setCsvData([])
    setImportMapping({ name: '', phone: '' })
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = (evt.target?.result as string) || ''
      const lines = text.split('\n').filter(l => l.trim())
      if (lines.length < 2) return toast.error('CSV vacío')
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
      const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')))
      setCsvHeaders(headers); setCsvData(rows)
      setImportCompanyId(userCompanyId || '')
      setImportStep(2)
    }
    reader.readAsText(file)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.phone || !formData.name) return toast.error('Nombre y teléfono son obligatorios')
    saveContactMutation.mutate()
  }

  const handleDelete = async (id: string) => {
    if (await confirm('¿Eliminar este contacto? No se puede deshacer.', { title: 'Eliminar contacto', danger: true, confirmText: 'Eliminar' })) deleteContactMutation.mutate(id)
  }

  // v2.2: Exportar CSV de los seleccionados
  const handleExportCSV = () => {
    const ids = Array.from(selectedIds)
    const rows = contactsList.filter(c => ids.includes(c.id))
    if (rows.length === 0) return toast.error('Nada que exportar')

    const headers = ['nombre', 'telefono', 'etapa', 'asignado_a', 'ultima_actividad', 'proxima_cita', 'total_citas', 'bot_activo']
    const lines = rows.map(c => {
      const assigned = team.find(t => t.id === c.staff_id)?.name || ''
      const next = c.next_appointment ? `${c.next_appointment.date} ${c.next_appointment.time.slice(0,5)}` : ''
      const last = c.last_inbound_at ? new Date(c.last_inbound_at).toLocaleString('es-MX') : ''
      const fields = [c.name || '', c.phone || '', c.lifecycle_stage, assigned, last, next, c.total_appointments, c.ai_active ? 'sí' : 'no']
      return fields.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',')
    })
    const csv = [headers.join(','), ...lines].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contactos_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`${rows.length} contactos exportados`)
  }

  // v2.2: Selección bulk
  const toggleSelect = (id: string) => {
    setSelectedIds(s => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const selectAll = () => setSelectedIds(new Set(filteredContacts.map(c => c.id)))
  const clearSelection = () => setSelectedIds(new Set())

  return (
<div className="px-4 md:px-8 py-4 md:py-6 space-y-4 md:space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <button onClick={() => setIsImportModalOpen(true)} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-2">
          <UploadCloud size={14} /> Importar CSV
        </button>
        <button onClick={() => openModal()} className="px-5 py-2.5 rounded-xl text-sm font-black bg-slate-900 hover:bg-slate-800 text-white shadow-md flex items-center gap-2">
          <Plus size={16} /> Nuevo contacto
        </button>
      </div>

      {features?.crm_kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
          <KPICard icon={Users} color="blue" label="Total" value={kpis.total} sub={`${labels?.clients?.toLowerCase() || 'clientes'} registrados`} />
          <KPICard icon={Activity} color="emerald" label="Activos esta semana" value={kpis.activeWeek} sub={`${Math.round((kpis.activeWeek / Math.max(1, kpis.total)) * 100)}% del total`} />
          <KPICard icon={Clock} color="amber" label="Por reactivar" value={kpis.cold} sub="Sin actividad +7 días" />
          <KPICard icon={CalendarIcon} color="purple" label="Con cita próxima" value={kpis.withUpcoming} sub="Agendados" />
        </div>
      )}

      {/* Búsqueda - siempre arriba en mobile, completa */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
        <div className="pl-3 text-slate-400 shrink-0"><Search size={18} /></div>
        <input type="text" placeholder="Buscar por nombre o teléfono..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full py-2 pr-4 bg-transparent outline-none text-sm font-medium text-slate-900" />
      </div>

      {/* Fila de filtros - scrollea horizontal en móvil si no cabe */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
        <div className="bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-2 shrink-0">
          <div className="pl-2 text-slate-400"><Filter size={14} /></div>
          <select value={stageFilter} onChange={e => setStageFilter(e.target.value as any)} className="py-1.5 pr-3 bg-transparent outline-none text-xs font-bold text-slate-700 cursor-pointer">
            <option value="all">Todas las etapas</option>
            <option value="new_lead">{stageLabels.new_lead.label}</option>
            <option value="hot_lead">{stageLabels.hot_lead.label}</option>
            <option value="payment">{stageLabels.payment.label}</option>
            <option value="customer">{stageLabels.customer.label}</option>
          </select>
        </div>
        {features?.crm_advanced_filters && (
          <button onClick={() => setShowAdvancedFilters(s => !s)} className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all whitespace-nowrap ${showAdvancedFilters ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
            <SlidersHorizontal size={12} /> Filtros avanzados
          </button>
        )}
        {features?.crm_kanban && (
          <div className="bg-white border border-slate-200 rounded-xl p-1 flex items-center shadow-sm shrink-0">
            <button
              onClick={() => setViewMode('table')}
              title="Vista Tabla"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${viewMode === 'table' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <List size={12} /> Tabla
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              title="Vista Kanban"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${viewMode === 'kanban' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <LayoutGrid size={12} /> Kanban
            </button>
          </div>
        )}
      </div>

      {showAdvancedFilters && features?.crm_advanced_filters && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Asignado a</label>
            <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none">
              <option value="all">Todos</option>
              <option value="unassigned">Sin asignar</option>
              {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Última actividad</label>
            <select value={activityFilter} onChange={e => setActivityFilter(e.target.value as any)} className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none">
              <option value="all">Cualquiera</option>
              <option value="activo">Activo (hoy)</option>
              <option value="reciente">Reciente (esta semana)</option>
              <option value="pausado">Pausado (+7 días)</option>
              <option value="inactivo">Inactivo (+30 días)</option>
              <option value="sin_datos">Sin contacto</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Próxima cita</label>
            <select value={upcomingFilter} onChange={e => setUpcomingFilter(e.target.value as any)} className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none">
              <option value="all">Todos</option>
              <option value="with">Con cita próxima</option>
              <option value="without">Sin cita próxima</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Bot IA</label>
            <select value={botFilter} onChange={e => setBotFilter(e.target.value as any)} className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none">
              <option value="all">Todos</option>
              <option value="on">Bot activo</option>
              <option value="off">Bot pausado</option>
            </select>
          </div>
        </div>
      )}

      {/* v2.2: Barra BULK ACTIONS - aparece cuando hay seleccionados Y tiene feature */}
      {selectedIds.size > 0 && features?.crm_bulk_actions && (
        <div className="bg-slate-900 text-white rounded-2xl px-5 py-3 flex flex-wrap items-center gap-3 shadow-lg sticky top-4 z-30 animate-in slide-in-from-top-4">
          <div className="flex items-center gap-2">
            <CheckSquare size={16} />
            <p className="text-sm font-black">{selectedIds.size} seleccionados</p>
          </div>
          <div className="h-5 w-px bg-white/20" />
          {/* Asignar staff */}
          <div className="relative group">
            <button className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 flex items-center gap-1.5">
              <UserCog size={12} /> Asignar a <ChevronDown size={10} />
            </button>
            <div className="absolute left-0 top-full mt-1 bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-200 overflow-hidden min-w-[180px] hidden group-hover:block z-40">
              <button onClick={() => bulkUpdateStaff.mutate({ ids: Array.from(selectedIds), staff_id: null })} className="w-full px-3 py-2 text-xs font-bold text-left hover:bg-slate-50">Sin asignar</button>
              {team.map(t => (
                <button
                  key={t.id}
                  onClick={() => bulkUpdateStaff.mutate({ ids: Array.from(selectedIds), staff_id: t.id })}
                  className="w-full px-3 py-2 text-xs font-bold text-left hover:bg-slate-50"
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          {/* Cambiar etapa */}
          <div className="relative group">
            <button className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 flex items-center gap-1.5">
              <Sparkles size={12} /> Cambiar etapa <ChevronDown size={10} />
            </button>
            <div className="absolute left-0 top-full mt-1 bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-200 overflow-hidden min-w-[180px] hidden group-hover:block z-40">
              {(['new_lead', 'hot_lead', 'payment', 'customer'] as LifecycleStage[]).map(stage => (
                <button
                  key={stage}
                  onClick={() => bulkUpdateStage.mutate({ ids: Array.from(selectedIds), stage })}
                  className="w-full px-3 py-2 text-xs font-bold text-left hover:bg-slate-50"
                >
                  {stageLabels[stage].label}
                </button>
              ))}
            </div>
          </div>
          {/* Bot */}
          <button
            onClick={() => bulkToggleBot.mutate({ ids: Array.from(selectedIds), ai_active: true })}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 flex items-center gap-1.5"
          >
            <Power size={12} /> Activar bot
          </button>
          <button
            onClick={() => bulkToggleBot.mutate({ ids: Array.from(selectedIds), ai_active: false })}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 flex items-center gap-1.5"
          >
            <PowerOff size={12} /> Pausar bot
          </button>
          {/* Exportar */}
          {features?.crm_export_csv && (
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 flex items-center gap-1.5"
            >
              <Download size={12} /> Exportar CSV
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={selectAll} className="text-xs font-bold text-slate-300 hover:text-white">Todos ({filteredContacts.length})</button>
            <button onClick={clearSelection} className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10" title="Limpiar selección">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* v2.2: Renderizar Tabla O Kanban. Si no hay feature Kanban → siempre tabla */}
      {(viewMode === 'kanban' && features?.crm_kanban) ? (
        isLoadingAll ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-20 flex justify-center">
            <Loader2 className="animate-spin text-slate-400" />
          </div>
        ) : (
          <ContactKanban
            contacts={filteredContacts}
            team={team}
            funnels={vertical?.funnels}
            onContactClick={openModal}
            onMoveContact={(id, newStage) => updateStageMutation.mutate({ id, stage: newStage })}
            onOpenChat={(id) => router.push(`/dashboard/inbox?contactId=${id}`)}
          />
        )
      ) : (
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
        {isLoadingAll ? (
          <div className="flex flex-col items-center justify-center h-[400px] gap-3">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando contactos...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="text-left text-xs font-black text-slate-400 uppercase tracking-[0.1em] bg-slate-50 border-b border-slate-100">
                  {features?.crm_bulk_actions && (
                    <th className="px-4 py-5 w-10">
                      <button
                        onClick={() => selectedIds.size === filteredContacts.length ? clearSelection() : selectAll()}
                        className="text-slate-400 hover:text-slate-700 transition-colors"
                      >
                        {selectedIds.size === filteredContacts.length && filteredContacts.length > 0 ? (
                          <CheckSquare size={16} className="text-blue-600" />
                        ) : (
                          <Square size={16} />
                        )}
                      </button>
                    </th>
                  )}
                  {features?.crm_sortable_columns ? (
                    <SortableTh label={labels?.client || 'Cliente'} sortKey="name" current={sortBy} dir={sortDir} onClick={handleSort} />
                  ) : (
                    <th className="px-6 py-5">{labels?.client || 'Cliente'}</th>
                  )}
                  <th className="px-6 py-5">Etapa</th>
                  {features?.crm_extra_columns && <th className="px-6 py-5">Actividad</th>}
                  {features?.crm_extra_columns && (
                    features?.crm_sortable_columns
                      ? <SortableTh label="Próxima cita" sortKey="next_appointment" current={sortBy} dir={sortDir} onClick={handleSort} />
                      : <th className="px-6 py-5">Próxima cita</th>
                  )}
                  {features?.crm_extra_columns && (
                    features?.crm_sortable_columns
                      ? <SortableTh label="Citas" sortKey="total_appointments" current={sortBy} dir={sortDir} onClick={handleSort} />
                      : <th className="px-6 py-5">Citas</th>
                  )}
                  <th className="px-6 py-5">Asignado</th>
                  <th className="px-6 py-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredContacts.length === 0 ? (
                  <tr>
                    <td colSpan={
                      (features?.crm_bulk_actions ? 1 : 0) +
                      3 + // Cliente, Etapa, Asignado
                      1 + // Acciones
                      (features?.crm_extra_columns ? 3 : 0)
                    } className="px-6 py-16 text-center text-slate-500 font-medium">
                      No se encontraron {labels?.clients?.toLowerCase() || 'clientes'} con esos criterios.
                    </td>
                  </tr>
                ) : (
                  filteredContacts.map(p => (
                    <ContactRow
                      key={p.id}
                      contact={p}
                      team={team}
                      stageLabels={stageLabels}
                      features={features}
                      contactTags={getContactTags(p.id)}
                      isSelected={selectedIds.has(p.id)}
                      onToggleSelect={() => toggleSelect(p.id)}
                      onRowClick={() => openModal(p)}
                      onOpenChat={() => router.push(`/dashboard/inbox?contactId=${p.id}`)}
                      onEdit={() => openModal(p)}
                      onDelete={() => handleDelete(p.id)}
                      onToggleBot={() => toggleBotMutation.mutate({ id: p.id, ai_active: !p.ai_active })}
                      onChangeStage={(newStage: LifecycleStage) => updateStageMutation.mutate({ id: p.id, stage: newStage })}
                      isDeleting={deleteContactMutation.isPending && deleteContactMutation.variables === p.id}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* MODAL FICHA */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={closeModal}>
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col md:flex-row max-h-[92vh] relative" onClick={e => e.stopPropagation()}>
            <button onClick={closeModal} className="absolute top-4 right-4 z-50 text-slate-400 hover:text-slate-700 bg-white/80 backdrop-blur-md rounded-full p-2 border border-slate-200 shadow-sm transition-all hover:scale-105">
              <X size={18} />
            </button>

            <div className="w-full md:w-72 bg-slate-50 border-r border-slate-200 flex flex-col shrink-0">
              <div className="p-6 border-b border-slate-200">
                <h3 className="font-black text-slate-900 leading-tight">Ficha CRM</h3>
                <p className="text-xs font-medium text-slate-500 mt-1 truncate">{formData.name || 'Nuevo Registro'}</p>
                {editingContact && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                      <Phone size={11} /> {editingContact.phone}
                    </div>
                    {editingContact.last_inbound_at && (
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                        <Clock size={11} /> {formatRelativeTime(editingContact.last_inbound_at)}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {editingContact && (
                <>
                  <div className="px-6 py-4 border-b border-slate-200 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Citas</p>
                      <p className="text-lg font-black text-slate-900">{editingContact.total_appointments}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Completadas</p>
                      <p className="text-lg font-black text-emerald-600">{editingContact.completed_appointments}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Canceladas</p>
                      <p className="text-lg font-black text-rose-600">{editingContact.cancelled_appointments}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Mensajes</p>
                      <p className="text-lg font-black text-slate-900">{editingContact.total_messages}</p>
                    </div>
                  </div>

                  {/* v2.5: Primera y última visita */}
                  {(editingContact.first_visit_at || editingContact.last_visit_at) && (
                    <div className="px-6 py-4 border-b border-slate-200 space-y-2.5">
                      {editingContact.first_visit_at && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-medium flex items-center gap-1.5">
                            <CalendarIcon size={11} /> Primera visita
                          </span>
                          <span className="font-black text-slate-800 tabular-nums capitalize">
                            {formatVisitDate(editingContact.first_visit_at)}
                          </span>
                        </div>
                      )}
                      {editingContact.last_visit_at && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-medium flex items-center gap-1.5">
                            <Clock size={11} /> Última visita
                          </span>
                          <span className="font-black text-emerald-700 tabular-nums capitalize">
                            {formatVisitDate(editingContact.last_visit_at)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <nav className="p-3 space-y-1">
                <button onClick={() => setActiveTab('info')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'info' ? 'bg-white shadow-sm border border-slate-200 text-blue-700' : 'text-slate-600 hover:bg-slate-200/50'}`}>
                  <UserCircle size={18} /> Información
                </button>
                {features?.crm_unified_timeline && (
                  <button onClick={() => setActiveTab('history')} disabled={!editingContact} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${!editingContact ? 'opacity-50 cursor-not-allowed text-slate-400' : activeTab === 'history' ? 'bg-white shadow-sm border border-slate-200 text-blue-700' : 'text-slate-600 hover:bg-slate-200/50'}`}>
                    <Activity size={18} /> Actividad
                  </button>
                )}
                {features?.crm_tasks && (
                  <button onClick={() => setActiveTab('tasks')} disabled={!editingContact} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${!editingContact ? 'opacity-50 cursor-not-allowed text-slate-400' : activeTab === 'tasks' ? 'bg-white shadow-sm border border-slate-200 text-blue-700' : 'text-slate-600 hover:bg-slate-200/50'}`}>
                    <CheckSquare size={18} /> Tareas
                  </button>
                )}
              </nav>

              {editingContact && (
                <div className="mt-auto p-3 space-y-1 border-t border-slate-200">
                  <button onClick={() => router.push(`/dashboard/inbox?contactId=${editingContact.id}`)} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200/50 transition-all">
                    <MessageSquare size={16} /> Abrir chat
                  </button>
                  {features?.crm_book_from_contact && (
                    <button
                      onClick={() => {
                        if (!editingContact) return
                        if (agendas.length === 0) {
                          toast.error('No tienes agendas configuradas')
                          return
                        }
                        setBookingContact(editingContact)
                        setIsModalOpen(false)
                        if (agendas.length === 1) {
                          setBookingAgendaId(agendas[0].id)
                        } else {
                          setAgendaPickerOpen(true)
                        }
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold text-emerald-700 hover:bg-emerald-50 transition-all"
                    >
                      <CalendarPlus size={16} /> Agendar cita
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 flex flex-col overflow-hidden bg-white">
              {activeTab === 'info' && (
                <div className="flex-1 overflow-y-auto p-6 md:p-8 pt-12 md:pt-8">
                  <form id="contactForm" onSubmit={handleSave} className="space-y-8">
                    <div>
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2"><UserCircle size={16} className="text-slate-400" /> Datos personales</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre completo</label>
                          <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full mt-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">WhatsApp</label>
                          <input type="text" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} disabled={!!editingContact} className="w-full mt-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Género</label>
                          <select value={formData.gender} onChange={e => setFormData({ ...formData, gender: e.target.value })} className="w-full mt-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-blue-500">
                            <option value="">No especifica</option>
                            <option value="M">Hombre</option>
                            <option value="F">Mujer</option>
                            <option value="O">Otro</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha de nacimiento</label>
                          <input type="date" value={formData.birth_date} onChange={e => setFormData({ ...formData, birth_date: e.target.value })} className="w-full mt-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-blue-500" />
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2"><ClipboardList size={16} className="text-slate-400" /> CRM</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Etapa</label>
                          <select value={formData.lifecycle_stage} onChange={e => setFormData({ ...formData, lifecycle_stage: e.target.value as LifecycleStage })} className="w-full mt-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-blue-500">
                            <option value="new_lead">{stageLabels.new_lead.label}</option>
                            <option value="hot_lead">{stageLabels.hot_lead.label}</option>
                            <option value="payment">{stageLabels.payment.label}</option>
                            <option value="customer">{stageLabels.customer.label}</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{labels?.staff || 'Asignado a'}</label>
                          <select value={formData.staff_id} onChange={e => setFormData({ ...formData, staff_id: e.target.value })} className="w-full mt-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-blue-500">
                            <option value="">Sin asignar</option>
                            {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <label className="flex items-center gap-3 mt-5 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                        <input type="checkbox" checked={formData.ai_active} onChange={e => setFormData({ ...formData, ai_active: e.target.checked })} className="h-4 w-4 rounded text-blue-600" />
                        <div>
                          <p className="text-sm font-bold text-slate-900 flex items-center gap-2"><Bot size={14} /> Bot IA activo</p>
                          <p className="text-[11px] text-slate-500">Cuando esté activo, la IA responderá automáticamente.</p>
                        </div>
                      </label>
                    </div>

                    <div>
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Stethoscope size={16} className="text-blue-500" /> Memoria del médico
                      </h4>
                      <div className="space-y-4">
                        {/* Motivo de consulta — destacado */}
                        <div className="bg-blue-50/40 border border-blue-100 rounded-2xl p-4">
                          <label className="text-xs font-black text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                            <Stethoscope size={12} /> Motivo de consulta
                          </label>
                          <p className="text-[10px] text-blue-600/80 font-medium mt-0.5 mb-2">
                            ¿Por qué vino este paciente? Lo verás al inicio de cada conversación.
                          </p>
                          <textarea
                            rows={2}
                            value={formData.symptoms}
                            onChange={e => setFormData({ ...formData, symptoms: e.target.value })}
                            placeholder="Ej. dolor de rodilla derecha, revisión anual, seguimiento post-cirugía..."
                            className="w-full px-3 py-2 bg-white border border-blue-200 rounded-xl text-sm font-medium outline-none focus:border-blue-500 resize-none"
                          />
                        </div>

                        {/* Notas internas — solo médico */}
                        <div className="bg-amber-50/40 border border-amber-100 rounded-2xl p-4">
                          <label className="text-xs font-black text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                            <Lock size={11} /> Notas internas del médico
                          </label>
                          <p className="text-[10px] text-amber-700/80 font-medium mt-0.5 mb-2">
                            Solo tu equipo lo ve. El paciente NO ve esto. Apunta lo que te ayuda recordar.
                          </p>
                          <textarea
                            rows={3}
                            value={formData.notes}
                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Ej. paciente muy ansioso, responder con calma. Diabetes, verificar ayuno. Referido por el Dr. Pérez..."
                            className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-sm font-medium outline-none focus:border-amber-500 resize-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* v2.9: Etiquetas */}
                    {features?.crm_tags_visual && editingContact && (
                      <div>
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <Tag size={16} className="text-purple-500" /> Etiquetas
                        </h4>
                        <p className="text-xs text-slate-500 font-medium mb-3">
                          Clasifica al paciente para filtrar, agrupar y (en plan premium) que el bot las considere.
                        </p>
                        <ContactTagsPicker
                          contactId={editingContact.id}
                          allTags={allTags}
                        />
                      </div>
                    )}

                    {/* v2.8: Tracking de referidos */}
                    {features?.crm_referral_tracking && (
                      <div>
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <Share2 size={16} className="text-emerald-500" /> ¿Cómo llegó este paciente?
                        </h4>
                        <p className="text-xs text-slate-500 font-medium mb-3">
                          Con el tiempo descubrirás qué canales te traen más pacientes y a quién cuidar extra bien.
                        </p>
                        <ReferralSourcePicker
                          value={formData.referral_source}
                          referredByContactId={formData.referred_by_contact_id}
                          onChange={(source, referredBy) => setFormData({
                            ...formData,
                            referral_source: source,
                            referred_by_contact_id: referredBy
                          })}
                          companyId={userCompanyId || ''}
                          currentContactId={editingContact?.id || ''}
                        />

                        {/* Pacientes que ESTE contacto trajo */}
                        {editingContact && (
                          <BroughtContactsSection contactId={editingContact.id} />
                        )}
                      </div>
                    )}
                  </form>
                </div>
              )}

              {activeTab === 'history' && editingContact && (
                <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50/50 pt-12 md:pt-8">
                  <h4 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><Activity size={20} className="text-slate-400" /> Línea de tiempo</h4>
                  <UnifiedActivityTimeline patientId={editingContact.id} />
                </div>
              )}

              {activeTab === 'tasks' && editingContact && userCompanyId && userId && (
                <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50/50 pt-12 md:pt-8">
                  <TasksTab contactId={editingContact.id} companyId={userCompanyId} userId={userId} />
                </div>
              )}

              <div className="p-5 border-t border-slate-200 bg-white flex gap-3 shrink-0">
                <button type="button" onClick={closeModal} className="px-6 py-3 bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm">
                  Cerrar
                </button>
                {activeTab === 'info' && (
                  <button type="submit" form="contactForm" disabled={saveContactMutation.isPending} className="flex-1 px-4 py-3 text-white font-bold rounded-xl transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-70 shadow-lg" style={{ backgroundColor: vertical?.accent_color || '#0f172a' }}>
                    {saveContactMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <><Save size={16} /> Guardar</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PICKER de agenda — solo si hay varias, sin pop-up sobre pop-up */}
      {agendaPickerOpen && bookingContact && agendas.length > 1 && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => { setAgendaPickerOpen(false); setBookingContact(null) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900 text-base">¿En qué agenda?</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Para {bookingContact.name || 'el paciente'}</p>
              </div>
              <button
                onClick={() => { setAgendaPickerOpen(false); setBookingContact(null) }}
                className="text-slate-400 hover:text-slate-700 p-2 hover:bg-slate-100 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-3 space-y-1">
              {agendas.map(a => (
                <button
                  key={a.id}
                  onClick={() => {
                    setBookingAgendaId(a.id)
                    setAgendaPickerOpen(false)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all text-left"
                >
                  <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <CalendarIcon size={16} />
                  </div>
                  <span className="flex-1">{a.name}</span>
                  <CalendarPlus size={14} className="text-slate-300" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL Agendar — usa bookingContact, no editingContact (que ya cerramos) */}
      {bookingAgendaId && bookingContact && (() => {
        const selectedAgenda = agendas.find(a => a.id === bookingAgendaId)
        if (!selectedAgenda) return null
        const today = new Date()
        const yyyy = today.getFullYear()
        const mm = String(today.getMonth() + 1).padStart(2, '0')
        const dd = String(today.getDate()).padStart(2, '0')
        return (
          <BookingModal
            isOpen={!!bookingAgendaId}
            onClose={() => { setBookingAgendaId(null); setBookingContact(null) }}
            mode="create"
            companyId={bookingContact.company_id}
            agendaId={selectedAgenda.id}
            agendaName={selectedAgenda.name}
            date={`${yyyy}-${mm}-${dd}`}
            time="12:00"
            defaultDuration={30}
            allowEditDateTime={true}
            appointmentId={undefined}
            patientName={bookingContact.name}
            patientPhone={bookingContact.phone}
            busyEvents={[]}
            onSuccess={() => {
              setBookingAgendaId(null)
              setBookingContact(null)
              toast.success('Cita agendada')
              queryClient.invalidateQueries({ queryKey: ['contactsEnriched'] })
            }}
          />
        )
      })()}

      {/* MODAL CSV */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={closeImportModal}>
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2 text-lg"><UploadCloud className="text-blue-600" /> Importar CSV</h3>
              <button onClick={closeImportModal} className="text-slate-400 hover:text-slate-700 bg-white p-1 rounded-full border border-slate-200 shadow-sm"><X size={16} /></button>
            </div>
            <div className="p-8">
              {importStep === 1 && (
                <div className="space-y-6">
                  <p className="text-center text-slate-500 text-sm">Sube un archivo .csv con tu base de datos actual.</p>
                  <div className="border-2 border-dashed border-blue-200 rounded-3xl bg-blue-50/30 p-10 flex flex-col items-center text-center">
                    <FileType size={48} className="text-blue-400 mb-4" />
                    <p className="font-bold text-slate-700 mb-1">Selecciona un .CSV</p>
                    <label className="cursor-pointer bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md hover:bg-blue-700 transition-colors mt-4">
                      Seleccionar archivo
                      <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                    </label>
                  </div>
                </div>
              )}
              {importStep === 2 && (
                <div className="space-y-6">
                  <div className="bg-emerald-50 text-emerald-700 p-4 rounded-2xl flex items-start gap-3 border border-emerald-100">
                    <CheckCircle2 className="shrink-0 mt-0.5" size={18} />
                    <div>
                      <p className="font-bold text-sm">¡Archivo leído!</p>
                      <p className="text-xs mt-1 opacity-80">{csvData.length} contactos detectados.</p>
                    </div>
                  </div>
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Columna Teléfono *</label>
                      <select value={importMapping.phone} onChange={e => setImportMapping({ ...importMapping, phone: e.target.value })} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none text-sm font-bold">
                        <option value="">Selecciona...</option>
                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Columna Nombre</label>
                      <select value={importMapping.name} onChange={e => setImportMapping({ ...importMapping, name: e.target.value })} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none text-sm font-bold">
                        <option value="">Ignorar</option>
                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                  <button onClick={() => importContactsMutation.mutate()} disabled={importContactsMutation.isPending || !importMapping.phone} className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-black rounded-xl flex items-center justify-center gap-2">
                    {importContactsMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <><UploadCloud size={16} /> Importar {csvData.length}</>}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {ConfirmDialog}
    </div>
  )
}

function KPICard({ icon: Icon, color, label, value, sub }: any) {
  const map: any = {
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-600' },
    purple:  { bg: 'bg-purple-50',  text: 'text-purple-600' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
    rose:    { bg: 'bg-rose-50',    text: 'text-rose-600' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-600' },
    slate:   { bg: 'bg-slate-100',  text: 'text-slate-600' }
  }
  const c = map[color] || map.slate    // fallback seguro
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
      <div className={`h-11 w-11 rounded-xl ${c.bg} ${c.text} flex items-center justify-center shrink-0`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-black text-slate-900 leading-tight">{value}</p>
        <p className="text-[11px] text-slate-500 font-medium truncate">{sub}</p>
      </div>
    </div>
  )
}

function SortableTh({ label, sortKey, current, dir, onClick }: { label: string, sortKey: SortKey, current: SortKey, dir: 'asc' | 'desc', onClick: (k: SortKey) => void }) {
  const isActive = current === sortKey
  return (
    <th className="px-6 py-5">
      <button onClick={() => onClick(sortKey)} className={`flex items-center gap-1.5 uppercase tracking-[0.1em] hover:text-slate-700 transition-colors ${isActive ? 'text-slate-700' : 'text-slate-400'}`}>
        {label}
        {isActive ? (dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={10} className="opacity-40" />}
      </button>
    </th>
  )
}

function ContactRow({
  contact, team, stageLabels, features, contactTags, isSelected, onToggleSelect, onRowClick, onOpenChat, onEdit, onDelete, onToggleBot, onChangeStage, isDeleting
}: any) {
  const assignedStaff = team.find((t: TeamMember) => t.id === contact.staff_id)?.name
  const age = calculateAge(contact.birth_date)
  const temp = getTemperature(contact.days_since_inbound)
  const tempStyle = temperatureStyle[temp]
  const TempIcon = tempStyle.icon
  const next = formatNextAppointment(contact.next_appointment)
  const [stageOpen, setStageOpen] = useState(false)
  const tags = (contactTags || []) as Array<{ id: string, name: string, color: string, ai_aware: boolean }>

  return (
    <tr className={`group hover:bg-slate-50/50 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50/40' : ''}`} onClick={onRowClick}>
      {features?.crm_bulk_actions && (
        <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
          <button onClick={onToggleSelect} className="text-slate-400 hover:text-blue-600 transition-colors">
            {isSelected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
          </button>
        </td>
      )}
      <td className="px-6 py-4">
        <div className="font-bold text-slate-900 flex items-center gap-2">
          {contact.name || 'Sin Nombre'}
          {!contact.ai_active && (
            <span title="Bot pausado"><PowerOff size={11} className="text-rose-400" /></span>
          )}
        </div>
        <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1"><Phone size={10} /> {contact.phone}</span>
          {contact.gender && <span>• {contact.gender === 'M' ? 'Hombre' : contact.gender === 'F' ? 'Mujer' : 'Otro'}</span>}
          {age !== null && <span>• {age} años</span>}
        </div>
        {contact.symptoms && contact.symptoms.trim() && (
          <div className="mt-1.5 flex items-start gap-1.5">
            <Stethoscope size={11} className="text-blue-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-slate-600 font-medium leading-snug line-clamp-1" title={contact.symptoms}>
              {contact.symptoms}
            </p>
          </div>
        )}
        {tags.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1 flex-wrap">
            {tags.slice(0, 4).map(t => (
              <span
                key={t.id}
                className="text-[9px] font-black px-1.5 py-0.5 rounded text-white inline-flex items-center gap-0.5 shadow-sm"
                style={{ backgroundColor: t.color }}
                title={t.ai_aware ? `${t.name} (lee el bot)` : t.name}
              >
                {t.ai_aware && <Wand2 size={7} />}
                {t.name}
              </span>
            ))}
            {tags.length > 4 && (
              <span className="text-[9px] font-bold text-slate-400">+{tags.length - 4}</span>
            )}
          </div>
        )}
      </td>
      <td className="px-6 py-4 relative" onClick={e => e.stopPropagation()}>
        {features?.crm_inline_stage_change ? (
          <>
            <button onClick={() => setStageOpen(o => !o)} className={`px-3 py-1 rounded-full text-xs font-bold ring-1 inline-flex items-center gap-1 hover:opacity-80 ${stageLabels[contact.lifecycle_stage]?.color || 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
              {stageLabels[contact.lifecycle_stage]?.label || contact.lifecycle_stage}
              <ChevronDown size={11} />
            </button>
            {stageOpen && (
              <div className="absolute z-20 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden min-w-[160px]">
                {Object.entries(stageLabels).map(([key, val]: any) => (
                  <button
                    key={key}
                    onClick={() => { onChangeStage(key as LifecycleStage); setStageOpen(false) }}
                    className={`w-full px-3 py-2 text-xs font-bold text-left hover:bg-slate-50 ${contact.lifecycle_stage === key ? 'bg-slate-100' : ''}`}
                  >
                    {val.label}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <span className={`px-3 py-1 rounded-full text-xs font-bold ring-1 inline-flex items-center ${stageLabels[contact.lifecycle_stage]?.color || 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
            {stageLabels[contact.lifecycle_stage]?.label || contact.lifecycle_stage}
          </span>
        )}
      </td>
      {features?.crm_extra_columns && (
        <td className="px-6 py-4">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border ${tempStyle.color}`}>
            <TempIcon size={11} />
            {tempStyle.label}
          </span>
          {contact.last_inbound_at && (
            <p className="text-[10px] text-slate-400 mt-1">{formatRelativeTime(contact.last_inbound_at)}</p>
          )}
        </td>
      )}
      {features?.crm_extra_columns && (
        <td className="px-6 py-4">
          {next ? (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold ${next.isSoon ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-50 text-slate-700 border border-slate-200'}`}>
              <CalendarIcon size={11} /> {next.label}
            </span>
          ) : (
            <span className="text-xs text-slate-400 italic">—</span>
          )}
        </td>
      )}
      {features?.crm_extra_columns && (
        <td className="px-6 py-4">
          <div className="text-xs">
            <span className="font-black text-slate-900">{contact.total_appointments}</span>
            <span className="text-slate-400"> total</span>
            {contact.completed_appointments > 0 && (
              <span className="ml-2 text-emerald-600 font-bold">{contact.completed_appointments}✓</span>
            )}
            {contact.cancelled_appointments > 0 && (
              <span className="ml-1 text-rose-600 font-bold">{contact.cancelled_appointments}✗</span>
            )}
          </div>
        </td>
      )}
      <td className="px-6 py-4">
        {assignedStaff ? (
          <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">{assignedStaff}</span>
        ) : (
          <span className="text-xs text-slate-400 italic">Sin asignar</span>
        )}
      </td>
      <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onToggleBot} className={`p-2 rounded-lg transition-colors ${contact.ai_active ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`} title={contact.ai_active ? 'Pausar bot' : 'Activar bot'}>
            {contact.ai_active ? <Power size={14} /> : <PowerOff size={14} />}
          </button>
          <button onClick={onOpenChat} className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Chat">
            <MessageSquare size={14} />
          </button>
          <button onClick={onEdit} className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Editar">
            <Edit2 size={14} />
          </button>
          <button onClick={onDelete} disabled={isDeleting} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50" title="Eliminar">
            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </td>
    </tr>
  )
}


// ============================================================================
// v2.8: ReferralSourcePicker — selector de fuente de referido
// ============================================================================
function ReferralSourcePicker({
  value, referredByContactId, onChange, companyId, currentContactId
}: {
  value: ReferralSource | ''
  referredByContactId: string
  onChange: (source: ReferralSource | '', referredBy: string) => void
  companyId: string
  currentContactId: string
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')

  // Si tiene referredByContactId, buscar el nombre del contacto
  const { data: referrerInfo } = useQuery({
    queryKey: ['referrerName', referredByContactId],
    enabled: !!referredByContactId,
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, name, phone')
        .eq('id', referredByContactId)
        .maybeSingle()
      return data
    }
  })

  // Búsqueda de contactos para "Otro paciente"
  const { data: contactMatches = [] } = useQuery({
    queryKey: ['referralContactSearch', companyId, search, currentContactId],
    enabled: !!companyId && value === 'patient' && search.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, name, phone')
        .eq('company_id', companyId)
        .neq('id', currentContactId)
        .or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
        .limit(6)
      return (data || []) as Array<{ id: string, name: string, phone: string }>
    }
  })

  const sources: ReferralSource[] = ['patient', 'doctor', 'google', 'facebook', 'instagram', 'direct', 'event', 'other']

  return (
    <div className="space-y-3">
      {/* Grid de fuentes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {sources.map(s => {
          const cfg = REFERRAL_LABELS[s]
          const isActive = value === s
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s, s === 'patient' ? referredByContactId : '')}
              className={`px-3 py-2.5 rounded-xl text-xs font-bold border-2 transition-all text-left ${
                isActive
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-300'
              }`}
            >
              {cfg.label}
            </button>
          )
        })}
        {value && (
          <button
            type="button"
            onClick={() => onChange('', '')}
            className="px-3 py-2.5 rounded-xl text-xs font-bold border-2 border-dashed border-slate-200 text-slate-400 hover:border-rose-300 hover:text-rose-500 transition-all flex items-center justify-center gap-1.5"
          >
            <X size={11} /> Limpiar
          </button>
        )}
      </div>

      {/* Si la fuente es "patient", picker del contacto referidor */}
      {value === 'patient' && (
        <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3">
          <label className="text-xs font-black text-emerald-700 uppercase tracking-wider mb-2 block">
            ¿Qué paciente lo refirió?
          </label>

          {referrerInfo ? (
            <div className="bg-white border border-emerald-200 rounded-lg p-2.5 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{referrerInfo.name || 'Sin nombre'}</p>
                <p className="text-[11px] text-slate-500 font-medium">{referrerInfo.phone}</p>
              </div>
              <button
                type="button"
                onClick={() => { onChange('patient', ''); setSearch(''); setSearchOpen(true) }}
                className="text-emerald-700 hover:text-emerald-900 text-[11px] font-bold underline shrink-0 ml-2"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Busca por nombre o teléfono..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onFocus={() => setSearchOpen(true)}
                  className="w-full pl-8 pr-2.5 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:border-emerald-500"
                />
              </div>
              {searchOpen && search.length >= 2 && contactMatches.length > 0 && (
                <div className="mt-2 bg-white border border-slate-200 rounded-lg overflow-hidden max-h-44 overflow-y-auto">
                  {contactMatches.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { onChange('patient', c.id); setSearch(''); setSearchOpen(false) }}
                      className="w-full px-3 py-2 text-left hover:bg-emerald-50 transition-colors flex items-center gap-2.5"
                    >
                      <div className="h-7 w-7 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                        <UserCircle size={12} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 truncate">{c.name || 'Sin nombre'}</p>
                        <p className="text-[10px] text-slate-500 font-medium">{c.phone}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// v2.8: BroughtContactsSection — pacientes que este contacto ha referido
// ============================================================================
function BroughtContactsSection({ contactId }: { contactId: string }) {
  const { data: brought = [], isLoading } = useQuery({
    queryKey: ['contactBrought', contactId],
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, name, phone, lifecycle_stage, created_at')
        .eq('referred_by_contact_id', contactId)
        .order('created_at', { ascending: false })
      return (data || []) as Array<{ id: string, name: string, phone: string, lifecycle_stage: string, created_at: string }>
    }
  })

  if (isLoading || brought.length === 0) return null

  const converted = brought.filter(b => b.lifecycle_stage === 'payment' || b.lifecycle_stage === 'customer').length

  return (
    <div className="mt-5 bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h5 className="text-sm font-black text-emerald-900 flex items-center gap-2">
          <Sparkles size={14} className="text-emerald-600" />
          Este paciente trajo {brought.length} {brought.length === 1 ? 'paciente' : 'pacientes'}
        </h5>
        {converted > 0 && (
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">
            {converted} convertidos
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {brought.slice(0, 5).map(b => (
          <div key={b.id} className="flex items-center justify-between px-3 py-2 bg-white border border-emerald-100 rounded-lg">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-800 truncate">{b.name || 'Sin nombre'}</p>
              <p className="text-[10px] text-slate-500 font-medium">{b.phone}</p>
            </div>
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
              {b.lifecycle_stage === 'payment' || b.lifecycle_stage === 'customer' ? '✓' : ''}
            </span>
          </div>
        ))}
        {brought.length > 5 && (
          <p className="text-[10px] text-emerald-700 font-bold text-center pt-1">
            +{brought.length - 5} más
          </p>
        )}
      </div>
    </div>
  )
}


// ============================================================================
// v2.9: ContactTagsPicker — asignar/quitar tags al contacto
// ============================================================================
function ContactTagsPicker({
  contactId, allTags
}: {
  contactId: string
  allTags: Array<{ id: string, name: string, color: string, ai_aware: boolean }>
}) {
  const queryClient = useQueryClient()

  const { data: assignedTagIds = [], isLoading } = useQuery({
    queryKey: ['contactTagsAssigned', contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data } = await supabase
        .from('contact_tags')
        .select('tag_id')
        .eq('contact_id', contactId)
      return (data || []).map(r => r.tag_id) as string[]
    }
  })

  const assignedSet = new Set(assignedTagIds)

  const toggleMutation = useMutation({
    mutationFn: async ({ tagId, currentlyAssigned }: { tagId: string, currentlyAssigned: boolean }) => {
      if (currentlyAssigned) {
        const { error } = await supabase
          .from('contact_tags')
          .delete()
          .eq('contact_id', contactId)
          .eq('tag_id', tagId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('contact_tags')
          .insert([{ contact_id: contactId, tag_id: tagId, assigned_by: 'human' }])
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contactTagsAssigned', contactId] })
      queryClient.invalidateQueries({ queryKey: ['tagAssignments'] })
      queryClient.invalidateQueries({ queryKey: ['tagsStats'] })
    },
    onError: (e: any) => toast.error(e.message || 'Error al actualizar etiquetas')
  })

  if (isLoading) {
    return <div className="text-xs text-slate-400">Cargando etiquetas...</div>
  }

  if (allTags.length === 0) {
    return (
      <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-4 text-center">
        <Tag size={20} className="mx-auto text-slate-300 mb-2" />
        <p className="text-xs text-slate-500 font-medium">
          Aún no tienes etiquetas creadas. <a href="/dashboard/tags" className="font-bold text-blue-600 hover:underline">Créalas en /tags</a>
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {allTags.map(t => {
        const isAssigned = assignedSet.has(t.id)
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => toggleMutation.mutate({ tagId: t.id, currentlyAssigned: isAssigned })}
            disabled={toggleMutation.isPending}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all border-2 ${
              isAssigned
                ? 'text-white border-transparent shadow-md scale-105'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
            style={isAssigned ? { backgroundColor: t.color, borderColor: t.color } : {}}
          >
            {isAssigned && <CheckSquare size={11} />}
            {t.ai_aware && <Wand2 size={10} />}
            {t.name}
          </button>
        )
      })}
    </div>
  )
}
