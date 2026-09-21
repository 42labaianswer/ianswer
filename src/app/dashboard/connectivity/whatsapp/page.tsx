 

'use client'

// ============================================================================
// src/app/dashboard/connectivity/whatsapp/page.tsx
// ----------------------------------------------------------------------------
// Conexión de WhatsApp Business — DOS métodos:
//  1. Conexión rápida (Embedded Signup oficial de Meta). HABILITADO: la cuenta
//     ya está aprobada como Tech Provider, así que el cliente conecta su propio
//     número con un clic, sin pedirle credenciales de API.
//  2. Manual (avanzado): pegar Phone Number ID + WABA ID + token.
// Guarda en la tabla companies.
// ============================================================================

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'
import PageHeader from '../../../../components/PageHeader'
import ChannelDiagnostics from '../../../../components/ChannelDiagnostics'
import WhatsAppProfileEditor from '../../../../components/WhatsAppProfileEditor'
import ConnectWhatsAppButton from '../../../../components/whatsapp/ConnectWhatsAppButton'
import toast from 'react-hot-toast'
import {
  CheckCircle2, Loader2, ArrowLeft, Activity, Eye, EyeOff, Globe,
  ShieldCheck, ExternalLink, KeyRound, Hash, Phone, Trash2, ChevronDown, Zap
} from 'lucide-react'
import { useConfirm } from '../../../../hooks/useConfirm'
import IAnswerLoader from '../../../../components/IAnswerLoader'

const ACCENT = '#25D366'

interface WhatsAppConfig {
  business_phone_id: string | null
  waba_id: string | null
  display_phone: string | null
  verified_name: string | null
  connected: boolean
}

