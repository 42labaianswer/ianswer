 

'use client'

// ============================================================================
// src/app/dashboard/connectivity/facebook/page.tsx
// ----------------------------------------------------------------------------
// Conexión de Facebook Messenger — DOS métodos:
//  1. Conexión rápida: FB.login real (funciona ya para admins/testers de la app,
//     aunque el App Review público siga en revisión).
//  2. Manual: pegar token de página + page ID.
// Guarda en integrations con platform 'messenger'.
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

const ACCENT = '#1877F2'

interface PageOption {
  id: string
  name: string
  has_instagram: boolean
  instagram_username: string | null
}

// Permisos para Messenger. Los de Instagram (instagram_manage_messages) se
// agregarán aquí cuando la cuenta de Instagram esté lista y el producto de
// Instagram esté habilitado en el panel de la app de Meta.
const META_SCOPES = [
  'pages_show_list', 'pages_messaging', 'pages_manage_metadata',
  'pages_read_engagement', 'instagram_basic', 'instagram_manage_messages',
  'business_management'
].join(',')

const FacebookIcon = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 3.656 10.99 8.792 12.87v-9.1h-3.303v-3.77h3.303V10.27c0-3.26 1.942-5.062 4.912-5.062 1.423 0 2.91.254 2.91.254v3.2h-1.637c-1.614 0-2.118 1.002-2.118 2.03v2.441h3.61l-.577 3.77h-3.033V25c5.136-1.88 8.792-6.88 8.792-12.927z"/>
  </svg>
)

