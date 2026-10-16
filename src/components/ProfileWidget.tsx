 

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { LogOut, ChevronDown, User, Settings, MessageSquare, Sparkles, Building2 } from 'lucide-react'

export default function ProfileWidget() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('Cargando...')
  const [companyName, setCompanyName] = useState('')
  const [initial, setInitial] = useState('')
  const [planName, setPlanName] = useState('Plan Básico')
  const [isOpen, setIsOpen] = useState(false)

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-profile-widget]')) setIsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  useEffect(() => {
    const fetchProfile = async () => {
      // 1. Obtenemos el usuario actual
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // 2. Buscamos a qué empresa pertenece
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()

      if (profile?.company_id) {
        // 3. Traemos los datos de la empresa y su plan
        const { data: company, error } = await supabase
          .from('companies')
          .select('name, doctor_name, plan_slug')
          .eq('id', profile.company_id)
          .single()

        if (company && !error) {
          const isClinic = company.plan_slug === 'centro_salud'

          // Lógica: Si es Centro de Salud mostramos la Clínica, si no, el nombre del Doctor
          const mainName = isClinic ? (company.name || 'Clínica Sin Nombre') : (company.doctor_name || company.name || 'Usuario')

          setDisplayName(mainName)
          setCompanyName(company.name || '')

          // Nombres legibles para los planes
          const planMap: Record<string, string> = {
            'personal': 'Plan Básico',
            'personal_plus': 'Plan Plus',
            'centro_salud': 'Centro de Salud',
            'starter': 'Plan Starter'
          }
          setPlanName(planMap[company.plan_slug] || 'Plan Básico')

          // Extraemos la inicial limpia (ignorando Dr. o Dra.)
          const cleanName = mainName.replace(/^(Dr\.|Dra\.|Dr|Dra)\s+/i, '')
          setInitial(cleanName.charAt(0).toUpperCase())
        }
      } else {
        setDisplayName('Usuario')
      }
    }

    fetchProfile()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <div className="relative" data-profile-widget>
      {/* BOTÓN PRINCIPAL DEL WIDGET */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 bg-white border border-slate-200 hover:border-slate-300 rounded-full pl-1.5 pr-3 py-1.5 transition-all shadow-sm cursor-pointer"
      >
        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center font-black text-sm shadow-inner">
          {initial ? initial : <User size={16} strokeWidth={2} />}
        </div>
        <span className="text-sm font-bold text-slate-700 hidden sm:block truncate max-w-[140px]">
          {displayName}
        </span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* MENÚ DESPLEGABLE */}
      {isOpen && (
        <>
          {/* Backdrop solo móvil */}
          <div className="sm:hidden fixed inset-0 z-[9998] bg-black/20" onClick={() => setIsOpen(false)} />

          <div className="
            fixed sm:absolute
            inset-x-2 top-16 sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2
            sm:w-64 bg-white rounded-[24px] shadow-2xl shadow-slate-200/50
            border border-slate-100 z-[9999] overflow-hidden flex flex-col
          ">

        {/* Cabecera del Menú */}
        <div className="p-5 bg-slate-50 border-b border-slate-100">
          <p className="text-base font-black text-slate-900 truncate">{displayName}</p>
          <p className="text-xs font-medium text-slate-500 truncate mt-0.5">{companyName}</p>
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase tracking-widest rounded-lg border border-indigo-200">
            {planName === 'Centro de Salud' ? <Building2 size={10} /> : <User size={10} />}
            {planName}
          </div>
        </div>

        {/* Opciones Principales */}
        <div className="p-2 flex flex-col gap-1">
          <button
            onClick={() => router.push('/dashboard/inbox')}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-600 font-semibold hover:bg-slate-50 hover:text-blue-600 rounded-xl transition-colors"
          >
            <MessageSquare size={16} />
            Bandeja de Mensajes
          </button>

          <button
            onClick={() => router.push('/dashboard/settings')}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-600 font-semibold hover:bg-slate-50 hover:text-blue-600 rounded-xl transition-colors"
          >
            <Settings size={16} />
            Configuración
          </button>
        </div>

        <div className="h-px w-full bg-slate-100" />

        {/* Sección de Mejora de Plan */}
        <div className="p-2">
          <button
            onClick={() => router.push('/dashboard/plans')}
            className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-xl transition-colors border border-amber-100"
          >
            <span className="flex items-center gap-3">
              <Sparkles size={16} className="text-amber-500" />
              Mejorar Plan
            </span>
          </button>
        </div>

        <div className="h-px w-full bg-slate-100" />

        {/* Botón de Salir */}
        <div className="p-2">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-rose-600 font-bold hover:bg-rose-50 rounded-xl transition-colors"
          >
            <LogOut size={16} strokeWidth={2} />
            Cerrar sesión
          </button>
        </div>

          </div>
        </>
      )}
    </div>
  )
}
