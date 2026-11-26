'use client'

// Inicio del panel, según el diseño de Figma (Dashboard high fidelity, nov
// 2026): saludo, tres números, mensajes y notificaciones recientes,
// calendario de la semana y próximas citas. Las palabras cambian con la
// industria (Pacientes, Prospectos, Comensales…) y cada bloque tiene su
// estado vacío o su aviso cuando falta conectar algo.

import { useEffect, useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight, Bot, CalendarDays, ChevronRight, ClipboardList, MessageSquare, Plug, UserCog, Users,
  BellRing, CalendarX2, AlertTriangle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useWorkspace } from '../../components/WorkspaceContext'
import { useEntitlements } from '../../hooks/useEntitlements'
import { useUsageSummary } from '../../hooks/useBilling'
import { useDashboardHome, type DashboardHomeData } from '../../hooks/useDashboardHome'
import IAnswerLoader from '../../components/IAnswerLoader'
import { StatCard, SectionCard as Card, accentTint } from '../../components/ui/DashCards'
import {
  greeting, gridHours, initials, isActiveAppointment, startsIn, timeAgo,
  upcomingAppointments, weekDays, ymd, type AppointmentRow,
} from '../../lib/dashboardHome'

const n = (v: number) => v.toLocaleString('es-MX')

