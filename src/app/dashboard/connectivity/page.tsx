 

'use client'

import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { Plug, MessageCircle, Settings, Lock } from 'lucide-react'
import PageHeader from '../../../components/PageHeader'
import { useEntitlements } from '../../../hooks/useEntitlements'

const FacebookIcon = ({ size = 24, className = "", strokeWidth = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
  </svg>
)

const InstagramIcon = ({ size = 24, className = "", strokeWidth = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
)

type Platform = 'whatsapp' | 'messenger' | 'instagram'

// ⚠️ FIX estado WhatsApp (Sprint Conectividad):
// WhatsApp NO vive en la tabla `integrations` (ahí solo van Messenger e
// Instagram). Sus credenciales viven en `companies` (business_phone_id +
// system_user_access_token) — igual que las lee el diagnóstico, messages/send
// y disconnect. Antes esta pantalla decidía "conectado" y el contador SOLO con
// `integrations`, por eso WhatsApp salía como "Conectar Canal" aunque ya
// estuviera conectado, y el contador marcaba 2/10 sin contarlo.
interface ConnectivityState {
  connectedPlatforms: Platform[]
}

export default function ConnectivityPage() {
  const router = useRouter()
  const { data: entitlements } = useEntitlements()

  // TANSTACK QUERY: estado real de conectividad (integrations + WhatsApp en companies)
  const { data: state, isLoading } = useQuery<ConnectivityState>({
    queryKey: ['connectivity-state'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { connectedPlatforms: [] }

      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      if (!profile?.company_id) return { connectedPlatforms: [] }

      const [{ data: integrations }, { data: company }] = await Promise.all([
        supabase.from('integrations').select('platform, status').eq('company_id', profile.company_id),
        supabase.from('companies').select('business_phone_id').eq('id', profile.company_id).maybeSingle(),
      ])

      // Set para no contar dos veces si algún día WhatsApp también tuviera fila
      // en integrations. Fuente de verdad de WhatsApp = companies.business_phone_id.
      const platforms = new Set<Platform>()
      for (const i of integrations || []) {
        if (i?.platform === 'messenger' || i?.platform === 'instagram' || i?.platform === 'whatsapp') {
          platforms.add(i.platform as Platform)
        }
      }
      if (company?.business_phone_id) platforms.add('whatsapp')

      return { connectedPlatforms: Array.from(platforms) }
    },
  })

  const connectedPlatforms = state?.connectedPlatforms ?? []
  const isPlatformConnected = (p: Platform) => connectedPlatforms.includes(p)

  // v3.0 Sprint 5: validar capacity max_channels
  const maxChannels = entitlements?.capacity?.max_channels ?? 1
  const usedChannels = connectedPlatforms.length
  const atLimit = usedChannels >= maxChannels

  // ⚠️ FIX #7: separamos `route` (carpeta real en /dashboard/connectivity/*)
  // de `platform` (valor que vive en la tabla `integrations`, con CHECK
  // whatsapp/messenger/instagram). Antes el canal de Facebook usaba id
  // 'messenger' para navegar -> /connectivity/messenger (carpeta inexistente) -> 404.
  const channels = [
    {
      route: 'whatsapp',
      platform: 'whatsapp' as Platform,
      name: 'WhatsApp Cloud API',
      description: 'Conecta la API oficial de WhatsApp de Meta para administrar tus mensajes desde un solo buzón con IA.',
      icon: MessageCircle,
      color: 'text-emerald-500',
      bgIcon: 'bg-emerald-50',
      badge: 'Popular'
    },
    {
      route: 'facebook',                 // carpeta: src/app/dashboard/connectivity/facebook
      platform: 'messenger' as Platform, // valor en DB (CHECK lo exige)
      name: 'Facebook Messenger',
      description: 'Conecta Facebook Messenger para interactuar con tus clientes en la red social más grande.',
      icon: FacebookIcon,
      color: 'text-blue-600',
      bgIcon: 'bg-blue-50',
      badge: 'Popular'
    },
    {
      route: 'instagram',
      platform: 'instagram' as Platform,
      name: 'Instagram Direct',
      description: 'Conecta Instagram para responder a mensajes privados y automatizar comentarios e historias.',
      icon: InstagramIcon,
      color: 'text-fuchsia-600',
      bgIcon: 'bg-fuchsia-50',
      badge: null
    }
  ]

  if (isLoading) return <div className="animate-pulse h-32 bg-slate-100 rounded-2xl mt-8"></div>

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      <PageHeader
        title="Conectividad"
        description="Gestiona las integraciones y Sandboxes de tus canales de comunicación."
        actions={
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Canales</p>
            <p className={`text-2xl font-black ${atLimit ? 'text-amber-600' : 'text-slate-900'}`}>
              {usedChannels}<span className="text-slate-400">/{maxChannels}</span>
            </p>
          </div>
        }
      />

      {atLimit && (
        <div className="mb-6 p-4 bg-amber-50 border-2 border-amber-200 rounded-2xl flex items-center gap-3">
          <Lock className="text-amber-600 shrink-0" size={20} />
          <div className="flex-1">
            <p className="font-bold text-amber-900 text-sm">Has alcanzado el máximo de canales de tu plan</p>
            <p className="text-xs text-amber-800 mt-0.5">Activa el addon <strong>Canal Extra</strong> para conectar más canales sin cambiar de plan.</p>
          </div>
          <button
            onClick={() => router.push('/dashboard/addons?highlight=extra_channel')}
            className="px-3 py-2 bg-amber-900 hover:bg-amber-950 text-white text-xs font-bold rounded-lg whitespace-nowrap shrink-0"
          >
            Ver addon
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {channels.map((channel) => {
          const isConnected = isPlatformConnected(channel.platform)

          return (
            <div key={channel.route} className="bg-white rounded-[24px] border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all flex flex-col group">
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-2xl ${channel.bgIcon} ${channel.color} border border-slate-100`}>
                  <channel.icon size={24} strokeWidth={2} />
                </div>
                {channel.badge && (
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider rounded-full border border-slate-200">
                    {channel.badge}
                  </span>
                )}
              </div>

              <h3 className="font-bold text-slate-900 text-lg mb-2">{channel.name}</h3>
              <p className="text-sm text-slate-500 flex-1 leading-relaxed mb-6">
                {channel.description}
              </p>

              <button
                onClick={() => {
                  // v3.0 Sprint 5: si está al límite y no es uno ya conectado, redirigir al addon
                  if (atLimit && !isConnected) {
                    router.push('/dashboard/addons?highlight=extra_channel')
                    return
                  }
                  router.push(`/dashboard/connectivity/${channel.route}`)
                }}
                disabled={atLimit && !isConnected}
                className={`w-full py-2.5 text-sm font-bold rounded-xl border transition-all flex items-center justify-center gap-2
                  ${isConnected
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300'
                    : atLimit
                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-900 hover:text-white hover:border-slate-900'
                  }`}
                title={atLimit && !isConnected ? 'Activa el addon Canal Extra para conectar más' : undefined}
              >
                {isConnected
                  ? <><Settings size={16} /> Administrar Conexión</>
                  : atLimit
                    ? <><Lock size={14} /> Límite alcanzado</>
                    : 'Conectar Canal'
                }
              </button>
            </div>
          )
        })}
      </div>

      {/*
        El editor de perfil de WhatsApp Business se movió a la página del canal:
        /dashboard/connectivity/whatsapp (solo aparece cuando WhatsApp está
        conectado). Antes vivía aquí afuera y confundía: se veía siempre, sin
        contexto, y encima leía la columna de token equivocada.
      */}
    </div>
  )
}

