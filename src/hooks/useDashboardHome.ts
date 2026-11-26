// Datos de la pantalla de inicio del panel: números, conversaciones recientes,
// notificaciones, citas de la semana y estado de las conexiones (WhatsApp y
// Google Calendar) para mostrar el aviso correcto cuando falta algo.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import {
  greetingName, recentConversations, weekDays, ymd, type AppointmentRow, type Conversation,
} from '../lib/dashboardHome'

export type DashboardNotification = {
  id: string
  title: string
  message: string
  link: string | null
  is_read: boolean | null
  created_at: string
}

export type DashboardHomeData = {
  companyId: string
  userName: string
  whatsappConnected: boolean
  calendarConnected: boolean
  calendarVerified: boolean
  totalClients: number
  pendingChats: number
  teamCount: number
  activeOrders: number
  /** Últimos 3 clientes y miembros del equipo dados de alta, como atajos. */
  recentClients: { id: string; name: string | null; phone: string | null }[]
  recentTeam: { id: string; full_name: string | null; avatar_url: string | null }[]
  conversations: (Conversation & { name: string | null })[]
  notifications: DashboardNotification[]
  unreadNotifications: number
  /** Citas de la semana en curso y de los próximos 14 días. */
  appointments: AppointmentRow[]
}

export function useDashboardHome() {
  return useQuery({
    queryKey: ['dashboardHome'],
    queryFn: async (): Promise<DashboardHomeData> => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      const { data: profile } = await supabase.from('profiles').select('company_id, full_name').eq('id', user.id).single()
      if (!profile?.company_id) throw new Error('Sin empresa')
      const companyId = profile.company_id as string

      const now = new Date()
      const from = ymd(weekDays(now)[0])
      const to = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14))
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

      const { data: agendas } = await supabase
        .from('agendas').select('id, google_calendar_id, is_verified').eq('company_id', companyId)
      const agendaIds = (agendas || []).map(a => a.id as string)

      const apptFields = 'id, appointment_date, appointment_time, status, patient_name, notes, duration_minutes'
      const [
        companyRes, contactsRes, pendingRes, teamRes, ordersRes, msgsRes, notifRes, unreadRes, apptCompanyRes, apptAgendaRes,
        recentClientsRes, recentTeamRes,
      ] = await Promise.all([
        supabase.from('companies').select('doctor_name, name, business_phone_id').eq('id', companyId).single(),
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('ai_active', false),
        supabase.from('team').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
        supabase.from('orders').select('id', { count: 'exact', head: true })
          .eq('company_id', companyId).gte('created_at', todayStart).not('status_semantic', 'in', '(delivered,cancelled)'),
        supabase.from('messages').select('patient_id, content, sender, created_at')
          .eq('company_id', companyId).order('created_at', { ascending: false }).limit(80),
        supabase.from('notifications').select('id, title, message, link, is_read, created_at')
          .eq('company_id', companyId).order('created_at', { ascending: false }).limit(3),
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_read', false),
        supabase.from('appointments').select(apptFields)
          .eq('company_id', companyId).gte('appointment_date', from).lte('appointment_date', to),
        agendaIds.length
          ? supabase.from('appointments').select(apptFields)
            .in('agenda_id', agendaIds).gte('appointment_date', from).lte('appointment_date', to)
          : Promise.resolve({ data: [] as AppointmentRow[] }),
        supabase.from('contacts').select('id, name, phone')
          .eq('company_id', companyId).order('created_at', { ascending: false }).limit(3),
        supabase.from('team').select('id, full_name, avatar_url')
          .eq('company_id', companyId).order('created_at', { ascending: false }).limit(3),
      ])

      const conversations = recentConversations(msgsRes.data || [], 3)
      const ids = conversations.map(c => c.patientId)
      const { data: contacts } = ids.length
        ? await supabase.from('contacts').select('external_id, name').eq('company_id', companyId).in('external_id', ids)
        : { data: [] as { external_id: string, name: string | null }[] }
      const nameById = new Map((contacts || []).map(c => [c.external_id, c.name]))

      // Las citas pueden colgar de la empresa o de una agenda; se juntan sin repetir.
      const byId = new Map<string, AppointmentRow>()
      for (const a of [...(apptCompanyRes.data || []), ...((apptAgendaRes as { data: AppointmentRow[] | null }).data || [])]) {
        byId.set(a.id, a as AppointmentRow)
      }

      const messagedContacts = new Set((msgsRes.data || []).map(m => m.patient_id).filter(Boolean)).size

      return {
        companyId,
        userName: greetingName(profile.full_name as string | null)
          || companyRes.data?.doctor_name || companyRes.data?.name || '',
        whatsappConnected: !!companyRes.data?.business_phone_id,
        calendarConnected: (agendas || []).some(a => !!a.google_calendar_id),
        calendarVerified: (agendas || []).some(a => !!a.google_calendar_id && a.is_verified),
        totalClients: Math.max(contactsRes.count || 0, messagedContacts),
        pendingChats: pendingRes.count || 0,
        teamCount: teamRes.count || 0,
        activeOrders: ordersRes.count || 0,
        recentClients: recentClientsRes.data || [],
        recentTeam: recentTeamRes.data || [],
        conversations: conversations.map(c => ({ ...c, name: nameById.get(c.patientId) ?? null })),
        notifications: (notifRes.data || []) as DashboardNotification[],
        unreadNotifications: unreadRes.count || 0,
        appointments: [...byId.values()],
      }
    },
    staleTime: 30 * 1000,
  })
}
