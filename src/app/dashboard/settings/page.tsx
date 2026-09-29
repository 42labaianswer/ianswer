 

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { useWorkspace } from '../../../components/WorkspaceContext'
import PageHeader from '../../../components/PageHeader'
import { useQuery } from '@tanstack/react-query'
import { 
  Settings, CreditCard, ChevronRight, Clock, CalendarDays, Settings2, MapPinned, CodeXml
} from 'lucide-react'

// IMPORTAMOS LOS COMPONENTES CREADOS
import ProfileTab from '../../../components/ProfileTab'
import WorkingHoursTab from '../../../components/WorkingHoursTab'
import AgendasTab from '../../../components/AgendaTab'
import LocationTab from '../../../components/LocationTab'
import WidgetTab from '../../../components/WidgetTab' // <-- NUEVO COMPONENTE
import SubscriptionSyncOnSuccess from '../../../components/SubscriptionSyncOnSuccess'
import IAnswerLoader from '../../../components/IAnswerLoader'

export default function SettingsPage() {
  const router = useRouter()
  const { labels } = useWorkspace()
  
  const [activeTab, setActiveTab] = useState<'profile' | 'hours' | 'calendars' | 'locations' | 'widget'>('profile')

  // 1. TANSTACK QUERY: Obtener toda la data inicial de la empresa
  const { data, isLoading } = useQuery({
    queryKey: ['settingsCompanyData'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Usuario no encontrado")

      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      if (!profile?.company_id) throw new Error("Compañía no encontrada")
      
      const companyId = profile.company_id

      const { data: companyData } = await supabase
        .from('companies')
        .select('plan_slug, subscription_status')
        .eq('id', companyId)
        .single()

      const planSlug = companyData?.plan_slug || 'personal'
      const subscriptionStatus = companyData?.subscription_status || 'inactive'
      
      let planName = 'Plan no encontrado'
      if (companyData?.plan_slug) {
        const { data: planInfo } = await supabase
          .from('plans')
          .select('name')
          .eq('slug', companyData.plan_slug)
          .maybeSingle()
        if (planInfo) planName = planInfo.name
      }

      return { companyId, planSlug, subscriptionStatus, planName }
    }
  })

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <IAnswerLoader size={40} />
      </div>
    )
  }

  const { companyId, planSlug, subscriptionStatus, planName } = data || {}

  // Estado de la suscripción en español y con su color (antes: "ESTADO: TRIALING"
  // en rojo — solo 'active' se veía bien, una prueba vigente parecía un error).
  const STATUS_BADGES: Record<string, { label: string, className: string }> = {
    active:   { label: 'Activa',          className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    trialing: { label: 'En prueba',       className: 'bg-indigo-400/20 text-indigo-200 border-indigo-400/30' },
    past_due: { label: 'Pago pendiente',  className: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    canceled: { label: 'Cancelada',       className: 'bg-red-500/20 text-red-300 border-red-500/30' },
    expired:  { label: 'Vencida',         className: 'bg-red-500/20 text-red-300 border-red-500/30' },
  }
  const statusBadge = STATUS_BADGES[subscriptionStatus || ''] ||
    { label: 'Sin plan activo', className: 'bg-red-500/20 text-red-300 border-red-500/30' }

  return (
    <div className="animate-in fade-in duration-500 pb-20">
      {/* Detecta regreso de Stripe (?success=true) y refresca features */}
      <SubscriptionSyncOnSuccess />

      <PageHeader
        title="Configuración"
        description="Gestiona tu perfil, suscripción, horarios y agendas."
      />

      {/* TARJETA DE SUSCRIPCIÓN — @container: se acomoda al ancho real del
          contenido (el sidebar ocupa 288 px desde md). */}
      <div className="@container">
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-3xl p-6 @2xl:p-8 text-white shadow-xl shadow-indigo-900/10 mb-8 flex flex-col @2xl:flex-row @2xl:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
        <div className="relative z-10 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <CreditCard size={20} className="text-indigo-400" />
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">Plan y Facturación</h2>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-3xl @2xl:text-4xl font-black break-words">{planName}</span>
            <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap ${statusBadge.className}`}>
              {statusBadge.label}
            </div>
          </div>
        </div>
        <button 
          onClick={() => router.push('/dashboard/plans')} 
          className="relative z-10 shrink-0 flex items-center gap-2 bg-white text-slate-900 px-6 py-3 rounded-xl font-bold hover:bg-indigo-50 transition-colors shadow-sm w-full @2xl:w-auto justify-center"
        >
          Gestionar Suscripción <ChevronRight size={18} />
        </button>
      </div>
      </div>

      {/* DISEÑO POR PESTAÑAS (TABS) */}
      {/* Menú al lado del contenido (y fijo al hacer scroll) solo cuando hay
          espacio; en angosto va arriba como pestañas horizontales, sin sticky
          (antes se quedaba pegado arriba tapando el contenido). */}
      <div className="@container">
      <div className="flex flex-col @4xl:flex-row gap-6 @4xl:gap-8 items-start">
        
        {/* Menú Lateral */}
        <div className="w-full @4xl:w-64 bg-white rounded-3xl border border-slate-200 p-2 shadow-sm shrink-0 @4xl:sticky @4xl:top-24 z-20">
          <nav className="flex flex-row @4xl:flex-col gap-1 overflow-x-auto scrollbar-hide [&>button]:shrink-0 [&>button]:whitespace-nowrap">
            <button 
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all
                ${activeTab === 'profile' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Settings2 size={18} /> Perfil y Contacto
            </button>
            <button 
              onClick={() => setActiveTab('hours')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all
                ${activeTab === 'hours' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Clock size={18} /> Horarios de Atención
            </button>
            <button 
              onClick={() => setActiveTab('calendars')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all
                ${activeTab === 'calendars' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <CalendarDays size={18} /> Google Calendar
            </button>
            <button 
              onClick={() => setActiveTab('locations')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all
                ${activeTab === 'locations' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <MapPinned size={18} /> {labels?.location_plural || 'Sedes'}
            </button>
            <button 
              onClick={() => setActiveTab('widget')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all
                ${activeTab === 'widget' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <CodeXml size={18} /> Widget Público
            </button>
          </nav>
        </div>

        {/* Contenido Dinámico de las Pestañas */}
        <div className="flex-1 w-full min-w-0">
          {activeTab === 'profile' && companyId && <ProfileTab companyId={companyId} />}
          {activeTab === 'hours' && companyId && <WorkingHoursTab companyId={companyId} />}
          {activeTab === 'calendars' && companyId && planSlug && <AgendasTab companyId={companyId} planSlug={planSlug} />}
          {activeTab === 'locations' && companyId && planSlug && <LocationTab companyId={companyId} planSlug={planSlug}/>}
          {activeTab === 'widget' && companyId && <WidgetTab companyId={companyId} />}
        </div>

      </div>
      </div>
    </div>
  )
}
