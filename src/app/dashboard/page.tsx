 

'use client'

import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { useWorkspace } from '../../components/WorkspaceContext'
import PageHeader from '../../components/PageHeader'
import { useQuery } from '@tanstack/react-query'
import { 
  MessageSquare, Calendar as CalendarIcon, 
  Users, Sparkles, ArrowUpRight, 
  BellRing, CalendarCheck, Loader2, Bot, Layers
} from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const { labels, primaryTemplate: vertical, isLoadingWorkspace } = useWorkspace()

  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      if (!profile?.company_id) throw new Error('No company')

      const companyId = profile.company_id

      // Las citas del calendario cuelgan de `agenda_id` y no siempre traen
      // company_id. Contar solo por company_id dejaba el contador en 0.
      const { data: agendasData } = await supabase.from('agendas').select('id').eq('company_id', companyId)
      const agendaIds = (agendasData || []).map((a: any) => a.id).filter(Boolean)

      const [companyRes, contactsRes, unreadRes, appointmentsRes, apptAgendaRes, convRes] = await Promise.all([
        supabase.from('companies').select('doctor_name, name').eq('id', companyId).single(),
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('ai_active', false),
        supabase.from('appointments').select('id').eq('company_id', companyId).limit(5000),
        agendaIds.length
          ? supabase.from('appointments').select('id').in('agenda_id', agendaIds).limit(5000)
          : Promise.resolve({ data: [] } as any),
        // Conversaciones reales de los 3 canales. `contacts` puede ir por detrás
        // (p. ej. un chat de Instagram cuyo contacto aún no se creó), así que la
        // fuente de verdad de "con cuánta gente he hablado" son los mensajes.
        supabase.from('messages').select('patient_id').eq('company_id', companyId).limit(5000)
      ])

      const conversaciones = new Set(
        (convRes.data || []).map((m: any) => m.patient_id).filter(Boolean)
      ).size

      const citas = new Set([
        ...(appointmentsRes.data || []).map((a: any) => a.id),
        ...(((apptAgendaRes as any).data) || []).map((a: any) => a.id)
      ].filter(Boolean)).size

      return {
        userName: companyRes.data?.doctor_name || companyRes.data?.name || 'Administrador',
        // Si hay conversaciones sin contacto creado, no las escondemos
        totalContacts: Math.max(contactsRes.count || 0, conversaciones),
        conversaciones,
        pendingChats: unreadRes.count || 0,
        totalAppointments: citas
      }
    }
  })

  const isPageLoading = isLoadingWorkspace || isLoadingStats
  const accentColor = vertical?.accent_color || '#4f46e5'

  if (isPageLoading) {
    return (
      <div className="h-[calc(100vh-120px)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin" style={{ color: accentColor }} />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Preparando tu espacio...</p>
        </div>
      </div>
    )
  }

  const tenantName = vertical?.tenant_label ? vertical.tenant_label.toLowerCase() : 'espacio de trabajo'
  const clientsLabel = labels?.clients || 'Clientes'
  const actionLabel = vertical?.funnels?.customer || 'Citas confirmadas'

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-20">
      <PageHeader
        title={<>¡Hola, {stats?.userName}! <Sparkles className="inline text-amber-400 -mt-1" size={26} /></>}
        description={`Aquí tienes el resumen de tu ${tenantName} para hoy.`}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-5 transition-colors" style={{ borderBottomWidth: '4px', borderBottomColor: accentColor }}>
          <div className="h-16 w-16 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accentColor}15`, color: accentColor }}>
            <Users size={28} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total {clientsLabel}</p>
            <p className="text-3xl font-black text-slate-900">{stats?.totalContacts}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-5 transition-colors" style={{ borderBottomWidth: '4px', borderBottomColor: '#f43f5e' }}>
          <div className="h-16 w-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shrink-0">
            <BellRing size={28} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Requieren Atención</p>
            <div className="flex items-center gap-2">
              <p className="text-3xl font-black text-slate-900">{stats?.pendingChats}</p>
              {stats?.pendingChats ? <span className="flex h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse"></span> : null}
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-5 transition-colors" style={{ borderBottomWidth: '4px', borderBottomColor: '#10b981' }}>
          <div className="h-16 w-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
            <CalendarCheck size={28} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 truncate">{actionLabel}</p>
            <p className="text-3xl font-black text-slate-900">{stats?.totalAppointments}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <button 
          onClick={() => router.push('/dashboard/inbox')}
          className="group relative rounded-[32px] p-8 md:p-10 text-left overflow-hidden transition-all hover:scale-[1.02] shadow-2xl shadow-slate-900/20"
          style={{ backgroundColor: accentColor }}
        >
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-white/20 transition-colors"></div>
          <div className="relative z-10 flex flex-col h-full justify-between min-h-[160px]">
            <div className="h-14 w-14 bg-black/20 rounded-2xl flex items-center justify-center text-white mb-8 shadow-inner">
              <MessageSquare size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white flex items-center gap-2">
                Bandeja de Mensajes <ArrowUpRight className="opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1 text-white/70" />
              </h2>
              <p className="text-white/80 font-medium mt-2">Gestiona tus chats y responde manualmente a tus {clientsLabel.toLowerCase()}.</p>
            </div>
          </div>
        </button>

        <button 
          onClick={() => router.push('/dashboard/calendar')}
          className="group relative bg-white border border-slate-200 rounded-[32px] p-8 md:p-10 text-left overflow-hidden transition-all hover:scale-[1.02] shadow-sm hover:shadow-xl"
        >
          <div className="absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl -mr-10 -mt-10 opacity-20" style={{ backgroundColor: accentColor }}></div>
          <div className="relative z-10 flex flex-col h-full justify-between min-h-[160px]">
            <div className="h-14 w-14 rounded-2xl flex items-center justify-center mb-8 shadow-sm" style={{ backgroundColor: `${accentColor}15`, color: accentColor }}>
              <CalendarIcon size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                Ver Calendario <ArrowUpRight className="opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" style={{ color: accentColor }} />
              </h2>
              <p className="text-slate-500 font-medium mt-2">Visualiza tu agenda, disponibilidad y horarios bloqueados.</p>
            </div>
          </div>
        </button>
      </div>

      <div className="rounded-3xl p-6 md:p-8 border flex flex-col md:flex-row items-center justify-between gap-6 mt-6" style={{ backgroundColor: `${accentColor}08`, borderColor: `${accentColor}20` }}>
        <div className="flex items-center gap-5">
          <div className="h-14 w-14 bg-white rounded-full flex items-center justify-center shadow-md border relative" style={{ borderColor: `${accentColor}20`, color: accentColor }}>
            <Bot size={28} />
            <div className="absolute top-0 right-0 h-3.5 w-3.5 bg-emerald-500 border-2 border-white rounded-full"></div>
          </div>
          <div>
            <p className="text-base font-black text-slate-800">Motor de Inteligencia Artificial Activo</p>
            <p className="text-sm font-medium text-slate-500 mt-0.5">Atendiendo y gestionando mensajes 24/7 de forma automática.</p>
          </div>
        </div>
        <div className="flex gap-2 items-center bg-white px-4 py-2 rounded-full border shadow-sm" style={{ borderColor: `${accentColor}20` }}>
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-xs font-black uppercase text-slate-700 tracking-widest">Sistemas Online</span>
        </div>
      </div>

      {/* Industria actual + cambiar */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-8 text-center">
        <p className="text-xs text-slate-400">
          Estás en la industria <strong className="text-slate-600 font-bold">{vertical?.name || 'Genérica'}</strong>. ¿Quieres cambiar de industria?
        </p>
        <a
          href="/dashboard/templates"
          className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-lg border transition-colors hover:bg-slate-50"
          style={{ color: accentColor, borderColor: `${accentColor}30` }}
        >
          <Layers size={12} /> Cambiar industria
        </a>
      </div>
    </div>
  )
}
