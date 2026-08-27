 

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import PublicNavbar from '../../../../components/public/PublicNavbar'
import PublicFooter from '../../../../components/public/PublicFooter'
import { supabase } from '../../../../lib/supabase'
import {
  Trash2, AlertTriangle, CheckCircle2, Loader2, Info,
  Phone, Mail, ArrowLeft
} from 'lucide-react'

interface LegalConfig {
  brandName: string
  dpoEmail: string
  website: string
  whatsappNumber: string
}

export default function EliminarDatosPage() {
  const [config, setConfig] = useState<LegalConfig>({
    brandName: 'Plataforma',
    dpoEmail: 'dpo@midominio.com',
    website: 'https://tusitio.com',
    whatsappNumber: '',
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadConfig() {
      const { data } = await supabase
        .from('platform_settings')
        .select('name, legal_settings')
        .eq('id', 1)
        .single()

      const brandName = data?.name || 'Plataforma'
      const legalSettings = data?.legal_settings || {}
      const supportEmail = legalSettings.support_email || 'soporte@midominio.com'
      const dpoEmail = legalSettings.dpo_email || supportEmail
      const website = legalSettings.website_url || 'https://tusitio.com'
      const whatsappNumber = legalSettings.whatsapp_number || ''

      setConfig({ brandName, dpoEmail, website, whatsappNumber })
      setLoading(false)
    }
    loadConfig()
  }, [])

  const [step, setStep] = useState<'form' | 'confirm' | 'error'>('form')
  const [submitting, setSubmitting] = useState(false)
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [form, setForm] = useState({
    email: '',
    phone: '',
    reason: '',
    scope: 'full' as 'full' | 'messages_only',
    confirm: false
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.email && !form.phone) {
      setErrorMsg('Necesitamos email o teléfono para identificar tus datos')
      return
    }
    if (!form.confirm) {
      setErrorMsg('Debes confirmar que entiendes el proceso')
      return
    }

    setSubmitting(true)
    setErrorMsg(null)

    try {
      const res = await fetch('/api/data-deletion/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          reason: form.reason.trim() || null,
          scope: form.scope
        })
      })
      const result = await res.json()

      if (!res.ok || !result.success) {
        setErrorMsg(result?.error || 'Error procesando la solicitud')
        setStep('error')
        return
      }

      setConfirmationCode(result.confirmation_code)
      setStep('confirm')
    } catch (err: any) {
      setErrorMsg('Error de red: ' + (err?.message || 'desconocido'))
      setStep('error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-[#FAFAF7] min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    )
  }

  const { brandName, dpoEmail, website, whatsappNumber } = config

  function formatWhatsApp(raw: string): string {
    const digits = raw.replace(/\D/g, '')
    if (!digits) return ''
    if (digits.length === 10) return `+52 ${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6)}`
    if (digits.length === 12 && digits.startsWith('52')) {
      const rest = digits.slice(2)
      return `+52 ${rest.slice(0,3)} ${rest.slice(3,6)} ${rest.slice(6)}`
    }
    return `+${digits}`
  }

  return (
    <div className="bg-[#FAFAF7] min-h-screen">
      <PublicNavbar />

      <article className="max-w-2xl mx-auto px-4 md:px-8 py-12 md:py-16">

        <Link
          href="/legal/privacidad"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 mb-4"
        >
          <ArrowLeft size={14} />
          Aviso de Privacidad
        </Link>

        <header className="mb-8">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl">
              <Trash2 size={24} className="text-rose-600" strokeWidth={2} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-600 mb-1">
                Derechos ARCO · LFPDPPP · Meta Data Deletion
              </p>
              <h1 className="text-3xl md:text-4xl font-black text-slate-950 leading-tight tracking-tight">
                Solicitar eliminación de datos
              </h1>
            </div>
          </div>
          <p className="text-slate-600 font-medium leading-relaxed mt-4">
            Si tus datos fueron procesados a través de {brandName} (por ejemplo, le escribiste a un negocio
            que usa nuestro agente de WhatsApp), puedes solicitar que los eliminemos completamente
            de nuestros sistemas. Procesamos las solicitudes dentro de los 30 días siguientes.
          </p>
        </header>

        {step === 'form' && (
          <>
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-900">Importante: esta acción es irreversible</p>
                <p className="text-xs text-amber-800 font-medium mt-1 leading-relaxed">
                  Al confirmar, eliminaremos todo tu historial de conversaciones, datos de contacto, y
                  cualquier información asociada. No podremos recuperar nada después. Si solo quieres
                  dejar de recibir mensajes (sin borrar historial), responde "BAJA" en WhatsApp al
                  número del negocio.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 space-y-5">
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5 block">
                  Email del solicitante
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="tu@correo.com"
                    className="w-full pl-10 pr-3 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5 block">
                  Número de WhatsApp (con código de país)
                </label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="521999..."
                    className="w-full pl-10 pr-3 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium font-mono outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Sin signos ni espacios. Ejemplo: 5219991234567
                </p>
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5 block">
                  Alcance del borrado
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <ScopeOption
                    selected={form.scope === 'full'}
                    onClick={() => setForm({ ...form, scope: 'full' })}
                    title="Todo"
                    description="Mensajes + perfil + cualquier registro asociado"
                  />
                  <ScopeOption
                    selected={form.scope === 'messages_only'}
                    onClick={() => setForm({ ...form, scope: 'messages_only' })}
                    title="Solo mensajes"
                    description="Borrar conversaciones pero mantener perfil"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5 block">
                  Razón (opcional)
                </label>
                <textarea
                  value={form.reason}
                  onChange={e => setForm({ ...form, reason: e.target.value })}
                  placeholder="Nos ayuda a mejorar saber por qué solicitas el borrado..."
                  rows={3}
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-slate-900 resize-none"
                />
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.confirm}
                  onChange={e => setForm({ ...form, confirm: e.target.checked })}
                  className="mt-1 w-4 h-4 rounded border-slate-300"
                />
                <span className="text-xs text-slate-700 font-medium leading-relaxed">
                  Confirmo que entiendo que esta acción <strong>no es reversible</strong> y que todos
                  mis datos serán eliminados permanentemente de los sistemas de {brandName} dentro de los
                  próximos 30 días.
                </span>
              </label>

              {errorMsg && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex gap-2">
                  <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium text-rose-900">{errorMsg}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !form.confirm}
                className="w-full px-6 py-4 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white rounded-2xl font-black text-base transition-colors inline-flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                {submitting ? 'Enviando...' : 'Enviar solicitud de borrado'}
              </button>
            </form>

            <div className="mt-8 bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                ¿Prefieres email directo?
              </p>
              <p className="text-sm text-slate-700 font-medium leading-relaxed">
                Puedes escribirnos a <a href={`mailto:${dpoEmail}`} className="font-bold text-slate-950 underline">{dpoEmail}</a> con
                el asunto "Solicitud de eliminación de datos" e incluir email/teléfono de identificación.
                Procesamos solicitudes por email en el mismo plazo de 30 días.
              </p>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <div className="bg-white border border-emerald-200 rounded-3xl p-6 md:p-8 text-center">
            <div className="inline-flex p-4 bg-emerald-50 border border-emerald-200 rounded-2xl mb-4">
              <CheckCircle2 size={32} className="text-emerald-600" strokeWidth={2} />
            </div>
            <h2 className="text-2xl font-black text-slate-950 mb-3">Solicitud recibida</h2>
            <p className="text-slate-600 font-medium mb-6 leading-relaxed">
              Procesaremos tu solicitud dentro de los próximos 30 días naturales.
              Te enviaremos un correo de confirmación cuando el borrado esté completo.
            </p>
            <div className="bg-slate-950 text-white rounded-2xl p-5 mb-6">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">
                Tu código de confirmación
              </p>
              <p className="text-3xl font-black font-mono tracking-wide">{confirmationCode}</p>
              <p className="text-[11px] text-slate-400 mt-2">
                Guárdalo. Lo necesitarás si quieres verificar el estado de tu solicitud.
              </p>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Si tienes dudas, escríbenos a <a href={`mailto:${dpoEmail}`} className="font-bold underline">{dpoEmail}</a>.
            </p>
          </div>
        )}

        {step === 'error' && (
          <div className="bg-white border border-rose-200 rounded-3xl p-6 md:p-8">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={24} className="text-rose-600 shrink-0" />
              <div>
                <h2 className="text-xl font-black text-slate-950 mb-2">No pudimos procesar tu solicitud</h2>
                <p className="text-slate-600 font-medium">{errorMsg || 'Error desconocido'}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 font-medium leading-relaxed mb-4">
              Por favor escribe directamente a <a href={`mailto:${dpoEmail}`} className="font-bold text-slate-950 underline">{dpoEmail}</a> con
              tu email y/o teléfono de WhatsApp, y procesaremos manualmente tu solicitud.
            </p>
            <button
              onClick={() => { setStep('form'); setErrorMsg(null) }}
              className="px-5 py-2.5 bg-slate-950 hover:bg-slate-800 text-white rounded-xl text-sm font-bold"
            >
              Intentar de nuevo
            </button>
          </div>
        )}

        <div className="mt-12 bg-white border border-slate-200 rounded-3xl p-6">
          <div className="flex items-start gap-3">
            <Info size={18} className="text-slate-500 mt-0.5 shrink-0" />
            <div className="text-xs text-slate-600 font-medium leading-relaxed space-y-2">
              <p>
                <strong className="text-slate-900">Sobre el proceso:</strong> {brandName} es Encargado del Tratamiento
                en términos de la Ley Federal de Protección de Datos Personales (LFPDPPP). El Responsable es el
                negocio que te atendió (por ejemplo, la clínica/restaurante/inmobiliaria con el que conversaste).
              </p>
              <p>
                Tu solicitud nos llega a nosotros y la procesamos directamente. También notificaremos al negocio
                con el que conversaste para que pueda eliminar tus datos de su CRM.
              </p>
              <p>
                Si después de 30 días no recibiste confirmación, contáctanos en{' '}
                <a href={`mailto:${dpoEmail}`} className="font-bold underline">{dpoEmail}</a> o
                ante el INAI (<a href="https://home.inai.org.mx" target="_blank" rel="noopener noreferrer" className="font-bold underline">inai.org.mx</a>).
              </p>
            </div>
          </div>
        </div>

      </article>

      <PublicFooter />
    </div>
  )
}

function ScopeOption({ selected, onClick, title, description }: {
  selected: boolean
  onClick: () => void
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-3 rounded-xl text-left transition-all border-2 ${
        selected
          ? 'border-rose-600 bg-rose-50'
          : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <p className={`text-sm font-black mb-0.5 ${selected ? 'text-rose-700' : 'text-slate-950'}`}>
        {title}
      </p>
      <p className="text-xs text-slate-600 font-medium">{description}</p>
    </button>
  )
}