export default function WhatsAppConnectPage() {
  const { confirm, ConfirmDialog } = useConfirm()
  const router = useRouter()
  const [companyId, setCompanyId]     = useState<string | null>(null)
  const [config, setConfig]           = useState<WhatsAppConfig | null>(null)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [revealToken, setRevealToken] = useState(false)
  const [showDiag, setShowDiag]       = useState(false)
  const [step, setStep]               = useState<1 | 2>(1)

  const [form, setForm] = useState({
    business_phone_id: '', waba_id: '', system_user_access_token: '',
    display_phone: '', verified_name: ''
  })

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('profiles').select('company_id').eq('id', user.id).single()
      if (!profile?.company_id) { setLoading(false); return }
      setCompanyId(profile.company_id)

      const { data } = await supabase
        .from('companies')
        .select('business_phone_id, waba_id, waba_display_phone, waba_verified_name')
        .eq('id', profile.company_id).single()

      if (data?.business_phone_id) {
        setConfig({
          business_phone_id: data.business_phone_id, waba_id: data.waba_id,
          display_phone: data.waba_display_phone, verified_name: data.waba_verified_name,
          connected: true
        })
        setForm(f => ({
          ...f,
          business_phone_id: data.business_phone_id || '', waba_id: data.waba_id || '',
          display_phone: data.waba_display_phone || '', verified_name: data.waba_verified_name || ''
        }))
      }
      setLoading(false)
    }
    load()
  }, [router])

  // Embedded Signup terminó bien: el backend ya guardó todo en companies
  // (token, waba, número) y suscribió el webhook. Recargamos el estado.
  const handleEmbeddedSuccess = async () => {
    toast.success('WhatsApp conectado')
    if (!companyId) return
    const { data } = await supabase
      .from('companies')
      .select('business_phone_id, waba_id, waba_display_phone, waba_verified_name')
      .eq('id', companyId).single()
    if (data?.business_phone_id) {
      setConfig({
        business_phone_id: data.business_phone_id,
        waba_id: data.waba_id,
        display_phone: data.waba_display_phone,
        verified_name: data.waba_verified_name,
        connected: true
      })
      setForm(f => ({
        ...f,
        business_phone_id: data.business_phone_id || '',
        waba_id: data.waba_id || '',
        display_phone: data.waba_display_phone || '',
        verified_name: data.waba_verified_name || ''
      }))
    }
  }

  const handleSave = async () => {
    if (!form.business_phone_id || !form.waba_id || !form.system_user_access_token) {
      toast.error('Completa el Phone Number ID, el WABA ID y el Token de acceso')
      return
    }
    if (!companyId) return
    setSaving(true)
    try {
      const { error } = await supabase.from('companies').update({
        business_phone_id: form.business_phone_id.trim(),
        waba_id: form.waba_id.trim(),
        system_user_access_token: form.system_user_access_token.trim(),
        waba_display_phone: form.display_phone.trim() || null,
        waba_verified_name: form.verified_name.trim() || null,
        waba_connected_at: new Date().toISOString()
      }).eq('id', companyId)
      if (error) throw error
      toast.success('WhatsApp conectado')
      setConfig({
        business_phone_id: form.business_phone_id, waba_id: form.waba_id,
        display_phone: form.display_phone || null, verified_name: form.verified_name || null,
        connected: true
      })
    } catch (e: any) {
      toast.error('Error al guardar: ' + (e?.message || 'desconocido'))
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    if (!companyId) return
    if (!(await confirm('¿Desconectar WhatsApp? Dejarás de recibir y responder mensajes por este canal.', { title: 'Desconectar canal', danger: true, confirmText: 'Desconectar' }))) return
    setSaving(true)
    try {
      await supabase.from('companies').update({
        business_phone_id: null, waba_id: null, system_user_access_token: null,
        waba_display_phone: null, waba_verified_name: null, waba_connected_at: null
      }).eq('id', companyId)
      toast.success('WhatsApp desconectado')
      setConfig(null)
      setForm({ business_phone_id: '', waba_id: '', system_user_access_token: '', display_phone: '', verified_name: '' })
      setStep(1)
    } catch (e: any) {
      toast.error('Error: ' + (e?.message || 'desconocido'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><IAnswerLoader size={32} /></div>
  }

  return (
    <div className="animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto">
      {/* Barra de navegación */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <button
          onClick={() => router.push('/dashboard/connectivity')}
          className="text-sm font-bold text-slate-500 hover:text-slate-900 inline-flex items-center gap-2"
        >
          <ArrowLeft size={16} /> Conectividad
        </button>
        <button
          onClick={() => setShowDiag(v => !v)}
          aria-expanded={showDiag}
          className="text-sm font-bold text-slate-700 bg-white border border-slate-200 rounded-xl px-3.5 py-2 hover:bg-slate-50 hover:border-slate-300 transition-colors inline-flex items-center gap-2 shrink-0"
        >
          <Activity size={16} /> Diagnóstico
          <ChevronDown size={15} className={`transition-transform ${showDiag ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Diagnóstico de este canal, inline */}
      {showDiag && (
        <div className="mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
          <ChannelDiagnostics canal="whatsapp" nombre="WhatsApp Business" />
        </div>
      )}

      <PageHeader
        title="Conectar WhatsApp Business"
        description="Ingresa las credenciales de la API de WhatsApp de tu cuenta de Meta Business."
      />

      {/* PASO 1: elegir método (2 columnas) — mismo patrón que Facebook/Instagram */}
      {step === 1 && !config?.connected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in slide-in-from-right-4">
          {/* Conexión rápida (Embedded Signup) — habilitado con Tech Provider aprobado */}
          <div className="bg-white rounded-3xl border-2 border-emerald-100 p-8 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 text-white text-[10px] font-black px-4 py-1 rounded-bl-xl uppercase tracking-tight" style={{ backgroundColor: ACCENT }}>Recomendado</div>
            <div className="h-20 w-20 rounded-full bg-emerald-50 flex items-center justify-center mb-6" style={{ color: ACCENT }}>
              <Zap size={36} />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">Conexión rápida</h3>
            <p className="text-sm text-slate-500 mb-8 px-2 flex-1">Conecta tu número con un clic desde el portal oficial de Meta. No necesitas tokens ni credenciales: eliges tu cuenta de Business, tu número, y listo.</p>
            <ConnectWhatsAppButton
              variant="primary"
              onSuccess={handleEmbeddedSuccess}
              onError={(msg) => toast.error(msg)}
            />
            <p className="text-[11px] text-slate-400 mt-3">
              Se abre un popup oficial de Meta. No guardamos tu contraseña de Facebook.
            </p>
          </div>

          {/* Manual */}
          <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm flex flex-col items-center text-center group hover:border-slate-400 transition-all">
            <div className="h-20 w-20 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center mb-6 group-hover:bg-slate-100 group-hover:text-slate-600 transition-colors">
              <Globe size={36} />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">Configuración manual</h3>
            <p className="text-sm text-slate-500 mb-8 px-2 flex-1">Si ya tienes el Phone Number ID, el WABA ID y el token de acceso de tu cuenta de Meta Business, ingrésalos aquí.</p>
            <button onClick={() => setStep(2)} className="w-full py-4 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-2xl hover:bg-slate-50 hover:border-slate-300 transition-all">
              Usar credenciales API
            </button>
          </div>
        </div>
      )}

      {config?.connected && (
        <div className="mb-6 p-5 rounded-2xl border-2 border-emerald-200 bg-emerald-50 flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <CheckCircle2 className="text-emerald-600" size={24} />
          </div>
          <div className="flex-1">
            <p className="font-black text-emerald-900">WhatsApp conectado</p>
            <p className="text-sm text-emerald-800">{config.verified_name || 'Número'} {config.display_phone ? `· ${config.display_phone}` : ''}</p>
          </div>
          <button onClick={handleDisconnect} disabled={saving} className="px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl flex items-center gap-1.5 disabled:opacity-50">
            <Trash2 size={14} /> Desconectar
          </button>
        </div>
      )}

      {/* PASO 2: manual (2 columnas: instrucciones | formulario). Se muestra si el
          usuario elige "Configuración manual", o si ya está conectado (para
          poder actualizar credenciales) — mismo patrón que Facebook/Instagram. */}
      {(step === 2 || config?.connected) && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in slide-in-from-right-4">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm h-fit">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <ShieldCheck size={18} className="text-slate-500" />
            <h3 className="font-bold text-slate-800">Cómo obtener tus credenciales</h3>
          </div>
          <div className="p-6 space-y-5 text-sm text-slate-600">
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed">
              <strong className="block mb-1">⚠️ Antes de empezar</strong>
              Estos 3 datos los genera Meta automáticamente — <strong>no son tu número de teléfono, tu correo ni una contraseña que tú inventes.</strong> Si lo que vas a pegar es corto o lo reconoces como algo tuyo, seguramente no es el dato correcto: vuelve a Meta for Developers y cópialo de ahí.
            </div>
            <Instruction n={1} title="Entra a Meta for Developers" text="Ve a tu app en developers.facebook.com > WhatsApp > Configuración de la API." />
            <Instruction n={2} title='Copia el "Phone Number ID"' text='Es un número largo de 15-16 dígitos (ej. 109876543210987) que aparece junto al número de teléfono de prueba o producción, en el bloque "De". No es tu número de WhatsApp — es un identificador interno que Meta le pone a ese número dentro de la app.' />
            <Instruction n={3} title='Copia el "WhatsApp Business Account ID" (WABA ID)' text="Es otro número largo, parecido al anterior pero distinto, que identifica tu cuenta de WhatsApp Business completa (no un número de teléfono en particular). Está en la misma pantalla, justo junto al Phone Number ID." />
            <Instruction n={4} title="Genera un token permanente" text='En "Usuarios del sistema" de tu Business Manager, crea un token con los permisos whatsapp_business_messaging y whatsapp_business_management. El token es un texto largo (200+ caracteres) que empieza con "EAA" — si lo que copiaste es corto, no es el correcto.' />
            <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-bold hover:underline" style={{ color: ACCENT }}>
              Abrir Meta for Developers <ExternalLink size={13} />
            </a>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5 h-fit">
          {!config?.connected && (
            <button onClick={() => setStep(1)} className="text-sm font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 mb-1">
              <ArrowLeft size={15} /> Cambiar método
            </button>
          )}
          <Field label="Phone Number ID" icon={Phone} value={form.business_phone_id} onChange={v => setForm({ ...form, business_phone_id: v })} placeholder="Ej. 109876543210987" required accent="emerald" hint="Número de 15-16 dígitos que Meta le asigna a tu número dentro de la app — no es tu número de teléfono real." />
          <Field label="WhatsApp Business Account ID (WABA)" icon={Hash} value={form.waba_id} onChange={v => setForm({ ...form, waba_id: v })} placeholder="Ej. 102345678901234" required accent="emerald" hint="Identifica tu cuenta completa de WhatsApp Business. Es distinto al Phone Number ID, aunque se ve parecido." />
          <div>
            <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1.5">Token de acceso permanente <span className="text-rose-500">*</span></label>
            <div className="relative">
              <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type={revealToken ? 'text' : 'password'} value={form.system_user_access_token} onChange={e => setForm({ ...form, system_user_access_token: e.target.value })} placeholder="EAAxxxxxxxx..." className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400" />
              <button type="button" onClick={() => setRevealToken(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {revealToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400 leading-snug">Texto largo (200+ caracteres) que empieza con “EAA”. No es una contraseña que tú elijas ni la contraseña de tu Facebook.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <Field label="Número visible (opcional)" value={form.display_phone} onChange={v => setForm({ ...form, display_phone: v })} placeholder="+52 999 123 4567" accent="emerald" />
            <Field label="Nombre verificado (opcional)" value={form.verified_name} onChange={v => setForm({ ...form, verified_name: v })} placeholder="Mi Negocio" accent="emerald" />
          </div>
          <button onClick={handleSave} disabled={saving} className="w-full py-3 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2 shadow-sm hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
            {saving ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> : <>{config?.connected ? 'Actualizar' : 'Conectar'} <CheckCircle2 size={16} /></>}
          </button>
        </div>
      </div>
      )}

      {/*
        Editor de perfil de WhatsApp Business — antes vivía suelto en la pantalla
        de Conectividad, sin contexto. Ahora vive aquí, dentro del canal, y solo
        cuando WhatsApp ya está conectado (que es cuando tiene sentido editarlo).
      */}
      {config?.connected && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Editar perfil</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <WhatsAppProfileEditor accentColor={ACCENT} />
        </div>
      )}
      {ConfirmDialog}
    </div>
  )
}

function Instruction({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-700 text-xs shrink-0">{n}</span>
      <div>
        <strong className="text-slate-900">{title}</strong>
        <p className="mt-0.5 leading-relaxed">{text}</p>
      </div>
    </div>
  )
}

function Field({ label, icon: Icon, value, onChange, placeholder, required, hint }: {
  label: string; icon?: typeof Phone; value: string; onChange: (v: string) => void
  placeholder?: string; required?: boolean; accent?: string; hint?: string
}) {
  return (
    <div>
      <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1.5">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <div className="relative">
        {Icon && <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />}
        <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={`w-full ${Icon ? 'pl-10' : 'pl-3'} pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400`} />
      </div>
      {hint && <p className="mt-1 text-[11px] text-slate-400 leading-snug">{hint}</p>}
    </div>
  )
}