export default function DashboardPage() {
  const { labels, modules, isLoadingWorkspace } = useWorkspace()
  const { data: entitlements } = useEntitlements()
  const { data, isLoading, error } = useDashboardHome()
  const { data: usage } = useUsageSummary(data?.companyId)
  const queryClient = useQueryClient()

  // Tiempo real: mensajes, contactos, notificaciones y citas nuevas vuelven a
  // cargar el inicio (agrupado para no recalcular con cada mensaje de una ráfaga).
  const companyId = data?.companyId
  useEffect(() => {
    if (!companyId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => queryClient.invalidateQueries({ queryKey: ['dashboardHome'] }), 800)
    }
    const filter = `company_id=eq.${companyId}`
    const channel = supabase
      .channel('realtime_dashboard_home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts', filter }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter }, refresh)
      .subscribe()
    return () => {
      clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [companyId, queryClient])

  if (isLoadingWorkspace || isLoading) {
    return (
      <div className="h-[calc(100vh-120px)] flex items-center justify-center">
        <IAnswerLoader size={40} label="Preparando tu espacio..." />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <p className="text-sm text-slate-500">No se pudo cargar tu inicio. Intenta recargar la página.</p>
      </div>
    )
  }

  const features = entitlements?.features as Record<string, boolean | undefined> | undefined
  const hasTeam = features?.team_management !== false
  const clients = labels?.clients || 'Clientes'
  const appointmentsLabel = labels?.appointments || 'Citas'
  const appointmentLabel = labels?.appointment || 'Cita'
  const today = ymd(new Date())
  const todayPending = data.appointments.filter(a => a.appointment_date === today && isActiveAppointment(a)).length
  const ai = usage?.metrics?.ai_replies

  return (
    <div className="pb-12 space-y-6 animate-in fade-in duration-500">
      <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight pt-2">
        {greeting()}{data.userName ? `, ${data.userName}` : ''}
      </h1>

      {!data.whatsappConnected && (
        <Notice
          icon={<Plug size={16} />}
          text="Tu WhatsApp todavía no está conectado: tu asistente no puede contestar mensajes."
          href="/dashboard/connectivity"
          cta="Conectar WhatsApp"
        />
      )}

      {/* ── Números ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5">
        <StatCard
          title={`${clients} totales`}
          subtitle="Personas con las que has hablado"
          value={n(data.totalClients)}
          icon={<Users size={18} />}
          href="/dashboard/crm"
          shortcuts={{
            empty: `Aún no hay ${clients.toLowerCase()}.`,
            items: data.recentClients.map(c => ({
              key: c.id,
              label: c.name?.trim() || c.phone || 'Sin nombre',
              href: `/dashboard/crm/clientes?contactId=${c.id}`,
            })),
          }}
        />
        {modules.menu ? (
          <StatCard
            title="Pedidos activos"
            subtitle="Recibidos hoy, sin entregar"
            value={n(data.activeOrders)}
            icon={<ClipboardList size={18} />}
            href="/dashboard/orders"
          />
        ) : modules.calendar ? (
          <StatCard
            title={`${appointmentsLabel} pendientes`}
            subtitle="Para hoy"
            value={n(todayPending)}
            icon={<CalendarDays size={18} />}
            href="/dashboard/calendar"
          />
        ) : (
          <StatCard
            title="Esperando a tu equipo"
            subtitle="Conversaciones en modo humano"
            value={n(data.pendingChats)}
            icon={<MessageSquare size={18} />}
            href="/dashboard/inbox?filtro=atencion"
          />
        )}
        {hasTeam ? (
          <StatCard
            title={labels?.staff_plural?.trim() || 'Equipo'}
            subtitle="Personas activas"
            value={n(data.teamCount)}
            icon={<UserCog size={18} />}
            href="/dashboard/team"
            shortcuts={{
              empty: 'Aún no hay nadie en tu equipo.',
              items: data.recentTeam.map(m => ({
                key: m.id,
                label: m.full_name?.trim() || 'Sin nombre',
                href: `/dashboard/team?memberId=${m.id}`,
                avatarUrl: m.avatar_url,
              })),
            }}
          />
        ) : (
          <StatCard
            title="Respuestas de IA"
            subtitle={ai?.limit ? `De ${n(ai.limit)} en este periodo` : 'En este periodo'}
            value={n(ai?.used ?? 0)}
            icon={<Bot size={18} />}
            href="/dashboard/plans"
          />
        )}
      </div>

      {/* ── Mensajes y notificaciones ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_330px] gap-5">
        <Card title="Mensajes" href="/dashboard/inbox" linkLabel="Ver todos">
          <MessagesList data={data} />
        </Card>
        <Card title="Notificaciones" href="/dashboard/inbox" linkLabel="Ver todas" badge={data.unreadNotifications}>
          <NotificationsList data={data} />
        </Card>
      </div>

      {/* ── Calendario y próximas citas ─────────────────────────────────── */}
      {modules.calendar && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_330px] gap-5">
          <Card title="Calendario de la semana" href="/dashboard/calendar" linkLabel="Ver todo">
            {data.calendarConnected
              ? <WeekCalendar appointments={data.appointments} verified={data.calendarVerified} />
              : <ConnectCalendar />}
          </Card>
          <Card title={appointmentsLabel} href="/dashboard/calendar" linkLabel="Ver todas">
            <Upcoming
              appointments={data.appointments}
              appointmentLabel={appointmentLabel}
              appointmentsLabel={appointmentsLabel}
              calendarConnected={data.calendarConnected}
            />
          </Card>
        </div>
      )}
    </div>
  )
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

function Avatar({ name, size = 36 }: { name: string | null; size?: number }) {
  return (
    <span
      className="shrink-0 rounded-full flex items-center justify-center font-bold text-(--ia-accent)"
      style={{ width: size, height: size, backgroundColor: accentTint(14), fontSize: size * 0.33 }}
      title={name || undefined}
    >
      {initials(name)}
    </span>
  )
}

function Empty({ icon, title, text, href, cta }: { icon: ReactNode; title: string; text: string; href?: string; cta?: string }) {
  return (
    <div className="h-full min-h-40 flex flex-col items-center justify-center text-center py-6 px-4">
      <span className="h-10 w-10 rounded-xl flex items-center justify-center mb-3 text-(--ia-accent)" style={{ backgroundColor: accentTint(10) }}>{icon}</span>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="text-xs text-slate-500 mt-1 max-w-xs">{text}</p>
      {href && cta && (
        <Link href={href} className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-(--ia-accent) text-white text-xs font-bold hover:brightness-110">
          {cta} <ArrowRight size={13} />
        </Link>
      )}
    </div>
  )
}

