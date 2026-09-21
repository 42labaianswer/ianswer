 

'use client'

// ============================================================================
// src/app/dashboard/whatsapp/page.tsx
// ----------------------------------------------------------------------------
// Pantalla "Conectar WhatsApp Business" del dashboard.
// Patrón de carga companyId: igual que dashboard/billing/page.tsx
// ============================================================================

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import PageHeader from '../../../components/PageHeader'
import ConnectWhatsAppButton from '../../../components/whatsapp/ConnectWhatsAppButton'
import { useConfirm } from '../../../hooks/useConfirm'
import toast from 'react-hot-toast'
import {
  Smartphone, CheckCircle2, Clock, AlertTriangle, XCircle,
  Loader2, ExternalLink, Copy, Eye, EyeOff, Sparkles, Info,
  ShieldCheck, Phone, MessageCircle
} from 'lucide-react'
import IAnswerLoader from '../../../components/IAnswerLoader'

type ConnectionStatus =
  | 'not_connected'
  | 'pending_meta'
  | 'connected_testing'
  | 'connected_live'
  | 'quality_flagged'
  | 'error'

interface WhatsAppConfig {
  status: ConnectionStatus
  business_phone_id: string | null
  waba_id: string | null
  display_phone: string | null
  verified_name: string | null
  quality_rating: 'GREEN' | 'YELLOW' | 'RED' | null
  messaging_tier: string | null
  last_verified_at: string | null
  connected_at: string | null
  meta_business_verified: boolean
  system_user_access_token_preview: string | null
}

