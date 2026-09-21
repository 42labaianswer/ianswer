 

'use client'

// ============================================================================
// src/app/dashboard/connectivity/instagram/page.tsx
// ----------------------------------------------------------------------------
// Conexión de Instagram Direct — DOS métodos:
//  1. Conexión rápida: FB.login real (el mismo login de Facebook detecta la
//     cuenta de Instagram vinculada a la página). Funciona ya para admins.
//  2. Manual: pegar token + account ID de Instagram.
// Guarda en integrations con platform 'instagram'.
// ============================================================================

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../../../components/PageHeader'
import { ensureFacebookSdk } from '../../../../lib/ensureFacebookSdk'
import ChannelDiagnostics from '../../../../components/ChannelDiagnostics'
import toast from 'react-hot-toast'
import {
  CheckCircle2, Loader2, ArrowLeft, ArrowRight, Activity, Eye, EyeOff, Zap, Globe,
  ShieldCheck, ExternalLink, KeyRound, Hash, Trash2, ChevronDown, RefreshCw
} from 'lucide-react'
import { useConfirm } from '../../../../hooks/useConfirm'
import IAnswerLoader from '../../../../components/IAnswerLoader'

const ACCENT = '#C13584'

interface PageOption {
  id: string
  name: string
  has_instagram: boolean
  instagram_username: string | null
}

// Cuando la cuenta de Instagram esté lista y el producto de Instagram esté
// habilitado en el panel de Meta, se agregan aquí: instagram_manage_messages.
const META_SCOPES = [
  'pages_show_list', 'pages_messaging', 'pages_manage_metadata',
  'pages_read_engagement', 'instagram_basic', 'instagram_manage_messages',
  'business_management'
].join(',')

const InstagramIcon = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
)

