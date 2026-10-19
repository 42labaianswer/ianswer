'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ArrowLeft, ArrowRight, Loader2, User, Phone, Mail, MapPin, AlertTriangle, CheckCircle2, Info
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useWorkspace } from './WorkspaceContext'
import { hasDashboardAccess } from '../lib/subscription'
import ConnectWhatsAppButton from './whatsapp/ConnectWhatsAppButton'
import AgendasTab from './AgendaTab'
import LocationTab from './LocationTab'

// ============================================================================
// FirstStepsWizard — primeros pasos después de iniciar la prueba
// ----------------------------------------------------------------------------
// Se abre una sola vez, la primera vez que la cuenta entra al dashboard con la
// prueba activa. Pide lo mismo que /dashboard/settings y Conectividad:
//   1. Contacto y dirección (companies)
//   2. WhatsApp (Embedded Signup, el mismo botón de Conectividad)
//   3. Google Calendar (AgendasTab)
//   4. Sedes (LocationTab)
// Cada paso se puede omitir. Al terminar o al cerrarlo se llena
// companies.first_steps_completed_at (database/add_first_steps.sql) y no
// vuelve a salir. El paso actual se recuerda en el navegador para retomarlo si
// se recarga la página.
// ============================================================================

type Step = 1 | 2 | 3 | 4
const STEPS: Step[] = [1, 2, 3, 4]

type CompanyRow = {
  id: string
  plan_slug: string | null
  subscription_status: string | null
  trial_ends_at: string | null
  onboarding_completed: boolean | null
  first_steps_completed_at: string | null
  doctor_name: string | null
  contact_phone: string | null
  contact_email: string | null
  address: string | null
  business_phone_id: string | null
  waba_display_phone: string | null
}

const stepKey = (companyId: string) => `first-steps-step:${companyId}`

function readStoredStep(companyId: string): Step {
  try {
    const n = Number(localStorage.getItem(stepKey(companyId)))
    return (STEPS as number[]).includes(n) ? (n as Step) : 1
  } catch {
    return 1
  }
}

function storeStep(companyId: string, step: Step | null) {
  try {
    if (step === null) localStorage.removeItem(stepKey(companyId))
    else localStorage.setItem(stepKey(companyId), String(step))
  } catch { /* sin almacenamiento: se empieza en el paso 1 */ }
}

export default function FirstStepsWizard() {
  const [closed, setClosed] = useState(false)

  const { data: company } = useQuery({
    queryKey: ['first-steps-company'],
    queryFn: async (): Promise<CompanyRow | null> => {
      // Al volver de Stripe el OnboardingWizard confirma la sesión y recarga;
      // este wizard espera a esa recarga.
      if (new URLSearchParams(window.location.search).has('checkout')) return null
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      if (!profile?.company_id) return null
      const { data, error } = await supabase
        .from('companies')
        .select('id, plan_slug, subscription_status, trial_ends_at, onboarding_completed, first_steps_completed_at, doctor_name, contact_phone, contact_email, address, business_phone_id, waba_display_phone')
        .eq('id', profile.company_id)
        .single()
      // Sin la migración la columna no existe: el wizard simplemente no sale.
      if (error) return null
      return data as CompanyRow
    }
  })

  const shouldShow = !!company &&
    !closed &&
    !!company.onboarding_completed &&
    !company.first_steps_completed_at &&
    hasDashboardAccess({ status: company.subscription_status, trialEndsAt: company.trial_ends_at })

  if (!shouldShow || typeof window === 'undefined') return null
  return <FirstStepsDialog company={company} onDone={() => setClosed(true)} />
}