export default function WhatsAppConnectPage() {
  const { confirm, ConfirmDialog } = useConfirm()
  const router = useRouter()
  const [companyId, setCompanyId]           = useState<string | null>(null)
  const [config, setConfig]                 = useState<WhatsAppConfig | null>(null)
  const [loading, setLoading]               = useState(true)
  const [showManualForm, setShowManualForm] = useState(false)
  const [savingManual, setSavingManual]     = useState(false)
  const [revealToken, setRevealToken]       = useState(false)

  const [manualForm, setManualForm] = useState({
    business_phone_id: '',
    waba_id: '',
    system_user_access_token: '',
    display_phone: '',
    verified_name: ''
  })

  // Cargar companyId del usuario autenticado
  useEffect(() => {
    const loadCompany = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle()

      if (!(profile as any)?.company_id) {
        toast.error('No se encontró la compañía asociada')
        setLoading(false)
        return
      }
      setCompanyId((profile as any).company_id as string)
    }
    loadCompany()
  }, [router])

  // Cuando hay companyId, cargar config
  useEffect(() => {
    if (!companyId) return
    loadConfig()
  }, [companyId])

  async function loadConfig() {
    if (!companyId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('companies')
        .select(`
          business_phone_id, waba_id, waba_display_phone, waba_verified_name,
          waba_quality_rating, waba_messaging_tier, waba_last_verified_at,
          waba_connected_at, meta_business_verified, system_user_access_token
        `)
        .eq('id', companyId)
        .single()

      if (error) throw error
      const d = (data as unknown) as any

      let status: ConnectionStatus = 'not_connected'
      if (!d.business_phone_id) {
        status = 'not_connected'
      } else if (d.business_phone_id && !d.meta_business_verified) {
        status = 'pending_meta'
      } else if (d.business_phone_id && d.meta_business_verified && d.waba_messaging_tier === 'TIER_TEST') {
        status = 'connected_testing'
      } else if (d.waba_quality_rating === 'RED') {
        status = 'quality_flagged'
      } else if (d.business_phone_id && d.meta_business_verified) {
        status = 'connected_live'
      }

      setConfig({
        status,
        business_phone_id:                  d.business_phone_id,
        waba_id:                            d.waba_id,
        display_phone:                      d.waba_display_phone,
        verified_name:                      d.waba_verified_name,
        quality_rating:                     d.waba_quality_rating,
        messaging_tier:                     d.waba_messaging_tier,
        last_verified_at:                   d.waba_last_verified_at,
        connected_at:                       d.waba_connected_at,
        meta_business_verified:             d.meta_business_verified || false,
        system_user_access_token_preview:   d.system_user_access_token
                                              ? `${String(d.system_user_access_token).slice(0, 8)}...${String(d.system_user_access_token).slice(-4)}`
                                              : null
      })
    } catch (err) {
      console.error('Error cargando config WhatsApp', err)
    } finally {
      setLoading(false)
    }
  }

  function handleConnectSuccess() {
    loadConfig()
    toast.success('WhatsApp Business conectado')
  }

  function handleConnectError(_msg: string) {
    // El error se muestra dentro del componente ConnectWhatsAppButton
  }

  async function handleSaveManual() {
    if (!companyId) return
    if (!manualForm.business_phone_id || !manualForm.waba_id || !manualForm.system_user_access_token) {
      toast.error('Phone Number ID, WABA ID y Access Token son obligatorios')
      return
    }

    setSavingManual(true)
    try {
      const payload: any = {
        business_phone_id:        manualForm.business_phone_id.trim(),
        waba_id:                  manualForm.waba_id.trim(),
        system_user_access_token: manualForm.system_user_access_token.trim(),
        waba_display_phone:       manualForm.display_phone.trim() || null,
        waba_verified_name:       manualForm.verified_name.trim() || null,
        waba_connected_at:        new Date().toISOString(),
        waba_last_verified_at:    new Date().toISOString()
      }
      const { error } = await supabase
        .from('companies')
        .update(payload)
        .eq('id', companyId)

      if (error) throw error
      await loadConfig()
      setShowManualForm(false)
      setManualForm({ business_phone_id: '', waba_id: '', system_user_access_token: '', display_phone: '', verified_name: '' })
      toast.success('Configuración guardada')
    } catch (err: any) {
      toast.error('Error al guardar: ' + (err.message || 'desconocido'))
    } finally {
      setSavingManual(false)
    }
  }

  async function handleDisconnect() {
    if (!companyId) return
    if (!(await confirm('Desconectar WhatsApp? El bot dejará de responder hasta reconectar.', { title: 'Desconectar canal', danger: true, confirmText: 'Desconectar' }))) return

    try {
      const res = await fetch('/api/whatsapp/disconnect', { method: 'POST' })
      const result = await res.json()
      if (!res.ok || !result.success) {
        toast.error('Error al desconectar: ' + (result?.error || 'desconocido'))
        return
      }
      await loadConfig()
      toast.success('WhatsApp desconectado')
    } catch (err: any) {
      toast.error('Error inesperado: ' + (err?.message || 'desconocido'))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <IAnswerLoader size={32} />
      </div>
    )
  }

  return (
    <div className="pb-20 max-w-4xl mx-auto">
      <PageHeader
        title="WhatsApp Business"
        description="Conecta tu número de WhatsApp Business para que el agente IA responda automáticamente a tus clientes."
      />

      {!config?.business_phone_id ? (
        <ConnectionCallToAction
          onConnectSuccess={handleConnectSuccess}
          onConnectError={handleConnectError}
          showManualForm={showManualForm}
          setShowManualForm={setShowManualForm}
          manualForm={manualForm}
          setManualForm={setManualForm}
          savingManual={savingManual}
          onSaveManual={handleSaveManual}
          onCancelManual={() => setShowManualForm(false)}
        />
      ) : (
        <ConnectedView
          config={config}
          revealToken={revealToken}
          setRevealToken={setRevealToken}
          onDisconnect={handleDisconnect}
        />
      )}

      <HelpSection />
      {ConfirmDialog}
    </div>
  )
}

interface CTAProps {
  onConnectSuccess: () => void
  onConnectError: (msg: string) => void
  showManualForm: boolean
  setShowManualForm: (v: boolean) => void
  manualForm: any
  setManualForm: (v: any) => void
  savingManual: boolean
  onSaveManual: () => void
  onCancelManual: () => void
}