export default function InstagramConnectPage() {
  const { confirm, ConfirmDialog } = useConfirm()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [companyId, setCompanyId]     = useState<string | null>(null)
  const [connected, setConnected]     = useState(false)
  const [loading, setLoading]         = useState(true)
  const [step, setStep]               = useState<1 | 2>(1)
  const [saving, setSaving]           = useState(false)
  const [connecting, setConnecting]   = useState(false)
  const [revealToken, setRevealToken] = useState(false)
  const [showDiag, setShowDiag]       = useState(false)
  const [form, setForm] = useState({ token: '', accountId: '' })
  // Selector de pagina: si la cuenta administra varias, el backend las devuelve
  // y el usuario elige cual (su Instagram vinculado es el que se conecta).
  const [pageOptions, setPageOptions] = useState<PageOption[] | null>(null)
  const [pendingToken, setPendingToken] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('profiles').select('company_id').eq('id', user.id).single()
      if (!profile?.company_id) { setLoading(false); return }
      setCompanyId(profile.company_id)

      const { data: integration } = await supabase
        .from('integrations').select('*')
        .eq('company_id', profile.company_id)
        .eq('platform', 'instagram')
        .maybeSingle()

      if (integration) {
        setForm({ token: integration.access_token || '', accountId: integration.account_id || '' })
        setConnected(true)
      }
      setLoading(false)
    }
    load()
  }, [router])

  const handleQuickConnect = async () => {
    setConnecting(true)
    let FB: any
    try {
      FB = await ensureFacebookSdk()
    } catch (e: any) {
      setConnecting(false)
      toast.error(e?.message || 'No se pudo cargar el SDK de Facebook')
      return
    }

    let settled = false
    const safety = setTimeout(() => {
      if (!settled) {
        setConnecting(false)
        toast.error('No se recibió respuesta de Facebook. Revisa que el popup no esté bloqueado y que esté en los dominios de tu app de Meta.', { duration: 8000 })
      }
    }, 60000)

    // FB.login NO acepta callback async — usamos función normal + async aparte.
    FB.login((response: any) => {
      settled = true
      clearTimeout(safety)
      void handleLoginResponse(response)
    }, { scope: META_SCOPES, return_scopes: true })
  }

  const handleLoginResponse = async (response: any) => {
    try {
        if (response.status !== 'connected' || !response.authResponse) {
          setConnecting(false)
          toast.error(response.status === 'not_authorized' ? 'No autorizaste el acceso' : 'Conexión cancelada')
          return
        }
        const accessToken = response.authResponse.accessToken
        await intercambiar(accessToken, null)
      } catch (err: any) {
        setConnecting(false)
        toast.error('Error inesperado: ' + (err?.message || 'desconocido'))
      }
  }

  // Llama al backend. Si la cuenta administra varias páginas y todavía no se
  // eligió una, el backend devuelve la lista para que el usuario seleccione.
  const intercambiar = async (accessToken: string, pageId: string | null) => {
    const res = await fetch('/api/meta/connect/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pageId ? { access_token: accessToken, page_id: pageId } : { access_token: accessToken })
    })
    const result = await res.json()

    if (result?.needsPageSelection && Array.isArray(result.pages)) {
      setPendingToken(accessToken)
      setPageOptions(result.pages)
      setConnecting(false)
      return
    }

    if (!res.ok || !result.success) {
      setConnecting(false)
      toast.error(result?.error || 'Error al conectar con Meta')
      return
    }

    if (!result.instagram) {
      setConnecting(false)
      toast.error('Esa página no tiene una cuenta de Instagram Business vinculada. Vincúlala en Facebook y reintenta, o usa el método manual.')
      return
    }

    toast.success(`Instagram conectado (@${result.instagram.username || 'cuenta'})`)
    // Avisar si el webhook no quedó suscrito con el campo `messages`:
    // el canal aparece conectado pero no recibiría ningún mensaje.
    if (result?.webhook && result.webhook.subscribed === false) {
      toast.error(
        'Conectado, pero el webhook no quedó suscrito al campo "messages" — no llegarán mensajes. Abre Diagnóstico y usa "Reparar webhook".'
        + (result.webhook.error ? ` (${result.webhook.error})` : ''),
        { duration: 10000 }
      )
    }
    queryClient.invalidateQueries({ queryKey: ['integrations'] })
    setForm(f => ({ ...f, accountId: result.instagram.account_id || '' }))
    setConnected(true)
    setConnecting(false)
    setPageOptions(null)
    setPendingToken(null)
  }

  const handleElegirPagina = async (pageId: string) => {
    if (!pendingToken) return
    setConnecting(true)
    try {
      await intercambiar(pendingToken, pageId)
    } catch (err: any) {
      setConnecting(false)
      toast.error('Error inesperado: ' + (err?.message || 'desconocido'))
    }
  }

  const handleSave = async () => {
    if (!form.token || !form.accountId) {
      toast.error('Completa el Token de acceso y el ID de la cuenta de Instagram')
      return
    }
    if (!companyId) return
    setSaving(true)
    try {
      const { error } = await supabase.from('integrations').upsert({
        company_id: companyId, platform: 'instagram',
        access_token: form.token.trim(), account_id: form.accountId.trim(),
        status: 'connected', updated_at: new Date().toISOString()
      }, { onConflict: 'company_id,platform' })
      if (error) throw error
      await supabase.from('companies')
        .update({ ig_account_id: form.accountId.trim() })
        .eq('id', companyId)
      toast.success('Instagram Direct conectado')
      setConnected(true)
    } catch (e: any) {
      toast.error('Error al guardar: ' + (e?.message || 'desconocido'))
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    if (!companyId) return
    if (!(await confirm('¿Desconectar Instagram Direct?', { title: 'Desconectar canal', danger: true, confirmText: 'Desconectar' }))) return
    setSaving(true)
    try {
      await supabase.from('integrations').delete()
        .eq('company_id', companyId).eq('platform', 'instagram')
      await supabase.from('companies').update({ ig_account_id: null }).eq('id', companyId)
      toast.success('Instagram desconectado')
      setConnected(false)
      setForm({ token: '', accountId: '' })
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
          <ChannelDiagnostics canal="instagram" nombre="Instagram Direct" />
        </div>
      )}

      <PageHeader
        title="Conectar Instagram Direct"
        description="Permite que tu asistente de IA responda los mensajes directos de tu cuenta de Instagram."
      />

      {connected && (
        <div className="mb-6 p-5 rounded-2xl border-2 border-fuchsia-200 bg-fuchsia-50 flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-fuchsia-100 flex items-center justify-center shrink-0" style={{ color: ACCENT }}>
            <CheckCircle2 size={24} />
          </div>
          <div className="flex-1">
            <p className="font-black text-fuchsia-900">Instagram Direct conectado</p>
            {form.accountId && <p className="text-sm text-fuchsia-800">Cuenta ID: {form.accountId}</p>}
          </div>
          {/* Si el negocio administra varias páginas con Instagram, puede cambiar
              a otra cuenta sin tener que desconectar primero. */}
          <button
            onClick={handleQuickConnect}
            disabled={connecting || saving}
            className="px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-50 hover:bg-fuchsia-100"
            style={{ color: ACCENT }}
          >
            {connecting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Cambiar cuenta
          </button>
          <button onClick={handleDisconnect} disabled={saving} className="px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl flex items-center gap-1.5 disabled:opacity-50">
            <Trash2 size={14} /> Desconectar
          </button>
        </div>
      )}

      {/* CONFIRMACIÓN: qué se va a conectar. Se muestra también cuando ya hay
          una cuenta conectada, para poder CAMBIAR a otra (varias páginas con
          Instagram vinculado). */}
      {pageOptions && pageOptions.length > 0 && (
        <div className="mb-6 bg-white rounded-2xl border-2 border-fuchsia-200 p-6 shadow-sm animate-in fade-in">
          <h3 className="font-black text-slate-900 mb-1">
            {pageOptions.length === 1 ? 'Confirma la conexión' : 'Elige la página con tu cuenta de Instagram'}
          </h3>
          <p className="text-sm text-slate-500 mb-5">
            {pageOptions.length === 1
              ? 'Instagram se conecta a través de la página de Facebook que lo tiene vinculado. Esto es lo que detectamos.'
              : `Tu cuenta administra ${pageOptions.length} páginas. Instagram se conecta a través de la página que lo tiene vinculado.`}
          </p>
          <div className="space-y-2">
            {pageOptions.map(p => (
              <button
                key={p.id}
                onClick={() => p.has_instagram && handleElegirPagina(p.id)}
                disabled={connecting || !p.has_instagram}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center gap-3 ${
                  p.has_instagram
                    ? 'border-slate-200 hover:border-fuchsia-400 hover:bg-fuchsia-50 disabled:opacity-50'
                    : 'border-slate-100 bg-slate-50 cursor-not-allowed opacity-70'
                }`}
              >
                <span className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${p.has_instagram ? 'bg-fuchsia-50' : 'bg-slate-100 text-slate-400'}`}
                      style={p.has_instagram ? { color: ACCENT } : undefined}>
                  <InstagramIcon size={18} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-slate-900 truncate">{p.name}</span>
                  <span className={`block text-xs ${p.has_instagram ? 'text-fuchsia-700' : 'text-slate-400'}`}>
                    {p.has_instagram
                      ? (p.instagram_username ? '@' + p.instagram_username : 'Instagram vinculado')
                      : 'Sin Instagram vinculado'}
                  </span>
                </span>
                {p.has_instagram && <ArrowRight size={16} className="text-slate-400 shrink-0" />}
              </button>
            ))}
          </div>
          {!pageOptions.some(p => p.has_instagram) && (
            <p className="mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              Ninguna de tus páginas tiene una cuenta de Instagram Business vinculada. Vincúlala desde la configuración de tu página en Facebook y vuelve a intentarlo.
            </p>
          )}
          <button
            onClick={() => { setPageOptions(null); setPendingToken(null) }}
            className="mt-4 text-sm font-bold text-slate-500 hover:text-slate-800"
          >
            Cancelar
          </button>
        </div>
      )}

      {step === 1 && !connected && !pageOptions && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in slide-in-from-right-4">
          <div className="bg-white rounded-3xl border-2 border-fuchsia-100 p-8 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 text-white text-[10px] font-black px-4 py-1 rounded-bl-xl uppercase tracking-tight" style={{ backgroundColor: ACCENT }}>Recomendado</div>
            <div className="h-20 w-20 rounded-full bg-fuchsia-50 flex items-center justify-center mb-6" style={{ color: ACCENT }}>
              <Zap size={36} />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">Conexión rápida</h3>
            <p className="text-sm text-slate-500 mb-8 px-2 flex-1">Inicia sesión con Facebook y detectamos automáticamente la cuenta de Instagram vinculada a tu página.</p>
            <button onClick={handleQuickConnect} disabled={connecting} className="w-full py-4 text-white font-bold rounded-2xl flex items-center justify-center gap-3 hover:opacity-90 transition-all shadow-md disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
              {connecting ? <><Loader2 size={18} className="animate-spin" /> Conectando...</> : <><InstagramIcon size={20} /> Conectar con Facebook</>}
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm flex flex-col items-center text-center group hover:border-slate-400 transition-all">
            <div className="h-20 w-20 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center mb-6 group-hover:bg-slate-100 group-hover:text-slate-600 transition-colors">
              <Globe size={36} />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">Configuración manual</h3>
            <p className="text-sm text-slate-500 mb-8 px-2 flex-1">Si ya tienes el token de la página y el ID de tu cuenta de Instagram Business, ingrésalos aquí.</p>
            <button onClick={() => setStep(2)} className="w-full py-4 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-2xl hover:bg-slate-50 hover:border-slate-300 transition-all">
              Usar credenciales API
            </button>
          </div>
        </div>
      )}

      {(step === 2 || connected) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in slide-in-from-right-4">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm h-fit">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <ShieldCheck size={18} className="text-slate-500" />
              <h3 className="font-bold text-slate-800">Cómo obtener tus credenciales</h3>
            </div>
            <div className="p-6 space-y-5 text-sm text-slate-600">
              <Instruction n={1} title="Vincula Instagram a una página" text="Tu cuenta de Instagram debe ser Business y estar vinculada a una página de Facebook." />
              <Instruction n={2} title="Usa el token de la página" text="En Meta for Developers, el token de acceso de la página vinculada sirve para Instagram (el mismo de Messenger)." />
              <Instruction n={3} title="Obtén el ID de Instagram" text="Consulta la Graph API con el ID de tu página para leer el campo instagram_business_account." />
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-bold hover:underline" style={{ color: ACCENT }}>
                Abrir Meta for Developers <ExternalLink size={13} />
              </a>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5 h-fit">
            {!connected && (
              <button onClick={() => setStep(1)} className="text-sm font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 mb-1">
                <ArrowLeft size={15} /> Cambiar método
              </button>
            )}
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1.5">Token de acceso <span className="text-rose-500">*</span></label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type={revealToken ? 'text' : 'password'} value={form.token} onChange={e => setForm({ ...form, token: e.target.value })} placeholder="EAAxxxxxxxx..." className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-200 focus:border-fuchsia-400" />
                <button type="button" onClick={() => setRevealToken(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {revealToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1.5">ID de cuenta de Instagram <span className="text-rose-500">*</span></label>
              <div className="relative">
                <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={form.accountId} onChange={e => setForm({ ...form, accountId: e.target.value })} placeholder="Ej. 17841400000000000" className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-200 focus:border-fuchsia-400" />
              </div>
            </div>
            <button onClick={handleSave} disabled={saving} className="w-full py-3 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2 shadow-sm hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
              {saving ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> : <>{connected ? 'Actualizar' : 'Conectar'} <CheckCircle2 size={16} /></>}
            </button>
          </div>
        </div>
      )}
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
