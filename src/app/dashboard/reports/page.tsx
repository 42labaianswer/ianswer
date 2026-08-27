 

'use client'

import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useWorkspace } from '../../../components/WorkspaceContext' 
import { useQuery } from '@tanstack/react-query'
import { usePlanFeatures } from '../../../hooks/usePlanFeatures'
import PageHeader from '../../../components/PageHeader'
import toast from 'react-hot-toast'
import { 
  Filter,BarChart3, Download, Users, CalendarCheck, 
  TrendingUp, MessageSquare, Target, Sparkles, Bot, UserCog, Trophy, Activity, AlertCircle, CalendarRange,
  Share2, ArrowUp, ArrowDown
} from 'lucide-react'

type LifecycleStage = 'new_lead' | 'hot_lead' | 'payment' | 'customer'

// Helper para capitalizar la primera letra (ej. 'pacientes' -> 'Pacientes')
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default function ReportsPage() {
  const { labels, primaryTemplate: vertical } = useWorkspace()
  const { data: features } = usePlanFeatures()
  const [dateFilter, setDateFilter] = useState('this_month')

  // TANSTACK QUERY: Obtener todas las métricas con filtro de fecha
  const { data, isLoading } = useQuery({
    queryKey: ['reportsMetricsPro', dateFilter],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Usuario no autenticado")

      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      const companyId = profile?.company_id
      if (!companyId) throw new Error("Compañía no encontrada")

      // Determinar rango de fechas
      const now = new Date()
      let startDate: Date | null = null
      let endDate: Date | null = null

      if (dateFilter === 'this_month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
      } else if (dateFilter === 'last_month') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
      } else if (dateFilter === 'this_year') {
        startDate = new Date(now.getFullYear(), 0, 1)
        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59)
      }

      // Preparar queries
      let qContacts = supabase.from('contacts').select('id, lifecycle_stage, ai_active, staff_id, chat_status, recovery_status').eq('company_id', companyId)
      let qTeam = supabase.from('team').select('id, name').eq('company_id', companyId)
      let qMsgBot = supabase.from('messages').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('sender', 'asistente')
      let qMsgHuman = supabase.from('messages').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('sender', 'admin')
      let qMsgPat = supabase.from('messages').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('sender', 'patient')

      // Aplicar filtros de fecha si no es "all_time"
      if (startDate && endDate) {
        const startStr = startDate.toISOString()
        const endStr = endDate.toISOString()
        qContacts = qContacts.gte('created_at', startStr).lte('created_at', endStr)
        qMsgBot = qMsgBot.gte('created_at', startStr).lte('created_at', endStr)
        qMsgHuman = qMsgHuman.gte('created_at', startStr).lte('created_at', endStr)
        qMsgPat = qMsgPat.gte('created_at', startStr).lte('created_at', endStr)
      }

      // Conversaciones REALES por canal. Antes los reportes solo contaban filas
      // de `contacts`, así que una plática de Instagram/Messenger salía en 0 si
      // el contacto no existía. Aquí contamos conversaciones distintas
      // (patient_id) a partir de los mensajes, que es la fuente de verdad, y las
      // separamos por canal.
      let qMsgCanales = supabase
        .from('messages')
        .select('patient_id, channel, sender, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(5000)

      if (startDate && endDate) {
        qMsgCanales = qMsgCanales
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
      }

      // ── CITAS ───────────────────────────────────────────────────────────
      // Ojo: el calendario guarda las citas colgadas de `agenda_id`, no todas
      // traen `company_id`. Si filtramos solo por company_id, "Salud de la
      // Agenda" sale vacía aunque el calendario tenga citas. Por eso buscamos
      // por los DOS caminos y unimos por id.
      const AP_COLS = 'id, status, patient_id, staff_id, agenda_id, appointment_date, created_at'

      const { data: agendasData } = await supabase
        .from('agendas').select('id').eq('company_id', companyId)
      const agendaIds = (agendasData || []).map((a: any) => a.id).filter(Boolean)

      const qApptCompany = supabase.from('appointments').select(AP_COLS).eq('company_id', companyId).limit(5000)
      const qApptAgenda = agendaIds.length
        ? supabase.from('appointments').select(AP_COLS).in('agenda_id', agendaIds).limit(5000)
        : Promise.resolve({ data: [], error: null } as any)

      const [contactsRes, teamRes, apptCompanyRes, apptAgendaRes, msgBotRes, msgHumanRes, msgPatRes, msgCanalesRes] = await Promise.all([
        qContacts, qTeam, qApptCompany, qApptAgenda, qMsgBot, qMsgHuman, qMsgPat, qMsgCanales
      ])

      // Unir sin duplicar (una cita puede venir por los dos caminos)
      const apptMap = new Map<string, any>()
      for (const a of [...(apptCompanyRes.data || []), ...((apptAgendaRes as any).data || [])]) {
        if (a?.id) apptMap.set(a.id, a)
      }
      const allAppointments = Array.from(apptMap.values())

      // El filtro de fecha se aplica aquí (no en el servidor) para poder
      // distinguir "no hay citas" de "no hay citas EN ESTE PERIODO", y para
      // usar la fecha de la cita cuando existe.
      const dentroDelRango = (a: any) => {
        if (!startDate || !endDate) return true
        const ref = a.appointment_date || a.created_at
        if (!ref) return true
        const t = new Date(ref).getTime()
        return t >= startDate.getTime() && t <= endDate.getTime()
      }

      // Normaliza el canal ('facebook' del enum -> 'messenger') y agrupa
      const normCanal = (v: any): 'whatsapp' | 'messenger' | 'instagram' => {
        const s = String(v || '').toLowerCase()
        if (s === 'instagram' || s === 'ig') return 'instagram'
        if (s === 'messenger' || s === 'facebook' || s === 'fb') return 'messenger'
        return 'whatsapp'
      }

      const convPorCanal = {
        whatsapp: new Set<string>(),
        messenger: new Set<string>(),
        instagram: new Set<string>(),
      }
      const msgsPorCanal = { whatsapp: 0, messenger: 0, instagram: 0 }
      const conversacionesTotales = new Set<string>()

      for (const m of msgCanalesRes.data || []) {
        const pid: string = m.patient_id
        if (!pid) continue
        const c = normCanal(m.channel)
        convPorCanal[c].add(pid)
        msgsPorCanal[c]++
        conversacionesTotales.add(pid)
      }

      const canales = {
        whatsapp:  { conversaciones: convPorCanal.whatsapp.size,  mensajes: msgsPorCanal.whatsapp },
        messenger: { conversaciones: convPorCanal.messenger.size, mensajes: msgsPorCanal.messenger },
        instagram: { conversaciones: convPorCanal.instagram.size, mensajes: msgsPorCanal.instagram },
      }

      const contacts = contactsRes.data || []
      const team = teamRes.data || []
      const appointments = allAppointments.filter(dentroDelRango)

      // --- CÁLCULOS PRINCIPALES ---
      const totalLeads = contacts.length
      const activeChats = contacts.filter(c => c.chat_status === 'open').length
      
      const funnelCounts = { new_lead: 0, hot_lead: 0, payment: 0, customer: 0 }
      let botActiveCount = 0
      const recovery = { followup_sent: 0, recovered: 0, lost: 0 }

      contacts.forEach(c => {
        const stage = c.lifecycle_stage as LifecycleStage
        if (funnelCounts[stage] !== undefined) funnelCounts[stage]++
        if (c.ai_active) botActiveCount++
        if (c.recovery_status === 'pending_followup') recovery.followup_sent++
        else if (c.recovery_status === 'recovered') recovery.recovered++
        else if (c.recovery_status === 'lost') recovery.lost++
      })

      // --- CÁLCULOS DE CITAS Y CONVERSIÓN ---
      const apptStats = { confirmed: 0, completed: 0, cancelled: 0, noShow: 0, otras: 0, total: appointments.length }
      const uniquePatientsWithAppointments = new Set()

      appointments.forEach(a => {
        const st = String(a.status || '').toLowerCase()
        if (st === 'confirmed' || st === 'scheduled' || st === 'pending') apptStats.confirmed++
        else if (st === 'completed') apptStats.completed++
        else if (st === 'cancelled' || st === 'canceled') apptStats.cancelled++
        else if (st === 'no_show' || st === 'noshow') apptStats.noShow++
        else apptStats.otras++

        if (st !== 'cancelled' && st !== 'canceled' && a.patient_id) {
          uniquePatientsWithAppointments.add(a.patient_id)
        }
      })

      // Nueva Tasa de Conversión: Citas Agendadas Reales vs Pláticas Activas (o vs Total si no hay pláticas activas)
      const conversionBase = activeChats > 0 ? activeChats : (totalLeads > 0 ? totalLeads : 0)
      const conversionRate = conversionBase > 0 ? ((uniquePatientsWithAppointments.size / conversionBase) * 100).toFixed(1) : '0'
      // Autonomía = mensajes de IA / (IA + humano). Consistente con "Carga Operativa".
      const _aiMsgs = msgBotRes.count || 0
      const _humanMsgs = msgHumanRes.count || 0
      const _outbound = _aiMsgs + _humanMsgs
      const automationRate = _outbound > 0 ? ((_aiMsgs / _outbound) * 100).toFixed(1) : '0'

      // --- CÁLCULOS DE EQUIPO (LEADERBOARD) ---
      // Antes solo se contaba `contacts.staff_id`, así que si las citas traían su
      // propio responsable (staff_id de la cita) el leaderboard salía vacío.
      // Ahora se atribuye por la cita cuando la cita lo dice, y si no, por el
      // contacto. Además devolvemos SIEMPRE a todo el equipo (aunque vaya en 0)
      // para que se vea quién existe y quién no ha movido nada.
      const staffStats = team.map(t => {
        const assignedContacts = contacts.filter(c => c.staff_id === t.id)
        const assignedContactIds = new Set(assignedContacts.map(c => c.id))
        const doctorAppointments = appointments.filter(a => {
          const st = String(a.status || '').toLowerCase()
          if (st === 'cancelled' || st === 'canceled') return false
          if (a.staff_id) return a.staff_id === t.id
          return assignedContactIds.has(a.patient_id)
        })
        const conversions = new Set(doctorAppointments.map(a => a.patient_id)).size
        const base = assignedContacts.length || conversions
        const winRate = base > 0 ? ((conversions / base) * 100).toFixed(1) : '0'
        return {
          id: t.id, name: t.name,
          total: assignedContacts.length,
          conversions, winRate: parseFloat(winRate)
        }
      }).sort((a, b) => (b.conversions - a.conversions) || (b.total - a.total))

      const sinAsignar = contacts.filter(c => !c.staff_id).length

      return {
        totalLeads,
        activeChats,
        uniqueAppointmentsCount: uniquePatientsWithAppointments.size,
        conversionRate: parseFloat(conversionRate),
        automationRate: parseFloat(automationRate),
        messages: {
          bot: msgBotRes.count || 0,
          human: msgHumanRes.count || 0,
          patient: msgPatRes.count || 0,
          total: (msgBotRes.count || 0) + (msgHumanRes.count || 0) + (msgPatRes.count || 0)
        },
        // Multicanal: conversaciones reales (por mensajes), no filas de contacts
        canales,
        conversacionesTotal: conversacionesTotales.size,
        funnel: funnelCounts,
        apptStats,
        // Para distinguir "no tienes citas" de "no hay citas en este periodo"
        apptTotalSinFiltro: allAppointments.length,
        staffStats,
        sinAsignar,
        teamSize: team.length,
        recovery
      }
    }
  })

  const metrics = data || {
    totalLeads: 0, activeChats: 0, uniqueAppointmentsCount: 0, conversionRate: 0, automationRate: 0,
    messages: { bot: 0, human: 0, patient: 0, total: 0 },
    canales: {
      whatsapp:  { conversaciones: 0, mensajes: 0 },
      messenger: { conversaciones: 0, mensajes: 0 },
      instagram: { conversaciones: 0, mensajes: 0 },
    },
    conversacionesTotal: 0,
    funnel: { new_lead: 0, hot_lead: 0, payment: 0, customer: 0 },
    apptStats: { confirmed: 0, completed: 0, cancelled: 0, noShow: 0, otras: 0, total: 0 },
    apptTotalSinFiltro: 0,
    staffStats: [] as Array<{ id: string, name: string, total: number, conversions: number, winRate: number }>,
    sinAsignar: 0,
    teamSize: 0,
    recovery: { followup_sent: 0, recovered: 0, lost: 0 }
  }

  const clientLabelPlural = capitalize(labels?.clients || 'Pacientes')
  const clientLabelSingular = capitalize(labels?.client || 'Paciente')

  const generateNarrative = () => {
    if (metrics.totalLeads === 0) return [`Tu panel está listo. Comienza a registrar ${labels?.clients?.toLowerCase() || 'pacientes'} para ver cómo fluyen las métricas.`]
    
    const insights = []
    
    if (metrics.conversionRate > 25) {
      insights.push(`🔥 ¡Impresionante! Tienes una conversión a cita del ${metrics.conversionRate}%. Tus pláticas activas están generando agenda de forma efectiva.`)
    } else if (metrics.conversionRate > 0) {
      insights.push(`📈 Tu tasa de conversión actual a citas es del ${metrics.conversionRate}%. Intenta dar seguimiento a las ${metrics.activeChats} pláticas activas para llenar tu agenda.`)
    }

    if (metrics.automationRate > 60) {
      insights.push(`🤖 Tu Asistente de IA está gestionando el ${metrics.automationRate}% de tu base, ahorrándote decenas de horas esta semana.`)
    } else {
      insights.push(`⚙️ Actualmente, el bot solo atiende al ${metrics.automationRate}% de tus contactos. Actívalo en más perfiles para que califique automáticamente.`)
    }

    const topAgent = metrics.staffStats[0]
    if (topAgent && topAgent.conversions > 0) {
      insights.push(`🏆 ${topAgent.name} es el especialista líder, con ${topAgent.conversions} ${labels?.clients?.toLowerCase() || 'pacientes'} agendados exitosamente.`)
    }

    if (metrics.apptStats.total > 0) {
      const cancelRate = ((metrics.apptStats.cancelled / metrics.apptStats.total) * 100).toFixed(1)
      if (parseFloat(cancelRate) > 30) {
        insights.push(`⚠️ Alerta: Tienes un ${cancelRate}% de cancelación en citas. Activa recordatorios automáticos 24h antes del evento para reducir este número.`)
      }
    }

    return insights
  }

  const exportToCSV = () => {
    try {
      let csvContent = "data:text/csv;charset=utf-8,"
      csvContent += `=== REPORTE EJECUTIVO (${dateFilter}) ===\n`
      csvContent += "Metrica,Valor\n"
      csvContent += `Universo de ${clientLabelPlural},${metrics.totalLeads}\n`
      csvContent += `Platicas Activas,${metrics.activeChats}\n`
      csvContent += `Tasa de Conversion a Cita (%),${metrics.conversionRate}\n`
      csvContent += `Nivel de Automatizacion IA (%),${metrics.automationRate}\n`
      csvContent += `Citas Totales,${metrics.apptStats.total}\n`
      csvContent += `Clientes Recuperados,${metrics.recovery.recovered}\n`
      csvContent += `Mensajes Totales,${metrics.messages.total}\n\n`
      
      csvContent += "=== RENDIMIENTO DEL EMBUDO ===\n"
      csvContent += `${vertical?.funnels?.new_lead || 'Nuevos Prospectos'},${metrics.funnel.new_lead}\n`
      csvContent += `${vertical?.funnels?.hot_lead || 'Interesados'},${metrics.funnel.hot_lead}\n`
      csvContent += `${vertical?.funnels?.payment || 'En Pago'},${metrics.funnel.payment}\n`
      csvContent += `${vertical?.funnels?.customer || clientLabelPlural},${metrics.funnel.customer}\n\n`

      csvContent += "=== EQUIPO Y ESPECIALISTAS ===\n"
      csvContent += "Nombre,Asignados,Agendados Exitosos,Win Rate (%)\n"
      metrics.staffStats.forEach((s: any) => {
        csvContent += `${s.name},${s.total},${s.conversions},${s.winRate}\n`
      })

      const encodedUri = encodeURI(csvContent)
      const link = document.createElement("a")
      link.setAttribute("href", encodedUri)
      link.setAttribute("download", `reporte_${dateFilter}_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success('Reporte exportado correctamente')
    } catch (error) {
      toast.error('Hubo un error al exportar')
    }
  }

  const maxFunnelValue = Math.max(...Object.values(metrics.funnel), 1)

  if (isLoading) {
    return (
      <div className="flex flex-col h-[60vh] items-center justify-center animate-pulse gap-4">
        <BarChart3 size={48} className="text-blue-300" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Analizando {clientLabelPlural}...</p>
      </div>
    )
  }

  const narrative = generateNarrative()

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      
      {/* HEADER PRO CON FILTRO DE FECHAS */}
      <PageHeader
        title="Reportes y Analíticas"
        description="Controla tu rendimiento, descubre oportunidades y evalúa a tu equipo."
        actions={
          <>
            <div className="bg-white p-2 rounded-xl border border-slate-200 flex items-center gap-3 shrink-0">
              <div className="pl-3 text-slate-400"><CalendarRange size={18} /></div>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-40 py-2 pr-4 bg-transparent outline-none text-sm font-medium text-slate-700 cursor-pointer"
              >
                <option value="this_month">Este mes</option>
                <option value="last_month">Mes pasado</option>
                <option value="this_year">Este año</option>
                <option value="all_time">Histórico (Todo)</option>
              </select>
            </div>
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white font-bold text-sm rounded-xl transition-all hover:bg-slate-800"
            >
              <Download size={16} /> Exportar CSV
            </button>
          </>
        }
      />

      {/* BLOQUE NARRATIVO (INSIGHTS) */}
      <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-[2rem] p-8 md:p-10 text-white shadow-xl shadow-indigo-900/10 mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start">
          <div className="shrink-0 bg-white/10 p-4 rounded-2xl border border-white/10">
            <Sparkles size={32} className="text-indigo-300" />
          </div>
          <div className="flex-1 space-y-4">
            <h2 className="text-2xl font-black tracking-tight">El pulso de tu operación</h2>
            <div className="space-y-3">
              {narrative.map((text, idx) => (
                <p key={idx} className="text-indigo-100 font-medium leading-relaxed flex items-start gap-2">
                  <span className="text-indigo-400 mt-1">•</span> {text}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* v2.8: BLOQUE DE RETENCIÓN (solo si feature activa) */}
      {features?.crm_retention_metrics && <RetentionBlock />}

      {/* v2.8: BLOQUE DE REFERIDOS (solo si feature activa) */}
      {features?.crm_referral_tracking && <ReferralBlock />}
      
      {/* TARJETAS DE KPIs AVANZADAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group hover:border-blue-300 transition-colors">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><Users size={80} className="text-blue-500"/></div>
          <p className="text-sm font-bold text-slate-500 mb-1 flex items-center gap-2"><Users size={16} className="text-blue-500"/> Universo {clientLabelPlural}</p>
          <p className="text-4xl font-black text-slate-900">{metrics.totalLeads}</p>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group hover:border-orange-300 transition-colors">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><MessageSquare size={80} className="text-orange-500"/></div>
          <p className="text-sm font-bold text-slate-500 mb-1 flex items-center gap-2"><MessageSquare size={16} className="text-orange-500"/> Pláticas Activas</p>
          <p className="text-4xl font-black text-slate-900">{metrics.activeChats}</p>
        </div>
        
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group hover:border-purple-300 transition-colors">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><Target size={80} className="text-purple-500"/></div>
          <p className="text-sm font-bold text-slate-500 mb-1 flex items-center gap-2"><Target size={16} className="text-purple-500"/> Conversión a Cita</p>
          <div className="flex items-end gap-2">
            <p className="text-4xl font-black text-slate-900">{metrics.conversionRate}<span className="text-xl text-slate-400 ml-1">%</span></p>
            <p className="text-xs font-bold text-emerald-600 mb-1 bg-emerald-50 px-2 py-0.5 rounded-md">({metrics.uniqueAppointmentsCount} Citas)</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group hover:border-emerald-300 transition-colors">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><Bot size={80} className="text-emerald-500"/></div>
          <p className="text-sm font-bold text-slate-500 mb-1 flex items-center gap-2"><Bot size={16} className="text-emerald-500"/> Autonomía de IA</p>
          <p className="text-4xl font-black text-slate-900">{metrics.automationRate}<span className="text-xl text-slate-400 ml-1">%</span></p>
        </div>
      </div>

      {/* NUEVO v1.1 — Estado de citas + Recuperación de clientes (datos que no están en los KPIs de arriba) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
          <p className="text-sm font-bold text-slate-500 mb-1 flex items-center gap-2"><CalendarCheck size={16} className="text-emerald-500"/> Citas confirmadas</p>
          <p className="text-4xl font-black text-slate-900">{metrics.apptStats.confirmed}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
          <p className="text-sm font-bold text-slate-500 mb-1 flex items-center gap-2"><AlertCircle size={16} className="text-rose-500"/> Citas canceladas</p>
          <p className="text-4xl font-black text-slate-900">{metrics.apptStats.cancelled}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
          <p className="text-sm font-bold text-slate-500 mb-1 flex items-center gap-2"><TrendingUp size={16} className="text-blue-500"/> Clientes recuperados</p>
          <p className="text-4xl font-black text-slate-900">{metrics.recovery.recovered}</p>
          <p className="text-[11px] text-slate-400 mt-1">{metrics.recovery.followup_sent} seguimientos enviados</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
          <p className="text-sm font-bold text-slate-500 mb-1 flex items-center gap-2"><UserCog size={16} className="text-slate-400"/> Clientes perdidos</p>
          <p className="text-4xl font-black text-slate-900">{metrics.recovery.lost}</p>
          <p className="text-[11px] text-slate-400 mt-1">sin respuesta tras el recordatorio</p>
        </div>
      </div>

      {/* CONVERSACIONES POR CANAL — cuenta pláticas reales (mensajes), no filas
          de contactos, para que WhatsApp, Messenger e Instagram se reflejen aunque
          el contacto no se haya creado. */}
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden mb-8">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Share2 size={20} className="text-slate-400" />
            <h2 className="text-lg font-black text-slate-800">Conversaciones por canal</h2>
          </div>
          <p className="text-sm text-slate-500">
            <strong className="text-slate-900">{metrics.conversacionesTotal}</strong> conversaciones en total
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          {([
            { key: 'whatsapp',  label: 'WhatsApp',  color: '#25D366' },
            { key: 'messenger', label: 'Messenger', color: '#1877F2' },
            { key: 'instagram', label: 'Instagram', color: '#C13584' },
          ] as const).map(c => {
            const d = metrics.canales[c.key]
            const pct = metrics.conversacionesTotal > 0
              ? Math.round((d.conversaciones / metrics.conversacionesTotal) * 100)
              : 0
            return (
              <div key={c.key} className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  <p className="text-sm font-bold text-slate-600">{c.label}</p>
                </div>
                <p className="text-4xl font-black text-slate-900 leading-none">{d.conversaciones}</p>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  {d.mensajes} {d.mensajes === 1 ? 'mensaje' : 'mensajes'}
                </p>
                <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: c.color }} />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">{pct}% del total</p>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">

        {/* EMBUDO DEL CICLO DE VIDA */}
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div>
              <h2 className="text-lg font-black text-slate-800">Embudo de Ventas</h2>
              <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-bold">Distribución del recorrido</p>
            </div>
            <Filter className="text-slate-300" size={24}/>
          </div>
          
          <div className="p-8 flex-1 flex flex-col justify-center space-y-6">
            {[
              { id: 'new_lead', name: vertical?.funnels?.new_lead || 'Nuevos Prospectos', color: 'bg-blue-500', count: metrics.funnel.new_lead },
              { id: 'hot_lead', name: vertical?.funnels?.hot_lead || 'Interesados', color: 'bg-orange-500', count: metrics.funnel.hot_lead },
              { id: 'payment', name: vertical?.funnels?.payment || 'En Proceso / Pago', color: 'bg-emerald-500', count: metrics.funnel.payment },
              { id: 'customer', name: vertical?.funnels?.customer || `Nuevos ${clientLabelPlural}`, color: 'bg-purple-500', count: metrics.funnel.customer },
            ].map((stage, index, arr) => {
              const percentage = metrics.totalLeads > 0 ? Math.max((stage.count / maxFunnelValue) * 100, 2) : 0
              return (
                <div key={stage.id} className="relative">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${stage.color} shadow-sm`}></span>
                      {stage.name}
                    </span>
                    <span className="text-sm font-black text-slate-900">{stage.count} <span className="text-slate-400 font-medium text-xs ml-1">personas</span></span>
                  </div>
                  <div className="h-8 w-full bg-slate-100 rounded-lg overflow-hidden flex shadow-inner">
                    <div className={`h-full ${stage.color} transition-all duration-1000 ease-out flex items-center px-3 justify-end`} style={{ width: `${percentage}%` }}>
                      {index > 0 && stage.count > 0 && (
                        <span className="text-white text-[10px] font-bold opacity-90 drop-shadow-md whitespace-nowrap">
                          {((stage.count / Math.max(arr[index-1].count, 1)) * 100).toFixed(0)}% retención
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* DISTRIBUCIÓN DE MENSAJERÍA */}
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div>
              <h2 className="text-lg font-black text-slate-800">Carga Operativa</h2>
              <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-bold">Quién envía los mensajes</p>
            </div>
            <MessageSquare className="text-slate-300" size={24}/>
          </div>
          
          <div className="p-8 flex-1 flex flex-col items-center justify-center">
            {metrics.messages.total === 0 ? (
              <p className="text-slate-400 font-medium text-sm">No hay mensajes registrados aún en este periodo.</p>
            ) : (
              <div className="w-full max-w-sm space-y-6">
                
                <div className="flex items-center justify-between p-4 border border-emerald-200 bg-emerald-50 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl"><Bot size={20}/></div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">Inteligencia Artificial</p>
                      <p className="text-xs font-semibold text-emerald-600">Resolución Automática</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-slate-900">{metrics.messages.bot}</p>
                    <p className="text-xs text-slate-500">{((metrics.messages.bot / metrics.messages.total) * 100).toFixed(1)}%</p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 border border-blue-200 bg-blue-50 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-xl"><UserCog size={20}/></div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">Agentes Humanos</p>
                      <p className="text-xs font-semibold text-blue-600">Soporte Manual</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-slate-900">{metrics.messages.human}</p>
                    <p className="text-xs text-slate-500">{((metrics.messages.human / metrics.messages.total) * 100).toFixed(1)}%</p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 border border-slate-200 bg-slate-50 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-200 text-slate-600 rounded-xl"><Users size={20}/></div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{clientLabelPlural}</p>
                      <p className="text-xs font-semibold text-slate-500">Mensajes Entrantes</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-slate-900">{metrics.messages.patient}</p>
                    <p className="text-xs text-slate-500">{((metrics.messages.patient / metrics.messages.total) * 100).toFixed(1)}%</p>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>

      </div>

      {/* TERCERA FILA: LEADERBOARD Y CITAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* LEADERBOARD DE STAFF */}
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div>
              <h2 className="text-lg font-black text-slate-800">Leaderboard del Equipo</h2>
              <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-bold">Rendimiento por especialista</p>
            </div>
            <Trophy className="text-yellow-500" size={24}/>
          </div>
          
          <div className="p-0">
            {metrics.staffStats.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <p className="text-slate-400 font-medium text-sm">
                  {metrics.teamSize === 0
                    ? 'Todavía no agregas miembros a tu equipo.'
                    : 'Tu equipo no tiene contactos ni citas asignadas.'}
                </p>
                <a href="/dashboard/team" className="inline-block text-xs font-bold text-indigo-600 hover:underline">
                  {metrics.teamSize === 0 ? 'Agregar equipo →' : 'Ir a equipo →'}
                </a>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {metrics.staffStats.map((staff: any, idx: number) => (
                  <div key={staff.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center font-black text-sm
                        ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : idx === 1 ? 'bg-slate-200 text-slate-600' : idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-50 text-slate-400'}`}>
                        #{idx + 1}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900">{staff.name}</h4>
                        <p className="text-xs text-slate-500 font-medium">{staff.total} asignados</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-slate-900">{staff.conversions} <span className="text-xs text-slate-400 font-medium">agendados</span></p>
                      <p className={`text-xs font-bold ${staff.winRate > 20 ? 'text-emerald-500' : 'text-slate-400'}`}>{staff.winRate}% Efectividad</p>
                    </div>
                  </div>
                ))}
                {metrics.sinAsignar > 0 && (
                  <div className="px-6 py-4 flex items-center justify-between bg-slate-50/60">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full flex items-center justify-center bg-slate-100 text-slate-400">
                        <UserCog size={18} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-500">Sin asignar</h4>
                        <p className="text-xs text-slate-400 font-medium">Contactos sin responsable</p>
                      </div>
                    </div>
                    <p className="text-lg font-black text-slate-500">{metrics.sinAsignar}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* SALUD DE LAS CITAS (Custom CSS Donut Chart) */}
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div>
              <h2 className="text-lg font-black text-slate-800">Salud de la Agenda</h2>
              <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-bold">Estado de citas creadas</p>
            </div>
            <CalendarCheck className="text-slate-300" size={24}/>
          </div>
          
          <div className="p-8 flex-1 flex flex-col md:flex-row items-center justify-center gap-10">
            {metrics.apptStats.total === 0 ? (
              <div className="text-center space-y-2">
                <p className="text-slate-400 font-medium text-sm">
                  {metrics.apptTotalSinFiltro > 0
                    ? `No hay citas en este periodo (tienes ${metrics.apptTotalSinFiltro} en total).`
                    : 'Aún no se han agendado citas.'}
                </p>
                {metrics.apptTotalSinFiltro > 0 && (
                  <p className="text-xs text-slate-400">Cambia el filtro de fecha a "Todo el tiempo" para verlas.</p>
                )}
              </div>
            ) : (
              <>
                <div className="relative w-48 h-48 rounded-full shadow-inner flex items-center justify-center" style={{
                  background: (() => {
                    const t = metrics.apptStats.total || 1
                    const pct = (n: number) => (n / t) * 100
                    let acc = 0
                    const segs: string[] = []
                    const push = (color: string, n: number) => {
                      if (n <= 0) return
                      const ini = acc
                      acc += pct(n)
                      segs.push(`${color} ${ini}% ${acc}%`)
                    }
                    push('#10b981', metrics.apptStats.completed)
                    push('#3b82f6', metrics.apptStats.confirmed)
                    push('#f59e0b', metrics.apptStats.noShow)
                    push('#ef4444', metrics.apptStats.cancelled)
                    push('#cbd5e1', metrics.apptStats.otras)
                    return `conic-gradient(${segs.join(', ')})`
                  })()
                }}>
                  <div className="absolute inset-2 bg-white rounded-full flex flex-col items-center justify-center shadow-lg">
                    <span className="text-3xl font-black text-slate-900">{metrics.apptStats.total}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Citas Totales</span>
                  </div>
                </div>

                <div className="space-y-4 w-full md:w-auto">
                  <div className="flex items-center justify-between gap-6 p-3 rounded-xl hover:bg-emerald-50 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                      <span className="font-bold text-sm text-slate-700">Completadas</span>
                    </div>
                    <span className="font-black text-slate-900">{metrics.apptStats.completed}</span>
                  </div>
                  <div className="flex items-center justify-between gap-6 p-3 rounded-xl hover:bg-blue-50 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <span className="font-bold text-sm text-slate-700">Confirmadas</span>
                    </div>
                    <span className="font-black text-slate-900">{metrics.apptStats.confirmed}</span>
                  </div>
                  <div className="flex items-center justify-between gap-6 p-3 rounded-xl hover:bg-red-50 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      <span className="font-bold text-sm text-slate-700">Canceladas</span>
                    </div>
                    <span className="font-black text-slate-900">{metrics.apptStats.cancelled}</span>
                  </div>
                  {metrics.apptStats.noShow > 0 && (
                    <div className="flex items-center justify-between gap-6 p-3 rounded-xl hover:bg-amber-50 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                        <span className="font-bold text-sm text-slate-700">No asistieron</span>
                      </div>
                      <span className="font-black text-slate-900">{metrics.apptStats.noShow}</span>
                    </div>
                  )}
                  {metrics.apptStats.otras > 0 && (
                    <div className="flex items-center justify-between gap-6 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-slate-300"></div>
                        <span className="font-bold text-sm text-slate-700">Otros estados</span>
                      </div>
                      <span className="font-black text-slate-900">{metrics.apptStats.otras}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

      </div>

    </div>
  )
}


// ============================================================================
// v2.8: RetentionBlock — métricas de retención (snapshot + tendencia 6 meses)
// ============================================================================
function RetentionBlock() {
  const { data: profile } = useQuery({
    queryKey: ['currentUserProfile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      return data
    }
  })
  const companyId = profile?.company_id

  const { data: snapshot } = useQuery({
    queryKey: ['retentionSnapshot', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase.from('v_retention_metrics').select('*').eq('company_id', companyId).maybeSingle()
      return data || { pacientes_nuevos_mes: 0, pacientes_volvieron_mes: 0, pacientes_inactivos_90d: 0, pacientes_activos_total: 0, pacientes_nuevos_mes_anterior: 0 }
    }
  })

  const { data: monthly = [] } = useQuery({
    queryKey: ['retentionMonthly', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from('v_retention_monthly')
        .select('*')
        .eq('company_id', companyId)
        .order('month_start', { ascending: true })
      return (data || []) as Array<{ month_key: string, month_label: string, nuevos: number, volvieron: number, citas_completadas: number }>
    }
  })

  if (!snapshot) return null

  // Cálculo de tendencia mes vs mes anterior
  const trendNuevos = snapshot.pacientes_nuevos_mes_anterior > 0
    ? Math.round(((snapshot.pacientes_nuevos_mes - snapshot.pacientes_nuevos_mes_anterior) / snapshot.pacientes_nuevos_mes_anterior) * 100)
    : null

  const maxNuevos = Math.max(...monthly.map(m => m.nuevos), 1)
  const maxVolvieron = Math.max(...monthly.map(m => m.volvieron), 1)
  const maxBar = Math.max(maxNuevos, maxVolvieron, 1)

  return (
    <div className="bg-gradient-to-br from-emerald-50/40 via-white to-blue-50/30 rounded-[2rem] border border-emerald-100 p-6 md:p-8 mb-8">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-900 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-md">
              <TrendingUp size={18} />
            </div>
            Salud real de tu negocio
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-1.5">
            Las 3 cifras que importan: cuánto creces, cuánto te quedas con lo que tienes, y cuánto se te está yendo.
          </p>
        </div>
        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-full uppercase tracking-wider">
          Snapshot actual
        </span>
      </div>

      {/* Las 3 cifras */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Nuevos */}
        <div className="bg-white rounded-2xl border-2 border-emerald-200 p-5 shadow-sm">
          <div className="flex items-start justify-between mb-2">
            <p className="text-xs font-black text-emerald-700 uppercase tracking-wider">Pacientes nuevos · este mes</p>
            {trendNuevos !== null && (
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                trendNuevos >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}>
                {trendNuevos >= 0 ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
                {Math.abs(trendNuevos)}%
              </span>
            )}
          </div>
          <p className="text-4xl font-black text-emerald-700 tabular-nums">{snapshot.pacientes_nuevos_mes}</p>
          <p className="text-[11px] text-slate-500 font-medium mt-1.5">
            vs {snapshot.pacientes_nuevos_mes_anterior} mes anterior
          </p>
        </div>

        {/* Volvieron */}
        <div className="bg-white rounded-2xl border-2 border-blue-200 p-5 shadow-sm">
          <p className="text-xs font-black text-blue-700 uppercase tracking-wider mb-2">Pacientes que volvieron</p>
          <p className="text-4xl font-black text-blue-700 tabular-nums">{snapshot.pacientes_volvieron_mes}</p>
          <p className="text-[11px] text-slate-500 font-medium mt-1.5">
            Repetidores este mes (ya habían venido antes)
          </p>
        </div>

        {/* Inactivos */}
        <div className="bg-white rounded-2xl border-2 border-amber-200 p-5 shadow-sm">
          <p className="text-xs font-black text-amber-700 uppercase tracking-wider mb-2">Inactivos +90 días</p>
          <p className="text-4xl font-black text-amber-600 tabular-nums">{snapshot.pacientes_inactivos_90d}</p>
          <p className="text-[11px] text-slate-500 font-medium mt-1.5">
            Pacientes dormidos elegibles para reactivar
          </p>
        </div>
      </div>

      {/* Mini-bar chart de tendencia */}
      {monthly.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-black text-slate-700 uppercase tracking-wider">Tendencia últimos 12 meses</p>
            <div className="flex items-center gap-4 text-[10px] font-bold">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500"></span> Nuevos</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-blue-500"></span> Volvieron</span>
            </div>
          </div>
          <div className="grid grid-cols-12 gap-1.5">
            {monthly.map(m => (
              <div key={m.month_key} className="flex flex-col items-center gap-1">
                <div className="h-32 w-full flex items-end gap-0.5 justify-center">
                  <div
                    className="flex-1 max-w-[8px] bg-emerald-500 rounded-t-sm transition-all hover:bg-emerald-600"
                    style={{ height: `${(m.nuevos / maxBar) * 100}%`, minHeight: m.nuevos > 0 ? '4px' : '0' }}
                    title={`${m.nuevos} nuevos`}
                  />
                  <div
                    className="flex-1 max-w-[8px] bg-blue-500 rounded-t-sm transition-all hover:bg-blue-600"
                    style={{ height: `${(m.volvieron / maxBar) * 100}%`, minHeight: m.volvieron > 0 ? '4px' : '0' }}
                    title={`${m.volvieron} volvieron`}
                  />
                </div>
                <span className="text-[9px] font-bold text-slate-400 uppercase">{m.month_label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// v2.8: ReferralBlock — breakdown por fuente + top referidores
// ============================================================================
function ReferralBlock() {
  const { data: profile } = useQuery({
    queryKey: ['currentUserProfile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      return data
    }
  })
  const companyId = profile?.company_id

  const { data: breakdown = [] } = useQuery({
    queryKey: ['referralBreakdown', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from('v_referral_breakdown')
        .select('*')
        .eq('company_id', companyId)
        .order('total_contacts', { ascending: false })
      return (data || []) as Array<{ source: string, total_contacts: number, converted_contacts: number, new_this_month: number }>
    }
  })

  const { data: topReferrers = [] } = useQuery({
    queryKey: ['topReferrers', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from('v_top_referrers')
        .select('*')
        .eq('company_id', companyId)
        .order('referrals_count', { ascending: false })
        .limit(5)
      return (data || []) as Array<{ referrer_contact_id: string, referrer_name: string, referrer_phone: string, referrals_count: number, referrals_converted: number }>
    }
  })

  const totalTracked = breakdown.reduce((acc, b) => acc + b.total_contacts, 0)
  const totalKnown = breakdown.filter(b => b.source !== 'unknown').reduce((acc, b) => acc + b.total_contacts, 0)

  const sourceLabels: Record<string, { label: string, color: string }> = {
    patient:   { label: 'Otro paciente',     color: 'bg-emerald-500' },
    doctor:    { label: 'Otro médico',       color: 'bg-blue-500' },
    google:    { label: 'Google',            color: 'bg-amber-500' },
    facebook:  { label: 'Facebook',          color: 'bg-indigo-500' },
    instagram: { label: 'Instagram',         color: 'bg-pink-500' },
    direct:    { label: 'Recomendación directa', color: 'bg-purple-500' },
    event:     { label: 'Evento/feria',      color: 'bg-cyan-500' },
    other:     { label: 'Otra fuente',       color: 'bg-slate-400' },
    unknown:   { label: 'Sin clasificar',    color: 'bg-slate-300' }
  }

  if (totalTracked === 0) return null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      {/* Breakdown por fuente */}
      <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <Share2 size={18} className="text-emerald-500" />
            De dónde vienen tus pacientes
          </h3>
          <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
            {totalKnown}/{totalTracked} clasificados
          </span>
        </div>

        <div className="space-y-3">
          {breakdown.map(b => {
            const cfg = sourceLabels[b.source] || sourceLabels.unknown
            const pct = totalTracked > 0 ? Math.round((b.total_contacts / totalTracked) * 100) : 0
            const conversionPct = b.total_contacts > 0 ? Math.round((b.converted_contacts / b.total_contacts) * 100) : 0

            return (
              <div key={b.source}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-slate-700">{cfg.label}</span>
                  <span className="font-bold text-slate-500 tabular-nums">
                    {b.total_contacts} <span className="text-slate-400">·</span> {pct}%
                    {b.converted_contacts > 0 && (
                      <span className="text-emerald-600 ml-2">{conversionPct}% convirtieron</span>
                    )}
                  </span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${cfg.color} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Top referidores */}
      <div className="bg-gradient-to-br from-emerald-50 to-white rounded-[2rem] border border-emerald-100 p-6 shadow-sm">
        <h3 className="text-base font-black text-slate-900 flex items-center gap-2 mb-4">
          <Trophy size={18} className="text-emerald-500" />
          Tus mejores embajadores
        </h3>

        {topReferrers.length === 0 ? (
          <div className="py-12 text-center">
            <Trophy size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-500 font-bold">Aún sin referidores registrados</p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
              Cuando un paciente refiera a otro, márcalo en su ficha. Aquí verás quién te trae más.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {topReferrers.map((r, idx) => (
              <div key={r.referrer_contact_id} className="flex items-center gap-3 px-3 py-2.5 bg-white border border-emerald-100 rounded-xl">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                  idx === 0 ? 'bg-amber-100 text-amber-700' :
                  idx === 1 ? 'bg-slate-200 text-slate-600' :
                  idx === 2 ? 'bg-orange-100 text-orange-700' :
                  'bg-slate-100 text-slate-500'
                }`}>
                  #{idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-slate-800 truncate">{r.referrer_name || 'Sin nombre'}</p>
                  <p className="text-[10px] text-slate-500 font-medium">{r.referrer_phone}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-black text-emerald-700 tabular-nums leading-none">{r.referrals_count}</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                    {r.referrals_converted > 0 && `${r.referrals_converted} convertidos`}
                    {r.referrals_converted === 0 && (r.referrals_count === 1 ? 'referido' : 'referidos')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