function ConnectionCallToAction({
  onConnectSuccess, onConnectError, showManualForm, setShowManualForm,
  manualForm, setManualForm, savingManual, onSaveManual, onCancelManual
}: CTAProps) {
  if (showManualForm) {
    return (
      <ManualConfigForm
        manualForm={manualForm}
        setManualForm={setManualForm}
        savingManual={savingManual}
        onSaveManual={onSaveManual}
        onCancel={onCancelManual}
      />
    )
  }

  return (
    <div className="bg-gradient-to-br from-slate-950 to-slate-900 text-white rounded-3xl p-8 md:p-12 mb-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="p-3 bg-lime-400/20 rounded-2xl">
          <Smartphone size={28} className="text-lime-300" strokeWidth={2} />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
            Conecta tu WhatsApp Business
          </h2>
          <p className="text-slate-300 text-sm md:text-base font-medium leading-relaxed">
            Para que el agente IA responda 24/7, conecta el número de WhatsApp de tu negocio.
            El proceso toma 20 minutos activos y Meta verifica en 2-7 días hábiles.
          </p>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6">
        <p className="text-xs font-black uppercase tracking-widest text-lime-300 mb-3">
          Antes de empezar necesitas
        </p>
        <ul className="space-y-2 text-sm text-slate-200">
          <li className="flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-lime-400 mt-0.5 shrink-0" />
            <span>Una cuenta de <strong className="text-white">Facebook Business Manager</strong> (gratis)</span>
          </li>
          <li className="flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-lime-400 mt-0.5 shrink-0" />
            <span>Un <strong className="text-white">número de teléfono SIN WhatsApp instalado</strong></span>
          </li>
          <li className="flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-lime-400 mt-0.5 shrink-0" />
            <span><strong className="text-white">Documentos legales</strong> para verificación en Meta</span>
          </li>
        </ul>
      </div>

      <ConnectWhatsAppButton
        variant="primary"
        onSuccess={onConnectSuccess}
        onError={onConnectError}
      />

      <p className="text-xs text-slate-400 mt-3 font-medium">
        Te abrimos un popup oficial de Meta. Nosotros no guardamos tu contraseña de Facebook.
      </p>

      <button
        onClick={() => setShowManualForm(true)}
        className="block mt-6 text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors underline underline-offset-2"
      >
        Configurar manualmente (avanzado)
      </button>
    </div>
  )
}

interface ManualFormProps {
  manualForm: any
  setManualForm: (v: any) => void
  savingManual: boolean
  onSaveManual: () => void
  onCancel: () => void
}