function Notice({ icon, text, href, cta }: { icon: ReactNode; text: string; href: string; cta: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <span className="text-amber-700 shrink-0">{icon}</span>
      <p className="flex-1 text-sm text-amber-900">{text}</p>
      <Link href={href} className="shrink-0 text-sm font-semibold text-amber-900 underline">{cta}</Link>
    </div>
  )
}

function MessagesList({ data }: { data: DashboardHomeData }) {
  if (data.conversations.length === 0) {
    return data.whatsappConnected
      ? <Empty icon={<MessageSquare size={18} />} title="Aún no hay mensajes" text="Cuando tus clientes te escriban, aquí verás las últimas conversaciones." />
      : <Empty icon={<Plug size={18} />} title="Aún no hay mensajes" text="Conecta tu WhatsApp para que tu asistente empiece a contestar." href="/dashboard/connectivity" cta="Conectar WhatsApp" />
  }
  return (
    <ul className="divide-y divide-slate-200 -my-1">
      {data.conversations.map(c => {
        const name = c.name || c.patientId
        return (
          <li key={c.patientId}>
            <Link href={c.contactId ? `/dashboard/inbox?contactId=${c.contactId}` : '/dashboard/inbox'} className="flex items-start gap-3 py-3.5 group">
              <Avatar name={name} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900 truncate group-hover:underline">{name}</p>
                  <span className="shrink-0 flex items-center gap-1.5 text-[11px] text-slate-500">
                    {timeAgo(c.lastAt)}
                    {c.waitingReply && <span className="h-1.5 w-1.5 rounded-full bg-(--ia-accent)" aria-label="Sin responder" />}
                  </span>
                </div>
                <p className="text-sm text-slate-600 line-clamp-2 mt-0.5">{c.lastMessage || 'Mensaje sin texto'}</p>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function NotificationsList({ data }: { data: DashboardHomeData }) {
  if (data.notifications.length === 0) {
    return <Empty icon={<BellRing size={18} />} title="Todo al día" text="Aquí aparecen avisos como pedidos de atención humana o de tu consumo." />
  }
  return (
    <ul className="space-y-1 -mx-2">
      {data.notifications.map(notif => {
        const content = (
          <>
            <div className="flex-1 min-w-0">
              <p className={`text-sm truncate ${notif.is_read ? 'text-slate-700' : 'text-slate-900 font-semibold'}`}>{notif.title}</p>
              <p className="text-xs text-slate-500 truncate">{notif.message}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{timeAgo(notif.created_at)}</p>
            </div>
            {notif.link && <ChevronRight size={16} className="text-slate-400 shrink-0" />}
          </>
        )
        return (
          <li key={notif.id}>
            {notif.link
              ? <Link href={notif.link} className="flex items-center gap-2 rounded-lg px-2 py-2.5 hover:bg-slate-50">{content}</Link>
              : <div className="flex items-center gap-2 px-2 py-2.5">{content}</div>}
          </li>
        )
      })}
    </ul>
  )
}

function ConnectCalendar() {
  return (
    <Empty
      icon={<CalendarX2 size={18} />}
      title="Conecta tu Google Calendar"
      text="Así tu asistente agenda solo y aquí ves las citas de la semana."
      href="/dashboard/settings?tab=calendars"
      cta="Conectar calendario"
    />
  )
}

const DAY = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })

function WeekCalendar({ appointments, verified }: { appointments: AppointmentRow[]; verified: boolean }) {
  const days = useMemo(() => weekDays(), [])
  const week = useMemo(() => {
    const keys = new Set(days.map(ymd))
    return appointments.filter(a => keys.has(a.appointment_date) && isActiveAppointment(a))
  }, [appointments, days])
  const hours = gridHours(week)
  const today = ymd(new Date())

  return (
    <div className="space-y-3">
      {!verified && (
        <p className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          Tu calendario está conectado pero falta verificar que nos lo compartiste. Revísalo en Configuración → Google Calendar.
        </p>
      )}
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full min-w-[640px] table-fixed text-[11px]">
          <thead>
            <tr className="bg-slate-50 text-slate-500 uppercase tracking-wide">
              <th className="w-14 py-2 text-left font-medium pl-2">Hora</th>
              {days.map(d => (
                <th key={ymd(d)} className={`py-2 text-left font-medium ${ymd(d) === today ? 'text-(--ia-accent)' : ''}`}>
                  {DAY.format(d).replace('.', '')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map(h => (
              <tr key={h} className="border-b border-slate-100 align-top">
                <td className="py-1.5 pl-2 text-slate-500 tabular-nums">{String(h).padStart(2, '0')}:00</td>
                {days.map(d => {
                  const cell = week.filter(a => a.appointment_date === ymd(d) && Number(a.appointment_time.split(':')[0]) === h)
                  return (
                    <td key={ymd(d)} className="py-1 pr-1.5">
                      {cell.map(a => (
                        <div key={a.id} className="rounded-md bg-(--ia-accent) text-white px-1.5 py-1 mb-1 leading-tight" title={a.patient_name || ''}>
                          <p className="font-semibold">{a.appointment_time.slice(0, 5)}</p>
                          <p className="truncate opacity-90">{a.patient_name || 'Sin nombre'}</p>
                        </div>
                      ))}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {week.length === 0 && (
        <p className="text-xs text-slate-500 text-center">No hay citas agendadas esta semana.</p>
      )}
    </div>
  )
}

function Upcoming({ appointments, appointmentLabel, appointmentsLabel, calendarConnected }: {
  appointments: AppointmentRow[]; appointmentLabel: string; appointmentsLabel: string; calendarConnected: boolean
}) {
  const next = upcomingAppointments(appointments, new Date(), 3)
  if (next.length === 0) {
    return calendarConnected
      ? <Empty icon={<CalendarDays size={18} />} title={`Sin ${appointmentsLabel.toLowerCase()} próximas`} text="Cuando tu asistente o tu equipo agenden, aparecerán aquí." />
      : <Empty icon={<CalendarX2 size={18} />} title={`Sin ${appointmentsLabel.toLowerCase()}`} text="Conecta tu Google Calendar para que tu asistente pueda agendar." href="/dashboard/settings?tab=calendars" cta="Conectar calendario" />
  }
  const [first, ...rest] = next
  const hhmm = (d: Date) => d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
  const now = new Date()
  const today = ymd(now)
  const tomorrow = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  const dayLabel = (d: Date) =>
    ymd(d) === today ? 'Hoy'
      : ymd(d) === tomorrow ? 'Mañana'
        : d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' }).replace('.', '')
  const end = (a: typeof first) => new Date(a.start.getTime() + (a.duration_minutes || 30) * 60_000)
  return (
    <div className="space-y-3">
      <div className="rounded-xl p-4" style={{ backgroundColor: accentTint(7) }}>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-bold text-(--ia-accent)">{startsIn(first.start)}</span>
          <span className="text-slate-500">{hhmm(first.start)} – {hhmm(end(first))}</span>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <Avatar name={first.patient_name} size={42} />
          <div className="min-w-0">
            <p className="text-base font-semibold text-slate-900 truncate">{first.patient_name || 'Sin nombre'}</p>
            <p className="text-sm text-slate-500 truncate">{first.notes || appointmentLabel}</p>
          </div>
        </div>
      </div>
      {rest.length > 0 && (
        <ul className="divide-y divide-slate-200">
          {rest.map(a => (
            <li key={a.id} className="flex items-center gap-3 py-3">
              <Avatar name={a.patient_name} size={36} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{a.patient_name || 'Sin nombre'}</p>
                <p className="text-xs text-slate-500 truncate">{a.notes || appointmentLabel}</p>
              </div>
              <div className="shrink-0 text-right whitespace-nowrap">
                <p className="text-xs font-semibold text-slate-700 tabular-nums">{hhmm(a.start)}</p>
                <p className="text-[11px] text-slate-400 capitalize">{dayLabel(a.start)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
