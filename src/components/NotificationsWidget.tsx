 

'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Bell, Check, MessageSquare, UserCog, CheckCircle2, Trash2 } from 'lucide-react'

type Notification = {
  id: string
  company_id: string
  title: string
  message: string
  type: string
  is_read: boolean
  link: string
  created_at: string
}

export default function NotificationsWidget() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Cerrar al hacer clic afuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // 1. Obtener la compañía del usuario actual
  useEffect(() => {
    const getCompany = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
        if (data) setCompanyId(data.company_id)
      }
    }
    getCompany()
  }, [])

  // 2. Traer notificaciones
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(20) // Mostramos las últimas 20
      return (data as Notification[]) || []
    }
  })

  // 3. Suscripción en Tiempo Real
  useEffect(() => {
    if (!companyId) return

    const channel = supabase
      .channel('realtime_notifications')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications',
        filter: `company_id=eq.${companyId}`
      }, (payload) => {
        const newNotif = payload.new as Notification
        
        // Lanzamos un Toast bonito
        toast.custom((t) => (
          <div className="flex items-start gap-3 bg-white p-4 rounded-2xl shadow-xl border border-slate-100 animate-in slide-in-from-top-2">
            <div className={`p-2 rounded-full mt-0.5 ${newNotif.type === 'human_request' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'}`}>
              {newNotif.type === 'human_request' ? <UserCog size={16} /> : <MessageSquare size={16} />}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">{newNotif.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{newNotif.message}</p>
            </div>
          </div>
        ), { duration: 4000 })

        // Actualizamos Caché
        queryClient.setQueryData(['notifications', companyId], (old: Notification[] = []) => [newNotif, ...old])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [companyId, queryClient])

  // 4. Mutaciones: Marcar como leída y Marcar todas
  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    },
    onMutate: async (id) => {
      queryClient.setQueryData(['notifications', companyId], (old: Notification[] = []) => 
        old.map(n => n.id === id ? { ...n, is_read: true } : n)
      )
    }
  })

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await supabase.from('notifications').update({ is_read: true }).eq('company_id', companyId).eq('is_read', false)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', companyId] })
  })

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      await supabase.from('notifications').delete().eq('company_id', companyId)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', companyId] })
  })

  const handleNotificationClick = (notif: Notification) => {
    if (!notif.is_read) markAsReadMutation.mutate(notif.id)
    setIsOpen(false)
    if (notif.link) router.push(notif.link)
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="relative" ref={popoverRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="text-slate-400 hover:text-blue-600 transition-colors relative p-2 rounded-full hover:bg-slate-100"
        aria-label="Notificaciones"
      >
        <Bell size={20} strokeWidth={1.5} className={unreadCount > 0 ? "text-slate-700" : ""} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 bg-rose-500 rounded-full border-2 border-slate-50 animate-pulse"></span>
        )}
      </button>

      {/* AQUÍ ESTÁ EL FIX: 
        1. z-[9999] fuerza al menú a estar literalmente por encima de TODO en la pantalla.
        2. Le quitamos el overflow-hidden al header padre en layout.tsx si fuera necesario, 
           pero absolute z-[9999] usualmente lo resuelve por sí solo. 
      */}
      {isOpen && (
        <>
          {/* Backdrop solo móvil para cerrar al tocar fuera */}
          <div className="sm:hidden fixed inset-0 z-[9998] bg-black/20" onClick={() => setIsOpen(false)} />

          <div className="
            fixed sm:absolute
            inset-x-2 top-16 sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-3
            sm:w-96 bg-white rounded-3xl shadow-2xl border border-slate-200 z-[9999]
            animate-in fade-in slide-in-from-top-2 overflow-hidden flex flex-col max-h-[85vh]
          ">
          
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 shrink-0 flex items-center justify-between">
            <h3 className="font-black text-slate-800 flex items-center gap-2">
              Notificaciones {unreadCount > 0 && <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full text-[10px]">{unreadCount} nuevas</span>}
            </h3>
            <div className="flex gap-2">
              <button onClick={() => markAllAsReadMutation.mutate()} title="Marcar leídas" className="text-slate-400 hover:text-blue-600 p-1 bg-white rounded-md border border-slate-200"><CheckCircle2 size={14}/></button>
              <button onClick={() => clearAllMutation.mutate()} title="Limpiar todo" className="text-slate-400 hover:text-rose-600 p-1 bg-white rounded-md border border-slate-200"><Trash2 size={14}/></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-[200px]">
            {notifications.length === 0 ? (
              <div className="p-10 text-center flex flex-col items-center">
                <Bell size={40} className="text-slate-200 mb-3" />
                <p className="text-sm font-bold text-slate-400">No tienes notificaciones pendientes.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {notifications.map((notif) => (
                  <div 
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-4 flex gap-4 cursor-pointer transition-colors hover:bg-slate-50 ${!notif.is_read ? 'bg-blue-50/20' : 'opacity-70'}`}
                  >
                    <div className={`mt-1 shrink-0 h-10 w-10 rounded-full flex items-center justify-center shadow-sm
                      ${notif.type === 'human_request' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'}`}
                    >
                      {notif.type === 'human_request' ? <UserCog size={18} /> : <MessageSquare size={18} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${!notif.is_read ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>{notif.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{notif.message}</p>
                      <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-wider">
                        {new Date(notif.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {!notif.is_read && <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0"></div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        </>
      )}
    </div>
  )
}