function ManualConfigForm({ manualForm, setManualForm, savingManual, onSaveManual, onCancel }: ManualFormProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 mb-6">
      <div className="flex items-start gap-3 mb-6">
        <div className="p-2 bg-amber-50 rounded-xl">
          <Info size={18} className="text-amber-600" />
        </div>
        <div className="flex-1">
          <h3 className="font-black text-slate-950 mb-1">Configuración manual</h3>
          <p className="text-xs text-slate-600 font-medium">
            Llena estos campos con los datos que obtuviste de developers.facebook.com.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <Field
          label="Phone Number ID"
          required
          placeholder="Ej: 1054272337778007"
          value={manualForm.business_phone_id}
          onChange={(v: string) => setManualForm({ ...manualForm, business_phone_id: v })}
          hint="Lo encuentras en business.facebook.com → WhatsApp Manager → API Setup"
          mono
        />
        <Field
          label="WhatsApp Business Account ID (WABA ID)"
          required
          placeholder="Ej: 348923489234"
          value={manualForm.waba_id}
          onChange={(v: string) => setManualForm({ ...manualForm, waba_id: v })}
          mono
        />
        <Field
          label="System User Access Token"
          required
          placeholder="EAAxxxxx..."
          value={manualForm.system_user_access_token}
          onChange={(v: string) => setManualForm({ ...manualForm, system_user_access_token: v })}
          hint="Token permanente (System User). NO uses el token temporal de 24hr."
          mono
          isSensitive
        />
        <Field
          label="Número visible (display phone)"
          placeholder="+52 999 123 4567"
          value={manualForm.display_phone}
          onChange={(v: string) => setManualForm({ ...manualForm, display_phone: v })}
        />
        <Field
          label="Nombre verificado del negocio"
          placeholder="Ej: Inclinic Dental"
          value={manualForm.verified_name}
          onChange={(v: string) => setManualForm({ ...manualForm, verified_name: v })}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mt-6 pt-6 border-t border-slate-100">
        <button
          onClick={onSaveManual}
          disabled={savingManual}
          className="flex-1 px-6 py-3 bg-slate-950 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-2xl font-black text-sm transition-colors flex items-center justify-center gap-2"
        >
          {savingManual ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          {savingManual ? 'Guardando...' : 'Guardar configuración'}
        </button>
        <button
          onClick={onCancel}
          className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-sm transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  required?: boolean
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
  mono?: boolean
  isSensitive?: boolean
}

function Field({ label, required, value, onChange, placeholder, hint, mono, isSensitive }: FieldProps) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div>
      <label className="text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5 block">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <div className="relative">
        <input
          type={isSensitive && !revealed ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 ${mono ? 'font-mono text-xs' : 'text-sm'} text-slate-700`}
        />
        {isSensitive && (
          <button
            type="button"
            onClick={() => setRevealed(!revealed)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
          >
            {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}

interface ConnectedViewProps {
  config: WhatsAppConfig
  revealToken: boolean
  setRevealToken: (v: boolean) => void
  onDisconnect: () => void
}

function ConnectedView({ config, revealToken, setRevealToken, onDisconnect }: ConnectedViewProps) {
  const statusUI = STATUS_CONFIG[config.status]

  return (
    <div className="space-y-6">
      <div className={`${statusUI.bg} border ${statusUI.border} rounded-3xl p-6 md:p-8`}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 ${statusUI.iconBg} rounded-2xl`}>
              <statusUI.Icon size={22} className={statusUI.iconColor} strokeWidth={2.2} />
            </div>
            <div>
              <p className={`text-xs font-black uppercase tracking-widest ${statusUI.label}`}>
                {statusUI.title}
              </p>
              <p className="text-2xl md:text-3xl font-black text-slate-950 mt-0.5 tracking-tight">
                {config.verified_name || 'Sin nombre verificado'}
              </p>
              <p className="text-sm text-slate-700 font-medium">
                {config.display_phone || 'Número no configurado'}
              </p>
            </div>
          </div>
        </div>

        {statusUI.description && (
          <p className="text-sm text-slate-700 mb-5 font-medium leading-relaxed">
            {statusUI.description}
          </p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-6">
          <Stat
            label="Calidad"
            value={config.quality_rating || 'N/A'}
            tone={config.quality_rating === 'GREEN' ? 'green' :
                  config.quality_rating === 'YELLOW' ? 'amber' :
                  config.quality_rating === 'RED' ? 'rose' : 'slate'}
          />
          <Stat
            label="Tier mensajería"
            value={formatTier(config.messaging_tier)}
            tone="slate"
          />
          <Stat
            label="Conectado desde"
            value={config.connected_at ? new Date(config.connected_at).toLocaleDateString('es-MX') : 'N/A'}
            tone="slate"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-6">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">
          Datos de conexión
        </h3>
        <DataRow label="Phone Number ID" value={config.business_phone_id} mono />
        <DataRow label="WABA ID" value={config.waba_id} mono />
        <DataRow
          label="Access Token"
          value={revealToken ? config.system_user_access_token_preview : '••••••••••••••••'}
          mono
          action={
            <button
              onClick={() => setRevealToken(!revealToken)}
              className="p-1 text-slate-400 hover:text-slate-600"
            >
              {revealToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          }
        />
        <DataRow
          label="Última verificación"
          value={config.last_verified_at ? new Date(config.last_verified_at).toLocaleString('es-MX') : 'N/A'}
        />
        <DataRow
          label="Negocio verificado por Meta"
          value={config.meta_business_verified ? 'Sí' : 'Pendiente'}
        />

        <div className="mt-5 pt-5 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
          <button
            onClick={onDisconnect}
            className="text-xs font-bold text-rose-600 hover:text-rose-700 transition-colors"
          >
            Desconectar WhatsApp
          </button>
        </div>
      </div>
    </div>
  )
}

function HelpSection() {
  return (
    <div className="mt-8 bg-slate-50 border border-slate-200 rounded-3xl p-6">
      <div className="flex items-start gap-3 mb-4">
        <Sparkles size={18} className="text-slate-700 mt-0.5" />
        <div>
          <h3 className="font-black text-slate-950 mb-1">¿Necesitas ayuda?</h3>
          <p className="text-sm text-slate-600 font-medium">
            Si es tu primera vez configurando WhatsApp Business API, agenda una llamada gratuita.
          </p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 mt-4">
        <a
          href="https://wa.me/529997012393?text=Hola,%20necesito%20ayuda%20conectando%20WhatsApp%20a%20iAnswer"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
        >
          <MessageCircle size={16} />
          Agendar llamada por WhatsApp
        </a>
        <a
          href="/recursos/ayuda/conectar-whatsapp"
          className="flex-1 px-5 py-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-2xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
        >
          <Info size={16} />
          Ver guía paso a paso
        </a>
      </div>
    </div>
  )
}

function Stat({ label, value, tone = 'slate' }: { label: string; value: string | number; tone?: 'green' | 'amber' | 'rose' | 'slate' }) {
  const tones: Record<string, string> = {
    green:  'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber:  'bg-amber-50 text-amber-700 border-amber-200',
    rose:   'bg-rose-50 text-rose-700 border-rose-200',
    slate:  'bg-slate-50 text-slate-700 border-slate-200'
  }
  return (
    <div className={`${tones[tone]} border rounded-2xl p-3`}>
      <p className="text-[10px] font-black uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-sm font-black mt-0.5">{value}</p>
    </div>
  )
}

interface DataRowProps {
  label: string
  value: string | null
  mono?: boolean
  action?: React.ReactNode
}

function DataRow({ label, value, mono, action }: DataRowProps) {
  const [copied, setCopied] = useState(false)
  function copy() {
    if (!value) return
    navigator.clipboard.writeText(String(value))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
      <div className="flex items-center gap-2">
        <p className={`text-sm font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}>
          {value || '—'}
        </p>
        {action ? action : value ? (
          <button onClick={copy} className="p-1 text-slate-400 hover:text-slate-600">
            {copied ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Copy size={14} />}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function formatTier(tier: string | null): string {
  if (!tier) return 'N/A'
  const map: Record<string, string> = {
    TIER_TEST:    'Prueba',
    TIER_250:     '250 / día',
    TIER_1K:      '1,000 / día',
    TIER_10K:     '10,000 / día',
    TIER_100K:    '100,000 / día',
    UNLIMITED:    'Ilimitado'
  }
  return map[tier] || tier
}

interface StatusConfigEntry {
  title: string
  Icon: React.ComponentType<any>
  iconBg: string
  iconColor: string
  bg: string
  border: string
  label: string
  description: string | null
}

const STATUS_CONFIG: Record<ConnectionStatus, StatusConfigEntry> = {
  not_connected: {
    title: 'Sin conectar',
    Icon: Phone,
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-600',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    label: 'text-slate-600',
    description: null
  },
  pending_meta: {
    title: 'Esperando verificación',
    Icon: Clock,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    label: 'text-amber-700',
    description: 'Meta está revisando los documentos de verificación de tu negocio. Esto suele tomar entre 2 y 7 días hábiles.'
  },
  connected_testing: {
    title: 'Conectado · Modo prueba',
    Icon: ShieldCheck,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    label: 'text-blue-700',
    description: 'Tu cuenta está activa con el número de prueba de Meta. Verifica tu negocio para activar tu número real.'
  },
  connected_live: {
    title: 'Activo · 24/7',
    Icon: CheckCircle2,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    label: 'text-emerald-700',
    description: 'Tu WhatsApp Business está conectado y respondiendo automáticamente.'
  },
  quality_flagged: {
    title: 'Atención · Calidad baja',
    Icon: AlertTriangle,
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    label: 'text-rose-700',
    description: 'Meta ha detectado alta tasa de bloqueos o reportes en tu número. Si la calidad sigue bajando, Meta puede suspenderlo.'
  },
  error: {
    title: 'Error de conexión',
    Icon: XCircle,
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    label: 'text-rose-700',
    description: 'El access token expiró o fue revocado. Reconecta WhatsApp para reactivar el bot.'
  }
}