function FirstStepsDialog({ company, onDone }: { company: CompanyRow, onDone: () => void }) {
  const queryClient = useQueryClient()
  const { labels } = useWorkspace()
  const [step, setStep] = useState<Step>(() => readStoredStep(company.id))
  const [contact, setContact] = useState({
    doctor_name: company.doctor_name || '',
    contact_phone: company.contact_phone || '',
    contact_email: company.contact_email || '',
    address: company.address || ''
  })
  const [isSaving, setIsSaving] = useState(false)
  const companyId = company.id
  const planSlug = company.plan_slug || 'start'

  const goTo = (next: Step) => {
    setStep(next)
    storeStep(companyId, next)
  }

  const finish = async (exitedEarly = false) => {
    setIsSaving(true)
    const { error } = await supabase
      .from('companies')
      .update({ first_steps_completed_at: new Date().toISOString() })
      .eq('id', companyId)
    setIsSaving(false)
    if (error) {
      toast.error('No se pudo guardar. Intenta de nuevo.')
      return
    }
    storeStep(companyId, null)
    if (exitedEarly) {
      toast('Puedes completar lo que falte en Configuración y Conectividad.', { icon: <Info size={16} className="text-sky-300 shrink-0" />, duration: 6000 })
    }
    onDone()
    queryClient.invalidateQueries({ queryKey: ['first-steps-company'] })
  }

  const saveContact = async () => {
    const changed = (Object.keys(contact) as (keyof typeof contact)[])
      .some(k => contact[k].trim() !== (company[k] || ''))
    if (!changed) return true
    setIsSaving(true)
    const { error } = await supabase
      .from('companies')
      .update({
        doctor_name: contact.doctor_name.trim(),
        contact_phone: contact.contact_phone.trim(),
        contact_email: contact.contact_email.trim(),
        address: contact.address.trim()
      })
      .eq('id', companyId)
    setIsSaving(false)
    if (error) {
      toast.error(`Error al guardar: ${error.message}`)
      return false
    }
    queryClient.invalidateQueries({ queryKey: ['companyProfile', companyId] })
    return true
  }

  const handleContinue = async () => {
    if (step === 1 && !(await saveContact())) return
    if (step === 4) return finish()
    goTo((step + 1) as Step)
  }

  const handleSkip = () => {
    if (step === 4) return finish()
    goTo((step + 1) as Step)
  }

  const handleWhatsAppConnected = async () => {
    toast.success('WhatsApp conectado')
    await queryClient.invalidateQueries({ queryKey: ['first-steps-company'] })
    goTo(3)
  }

  const inputClass = 'w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl outline-none focus:border-slate-900 text-sm font-medium text-slate-900'

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6"
      style={{ zIndex: 99998 }}
    >
      <div className="bg-white rounded-[2rem] shadow-2xl shadow-slate-900/30 max-w-4xl w-full overflow-hidden flex flex-col max-h-[95vh]">

        <div className="px-8 pt-8 pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Primeros pasos</p>
              <p className="text-lg font-black text-slate-900 tracking-tight">Deja listo tu asistente</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full whitespace-nowrap">
                Paso {step} de {STEPS.length}
              </span>
              <button
                type="button"
                onClick={() => finish(true)}
                disabled={isSaving}
                className="text-xs font-bold text-[#5B2BE8] underline hover:text-[#4A22C4] disabled:opacity-60 whitespace-nowrap"
              >
                Salir
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            {STEPS.map(n => (
              <div key={n} className={`flex-1 h-1.5 rounded-full transition-all duration-500 ${n <= step ? 'bg-slate-900' : 'bg-slate-200'}`} />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-8">

          {step === 1 && (
            <>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2">¿Cómo te contactan tus clientes?</h2>
              <p className="text-sm text-slate-500 font-medium mb-8">
                Tu asistente usa estos datos cuando un cliente pregunta por teléfono, correo o dirección. Puedes cambiarlos después en Configuración.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl">
                <label className="space-y-2">
                  <span className="text-sm font-bold text-slate-700 flex items-center gap-2"><User size={14} className="text-slate-400" /> Contacto principal</span>
                  <input type="text" value={contact.doctor_name} onChange={e => setContact({ ...contact, doctor_name: e.target.value })} placeholder="Nombre de la persona responsable" className={inputClass} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold text-slate-700 flex items-center gap-2"><Phone size={14} className="text-slate-400" /> Teléfono público</span>
                  <input type="tel" value={contact.contact_phone} onChange={e => setContact({ ...contact, contact_phone: e.target.value })} placeholder="Ej. +52 999 123 4567" className={inputClass} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold text-slate-700 flex items-center gap-2"><Mail size={14} className="text-slate-400" /> Correo de contacto</span>
                  <input type="email" value={contact.contact_email} onChange={e => setContact({ ...contact, contact_email: e.target.value })} placeholder="contacto@tunegocio.com" className={inputClass} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold text-slate-700 flex items-center gap-2"><MapPin size={14} className="text-slate-400" /> Dirección principal</span>
                  <input type="text" value={contact.address} onChange={e => setContact({ ...contact, address: e.target.value })} placeholder="Calle, número, colonia y ciudad" className={inputClass} />
                </label>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2">Conecta tu WhatsApp</h2>
              <p className="text-sm text-slate-500 font-medium mb-6">
                Es el número donde tu asistente va a contestar. Se abre una ventana oficial de Meta para elegir tu cuenta y tu número.
              </p>
              {company.business_phone_id ? (
                <div className="flex items-center gap-3 p-5 rounded-2xl border-2 border-emerald-200 bg-emerald-50 max-w-xl">
                  <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-black text-slate-900">WhatsApp conectado</p>
                    <p className="text-sm text-slate-600 font-medium">{company.waba_display_phone || 'Número conectado'}</p>
                  </div>
                </div>
              ) : (
                <div className="max-w-xl space-y-5">
                  <div className="flex gap-3 p-4 rounded-2xl border border-amber-200 bg-amber-50">
                    <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-900 font-medium space-y-1">
                      <p className="font-bold">Antes de conectar, lee esto</p>
                      <p>Si el número ya tiene WhatsApp en un celular, hay que eliminar esa cuenta (WhatsApp → Ajustes → Cuenta → Eliminar cuenta) y se pierden sus chats y grupos. Exporta antes los chats importantes, o usa un número nuevo solo para el negocio.</p>
                    </div>
                  </div>
                  <ConnectWhatsAppButton
                    variant="primary"
                    onSuccess={handleWhatsAppConnected}
                    onError={(msg) => toast.error(msg)}
                  />
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2">Agenda con Google Calendar</h2>
              <p className="text-sm text-slate-500 font-medium mb-6">Opcional: para que tu asistente agende citas directo en tu calendario.</p>
              <AgendasTab companyId={companyId} planSlug={planSlug} />
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2">{labels?.location_plural || 'Sedes'}</h2>
              <p className="text-sm text-slate-500 font-medium mb-6">Opcional: si atiendes en más de un lugar, agrégalos aquí.</p>
              <LocationTab companyId={companyId} planSlug={planSlug} />
            </>
          )}
        </div>

        <div className="px-8 py-5 border-t border-slate-100 flex items-center justify-between bg-slate-50">
          <button
            type="button"
            onClick={() => goTo((step - 1) as Step)}
            disabled={step === 1 || isSaving}
            className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <ArrowLeft size={16} /> Anterior
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSkip}
              disabled={isSaving}
              className="px-4 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-900 disabled:opacity-40"
            >
              Saltar este paso
            </button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={isSaving}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
              {step === 4 ? 'Terminar' : 'Continuar'}
              {!isSaving && step !== 4 && <ArrowRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