export default function FacebookConnectPage() {
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
  const [form, setForm] = useState({ token: '', pageId: '' })
  // Selector de página: cuando la cuenta administra varias, Meta nos las
  // devuelve y el usuario elige cuál conectar.
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
        .eq('platform', 'messenger')
        .maybeSingle()

      if (integration) {
        setForm({ token: integration.access_token || '', pageId: integration.page_id || '' })
        setConnected(true)
      }
      setLoading(false)
    }
    load()
  }, [router])

  // ── Conexión rápida: FB.login real ──
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

    // Timeout de seguridad: si el popup no regresa (bloqueado o dominio no
    // autorizado en la app de Meta), reseteamos el botón y avisamos.
    let settled = false
    const safety = setTimeout(() => {
      if (!settled) {
        setConnecting(false)
        toast.error('No se recibió respuesta de Facebook. Revisa que el popup no esté bloqueado y esté en los dominios de tu app de Meta.', { duration: 8000 })
      }
    }, 60000)

    // OJO: FB.login NO acepta un callback async (falla con "Expression is of
    // type asyncfunction, not function"). El callback debe ser una función
    // normal; adentro llamamos a una async aparte.
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

  // Llama al backend. Si no se manda pageId y la cuenta administra varias
  // páginas, el backend devuelve la lista para que el usuario elija.
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

    const igMsg = result.instagram ? ` e Instagram (@${result.instagram.username || 'cuenta'})` : ''
    toast.success(`Facebook conectado${igMsg}`)
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
    setConnected(true)
    setConnecting(false)
    setPageOptions(null)
    setPendingToken(null)
    if (result.facebook?.page_id) {
      setForm(f => ({ ...f, pageId: result.facebook.page_id }))
    }
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
    if (!form.token || !form.pageId) {
      toast.error('Completa el Token de acceso y el ID de la página')
      return
    }
    if (!companyId) return
    setSaving(true)
    try {
      const { error } = await supabase.from('integrations').upsert({
        company_id: companyId, platform: 'messenger',
        access_token: form.token.trim(), page_id: form.pageId.trim(),
        status: 'connected', updated_at: new Date().toISOString()
      }, { onConflict: 'company_id,platform' })
      if (error) throw error
      // También guardamos el page_id en companies para que el flujo de n8n
      // identifique la empresa cuando llega un mensaje de Messenger.
      await supabase.from('companies')
        .update({ fb_page_id: form.pageId.trim() })
        .eq('id', companyId)
      toast.success('Facebook Messenger conectado')
      setConnected(true)
    } catch (e: any) {
      toast.error('Error al guardar: ' + (e?.message || 'desconocido'))
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    if (!companyId) return
    if (!(await confirm('¿Desconectar Facebook Messenger?', { title: 'Desconectar canal', danger: true, confirmText: 'Desconectar' }))) return
    setSaving(true)
    try {
      await supabase.from('integrations').delete()
        .eq('company_id', companyId).eq('platform', 'messenger')
      await supabase.from('companies').update({ fb_page_id: null }).eq('id', companyId)
      toast.success('Facebook desconectado')
      setConnected(false)
      setForm({ token: '', pageId: '' })
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
          <ChannelDiagnostics canal="messenger" nombre="Facebook Messenger" />
        </div>
      )}

      <PageHeader
        title="Conectar Facebook Messenger"
        description="Permite que tu asistente de IA responda los mensajes de tu página de Facebook."
      />

      {/* Estado conectado */}
      {connected && (
        <div className="mb-6 p-5 rounded-2xl border-2 border-blue-200 bg-blue-50 flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0 text-blue-600">
            <CheckCircle2 size={24} />
          </div>
          <div className="flex-1">
            <p className="font-black text-blue-900">Facebook Messenger conectado</p>
            {form.pageId && <p className="text-sm text-blue-800">Página ID: {form.pageId}</p>}
          </div>
          {/* Cambiar a otra página sin desconectar primero */}
          <button
            onClick={handleQuickConnect}
            disabled={connecting || saving}
            className="px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-50 hover:bg-blue-100"
            style={{ color: ACCENT }}
          >
            {connecting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Cambiar página
          </button>
          <button onClick={handleDisconnect} disabled={saving} className="px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl flex items-center gap-1.5 disabled:opacity-50">
            <Trash2 size={14} /> Desconectar
          </button>
        </div>
      )}

      {/* CONFIRMACIÓN: qué se va a conectar (siempre, antes de guardar) */}
      {pageOptions && pageOptions.length > 0 && (
        <div className="mb-6 bg-white rounded-2xl border-2 border-blue-200 p-6 shadow-sm animate-in fade-in">
          <h3 className="font-black text-slate-900 mb-1">
            {pageOptions.length === 1 ? 'Confirma la conexión' : 'Elige la página que quieres conectar'}
          </h3>
          <p className="text-sm text-slate-500 mb-5">
            {pageOptions.length === 1
              ? 'Esto es lo que vamos a conectar. Revísalo y confirma.'
              : `Tu cuenta administra ${pageOptions.length} páginas. Selecciona a cuál debe responder el asistente.`}
          </p>
          <div className="space-y-2">
            {pageOptions.map(p => (
              <button
                key={p.id}
                onClick={() => handleElegirPagina(p.id)}
                disabled={connecting}
                className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all flex items-center gap-3 disabled:opacity-50"
              >
                <span className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0" style={{ color: ACCENT }}>
                  <FacebookIcon size={18} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-slate-900 truncate">{p.name}</span>
                  <span className="block text-xs text-slate-500">
                    {p.has_instagram
                      ? `Instagram vinculado${p.instagram_username ? ': @' + p.instagram_username : ''} — se conecta también`
                      : 'Sin Instagram vinculado — solo Messenger'}
                  </span>
                </span>
                {connecting
                  ? <Loader2 size={16} className="text-slate-400 shrink-0 animate-spin" />
                  : <ArrowRight size={16} className="text-slate-400 shrink-0" />}
              </button>
            ))}
          </div>
          {pageOptions.some(p => !p.has_instagram) && (
            <p className="mt-4 text-xs text-slate-500 leading-relaxed">
              ¿Esperabas ver Instagram? Tu cuenta debe ser de tipo Business y estar vinculada a la página desde la configuración de Facebook. Si la vinculas ahora, vuelve a conectar para que se detecte.
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

      {/* PASO 1: elegir método (2 columnas) */}
      {step === 1 && !connected && !pageOptions && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in slide-in-from-right-4">
          {/* Conexión rápida */}
          <div className="bg-white rounded-3xl border-2 border-blue-100 p-8 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 text-white text-[10px] font-black px-4 py-1 rounded-bl-xl uppercase tracking-tight" style={{ backgroundColor: ACCENT }}>Recomendado</div>
            <div className="h-20 w-20 rounded-full bg-blue-50 flex items-center justify-center mb-6" style={{ color: ACCENT }}>
              <Zap size={36} />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">Conexión rápida</h3>
            <p className="text-sm text-slate-500 mb-8 px-2 flex-1">Inicia sesión con Facebook y selecciona tu página con un solo clic. Si tu página tiene Instagram vinculado, se conecta también.</p>
            <button
              onClick={handleQuickConnect}
              disabled={connecting}
              className="w-full py-4 text-white font-bold rounded-2xl flex items-center justify-center gap-3 hover:opacity-90 transition-all shadow-md disabled:opacity-60"
              style={{ backgroundColor: ACCENT }}
            >
              {connecting ? <><Loader2 size={18} className="animate-spin" /> Conectando...</> : <><FacebookIcon size={20} /> Conectar con Facebook</>}
            </button>
          </div>

          {/* Manual */}
          <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm flex flex-col items-center text-center group hover:border-slate-400 transition-all">
            <div className="h-20 w-20 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center mb-6 group-hover:bg-slate-100 group-hover:text-slate-600 transition-colors">
              <Globe size={36} />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">Configuración manual</h3>
            <p className="text-sm text-slate-500 mb-8 px-2 flex-1">Si ya generaste un token de acceso de página desde Meta for Developers, ingrésalo aquí.</p>
            <button onClick={() => setStep(2)} className="w-full py-4 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-2xl hover:bg-slate-50 hover:border-slate-300 transition-all">
              Usar credenciales API
            </button>
          </div>
        </div>
      )}

      {/* PASO 2: manual (2 columnas: instrucciones | formulario) */}
      {(step === 2 || connected) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in slide-in-from-right-4">
          {/* Instrucciones */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm h-fit">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <ShieldCheck size={18} className="text-slate-500" />
              <h3 className="font-bold text-slate-800">Cómo obtener tus credenciales</h3>
            </div>
            <div className="p-6 space-y-5 text-sm text-slate-600">
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed">
                <strong className="block mb-1">⚠️ Antes de empezar</strong>
                Estos 2 datos los genera Meta automáticamente — <strong>no son tu correo ni una contraseña propia.</strong> Si lo que vas a pegar es corto o lo reconoces como algo tuyo, vuelve a Meta for Developers y cópialo de ahí.
              </div>
              <Instruction n={1} title="Entra a Meta for Developers" text="Ve a tu app en developers.facebook.com y abre Messenger > Configuración de la API." />
              <Instruction n={2} title="Genera un token de página" text='En la configuración de la API de Messenger, selecciona tu página y genera un token de acceso de página. Es un texto largo (200+ caracteres) que empieza con "EAA".' />
              <Instruction n={3} title='Copia el "ID de la página"' text="Es un número largo (ej. 102345678901234) que identifica tu página de Facebook dentro de Meta — no es el nombre de la página. Lo encuentras en la configuración de la página o junto al token generado." />
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-bold hover:underline" style={{ color: ACCENT }}>
                Abrir Meta for Developers <ExternalLink size={13} />
              </a>
            </div>
          </div>

          {/* Formulario */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5 h-fit">
            {!connected && (
              <button onClick={() => setStep(1)} className="text-sm font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 mb-1">
                <ArrowLeft size={15} /> Cambiar método
              </button>
            )}
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1.5">Token de acceso de página <span className="text-rose-500">*</span></label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type={revealToken ? 'text' : 'password'} value={form.token} onChange={e => setForm({ ...form, token: e.target.value })} placeholder="EAAxxxxxxxx..." className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" />
                <button type="button" onClick={() => setRevealToken(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {revealToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-400 leading-snug">Texto largo (200+ caracteres) que empieza con “EAA”. No es tu contraseña de Facebook.</p>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1.5">ID de la página <span className="text-rose-500">*</span></label>
              <div className="relative">
                <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={form.pageId} onChange={e => setForm({ ...form, pageId: e.target.value })} placeholder="Ej. 102345678901234" className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" />
              </div>
              <p className="mt-1 text-[11px] text-slate-400 leading-snug">Número largo que identifica tu página de Facebook — no es el nombre de la página.</p>
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
