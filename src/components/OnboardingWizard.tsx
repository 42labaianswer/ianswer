// ============================================================================
// Plataforma Multi-Tenant de Asistente IA (c) 2026 Gustavo Monforte Herrero
// ----------------------------------------------------------------------------
// Este software es propiedad intelectual de Gustavo Monforte Herrero y se entrega bajo
// licencia de uso. Todos los derechos reservados.
// Prohibida su reproducción, distribución  sin autorización.
// ============================================================================

'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../components/WorkspaceContext'
import { getIcon } from '../lib/iconMap'
import toast from 'react-hot-toast'
import {
  Stethoscope, Home, Utensils, Megaphone, Sparkles, Heart,
  ArrowRight, ArrowLeft, Loader2, MessageSquare, Users,
  Building2, CheckCircle2, X, PackageOpen, Layers,
  FileText, Phone, Plug, ShieldCheck, Zap, Wrench, GraduationCap,
  TrendingUp, Palette, LifeBuoy
} from 'lucide-react'
import IAnswerLoader from './IAnswerLoader'
import { hasDashboardAccess } from '../lib/subscription'

// ============================================================================
// OnboardingWizard v4.0 — Stripe obligatorio (plan-agente-semana04, sección 4)
// ----------------------------------------------------------------------------
// P1: ¿A qué te dedicas?                  → template (cargado de la DB)
// P2: ¿Cuántas conversaciones recibes?    → sugiere plan (rangos = plans.max_sessions_per_month)
// P3: ¿Cuántos usuarios usarán?           → OCULTO (ENABLE_TEAM_SIZE_STEP)
// P4: Addons sugeridos (OPCIONAL)         → solo "de interés", ya no se activan
// P5: Casi listo                          → nombre + elegir plan → Stripe Checkout
//
// El wizard ya NO asigna plan: /api/onboarding/complete guarda el plan como
// pendiente y el plan real lo escribe el webhook de Stripe al iniciar la
// prueba. Si el usuario sale sin pagar y vuelve a entrar, regresa al P5
// (modo "resume"). Al volver de Stripe se confirma la sesión con
// /api/stripe/confirm-checkout para no depender de que el webhook llegue antes.
// ============================================================================

// El paso "¿Cuántas personas usarán iAnswer?" vuelve cuando existan las
// invitaciones a equipos. Mientras tanto la sugerencia de plan solo usa el P2.
const ENABLE_TEAM_SIZE_STEP = false

const USER_BANDS = [
  { id: '1',      label: '1 usuario',          description: 'Solo yo',                        suggestedPlan: 'start' as const },
  { id: '2_5',    label: '2 a 5 usuarios',     description: 'Equipo pequeño',                  suggestedPlan: 'growth' as const },
  { id: '6_plus', label: '6 o más usuarios',   description: 'Equipo grande / multi-sucursal',  suggestedPlan: 'scale' as const }
]

const PLAN_NAMES = { start: 'Start', growth: 'Growth', scale: 'Scale' }
type PlanSlug = 'start' | 'growth' | 'scale'
type WizardStep = 1 | 2 | 3 | 4 | 5

type PlanRow = {
  slug: PlanSlug
  name: string
  description: string | null
  price_monthly_cents: number
  max_sessions_per_month: number
  max_team_members: number
  max_channels: number
  trial_days: number | null
  stripe_price_id: string | null
}

// Rangos del P2 armados con las conversaciones reales de cada plan (misma
// fuente que /dashboard/plans y /precios), no escritos a mano.
function buildVolumeBands(plans: PlanRow[]) {
  const [start, growth] = plans
  if (!start || !growth) return []
  const fmt = (n: number) => n.toLocaleString('es-MX')
  return [
    { id: 'small',  label: `Hasta ${fmt(start.max_sessions_per_month)}`,
      range: 'Pocas conversaciones', suggestedPlan: start.slug },
    { id: 'medium', label: `Entre ${fmt(start.max_sessions_per_month + 1)} y ${fmt(growth.max_sessions_per_month)}`,
      range: 'Volumen medio', suggestedPlan: growth.slug },
    { id: 'large',  label: `Más de ${fmt(growth.max_sessions_per_month)}`,
      range: 'Alto volumen', suggestedPlan: (plans[2] || growth).slug },
  ]
}

const ADDON_ICONS: Record<string, any> = {
  FileText, Sparkles, Phone, Plug, ShieldCheck, Zap, Wrench, GraduationCap,
  TrendingUp, Palette, LifeBuoy, PackageOpen, Building2
}

type AddonRow = {
  id: string
  name: string
  short_name?: string
  description: string | null
  category: string
  icon: string
  price_monthly_cents: number
  price_one_time_cents: number
  is_recurring: boolean
  is_one_time: boolean
  is_featured: boolean
  available_for_templates: string[]
  is_template_specific?: boolean
}

function centsToMxn(cents: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(cents / 100)
}

function getMaxPlan(p1: PlanSlug, p2: PlanSlug): PlanSlug {
  const order = { start: 0, growth: 1, scale: 2 }
  return order[p1] >= order[p2] ? p1 : p2
}

export default function OnboardingWizard() {
  const router = useRouter()
  const { platform } = useWorkspace()
  const brandName = platform.name || 'Plataforma'
  const [loading, setLoading] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  // Estado del wizard
  const [step, setStep] = useState<WizardStep>(1)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [volumeBand, setVolumeBand] = useState<string | null>(null)
  const [userBand, setUserBand] = useState<typeof USER_BANDS[number]['id'] | null>(null)
  const [selectedAddons, setSelectedAddons] = useState<string[]>([])
  const [companyName, setCompanyName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  // Estado aparte para "Salir por ahora": con isSaving el botón principal del
  // P5 decía "Abriendo Stripe..." aunque no se iba a Stripe.
  const [isExiting, setIsExiting] = useState(false)
  // Plan elegido en el P5 (arranca en el sugerido; el usuario lo puede cambiar).
  const [chosenPlan, setChosenPlan] = useState<PlanSlug | null>(null)
  // 'resume': terminó los pasos pero salió sin pagar → se muestra solo el P5.
  const [mode, setMode] = useState<'full' | 'resume'>('full')
  // Regreso de Stripe con éxito: se confirma la sesión antes de entrar.
  const [activating, setActivating] = useState(false)

  const visibleSteps: WizardStep[] = mode === 'resume'
    ? [5]
    : ENABLE_TEAM_SIZE_STEP ? [1, 2, 3, 4, 5] : [1, 2, 4, 5]
  const stepIndex = Math.max(0, visibleSteps.indexOf(step))
  const goNext = () => setStep(visibleSteps[Math.min(stepIndex + 1, visibleSteps.length - 1)])
  const goPrev = () => setStep(visibleSteps[Math.max(stepIndex - 1, 0)])

  // ── Cargar plantillas desde la base de datos ──
  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ['onboarding-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('is_active', true)
        .order('display_order')
      if (error) throw error
      return data || []
    }
  })

  // Planes reales (conversaciones, precio, price_id de Stripe)
  const { data: plans = [] } = useQuery({
    queryKey: ['onboarding-plans'],
    enabled: needsOnboarding,
    queryFn: async (): Promise<PlanRow[]> => {
      const { data, error } = await supabase
        .from('plans')
        .select('slug, name, description, price_monthly_cents, max_sessions_per_month, max_team_members, max_channels, trial_days, stripe_price_id')
        .eq('is_active', true)
        .eq('is_legacy', false)
        .order('display_order')
      if (error) throw error
      return (data || []) as PlanRow[]
    }
  })
  const volumeBands = buildVolumeBands(plans)

  const suggestedPlan: PlanSlug = (() => {
    const vp = (volumeBands.find(b => b.id === volumeBand)?.suggestedPlan || 'start') as PlanSlug
    if (!ENABLE_TEAM_SIZE_STEP || !userBand) return vp
    const up = USER_BANDS.find(b => b.id === userBand)?.suggestedPlan || 'start'
    return getMaxPlan(vp, up)
  })()
  const planToBuy: PlanSlug = chosenPlan || suggestedPlan
  const trialDays = plans.find(p => p.slug === planToBuy)?.trial_days ?? 7

  // Cargar addons disponibles para el template seleccionado (cuando llegamos al P4)
  const { data: availableAddons = [], isLoading: loadingAddons } = useQuery({
    queryKey: ['onboarding-addons', selectedTemplate],
    enabled: !!selectedTemplate && step >= 4,
    queryFn: async (): Promise<AddonRow[]> => {
      const { data } = await supabase
        .from('addons')
        .select('*')
        .eq('is_active', true)
        .order('display_order')
      if (!data) return []
      return (data as AddonRow[]).filter(a => {
        const isUniversal = !a.available_for_templates || a.available_for_templates.length === 0
        const matches = a.available_for_templates?.includes(selectedTemplate || '')
        return isUniversal || matches
      })
    }
  })

  // ─── Regreso de Stripe: confirmar la sesión (reintenta unos segundos) ───
  const confirmCheckout = async (sessionId: string) => {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const res = await fetch('/api/stripe/confirm-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        })
        const result = await res.json().catch(() => ({}))
        if (res.ok && result.ok) {
          toast.success('¡Listo! Tu prueba gratuita ya comenzó')
          window.history.replaceState(null, '', window.location.pathname)
          setTimeout(() => window.location.reload(), 700)
          return
        }
        if (res.status === 403 || res.status === 400) break
      } catch { /* reintentar */ }
      await new Promise(r => setTimeout(r, 2000))
    }
    toast.error('No pudimos confirmar tu suscripción todavía. Recarga la página en unos segundos.', { duration: 8000 })
    window.history.replaceState(null, '', window.location.pathname)
    setTimeout(() => window.location.reload(), 3000)
  }

  // ─── Salir sin plan ───
  // Guarda primero lo del onboarding (si el usuario ya contestó los pasos) para
  // que al volver a iniciar sesión regrese directo al P5 y no a empezar de cero.
  const handleExit = async () => {
    if (isSaving || isExiting) return
    setIsExiting(true)
    try {
      if (mode === 'full' && selectedTemplate && volumeBand && companyName.trim().length >= 2) {
        await fetch('/api/onboarding/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template_id: selectedTemplate,
            company_name: companyName.trim(),
            plan_slug: planToBuy,
            addon_ids: selectedAddons
          })
        })
      } else if (mode === 'resume' && companyId) {
        await supabase.from('companies').update({ pending_plan_slug: planToBuy }).eq('id', companyId)
      }
    } catch (e) {
      console.warn('[Onboarding] No se pudo guardar antes de salir:', e)
    }
    await supabase.auth.signOut()
    window.location.href = '/login?motivo=plan-requerido'
  }

  // Verificar si necesita onboarding
  useEffect(() => {
    async function checkStatus() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: platformData } = await supabase
        .from('platform_settings')
        .select('logo_url, name')
        .eq('id', 1)
        .single()

      if (platformData?.logo_url) setLogoUrl(platformData.logo_url)

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single()

      if (profile?.company_id) {
        setCompanyId(profile.company_id)

        let company: any = null
        const { data: fullCompany, error: fullErr } = await supabase
          .from('companies')
          .select('name, onboarding_completed, plan_slug, pending_plan_slug, subscription_status, trial_ends_at, stripe_subscription_id')
          .eq('id', profile.company_id)
          .maybeSingle()

        if (fullErr) {
          console.warn('[Onboarding] SELECT con todas las columnas falló:', fullErr.message)
          const { data: minCompany } = await supabase
            .from('companies')
            .select('name')
            .eq('id', profile.company_id)
            .maybeSingle()
          company = minCompany
        } else {
          company = fullCompany
        }

        const { data: ctData } = await supabase
          .from('company_templates')
          .select('id')
          .eq('company_id', profile.company_id)
          .eq('is_primary', true)
          .limit(1)

        const hasPrimaryTemplate = !!(ctData && ctData.length > 0)
        const isCompleted = !!company?.onboarding_completed
        if (company?.name && !company.name.includes('@')) setCompanyName(company.name)

        const params = new URLSearchParams(window.location.search)
        const checkout = params.get('checkout')
        const sessionId = params.get('session_id')

        if (checkout === 'success' && sessionId) {
          // Regreso de Stripe: confirmar antes de soltar al usuario al dashboard.
          setNeedsOnboarding(true)
          setActivating(true)
          setLoading(false)
          confirmCheckout(sessionId)
          return
        }

        if (!isCompleted && !hasPrimaryTemplate) {
          setNeedsOnboarding(true)
        } else if (
          // Terminó el wizard pero nunca inició suscripción en Stripe → P5.
          !company?.stripe_subscription_id &&
          !hasDashboardAccess({ status: company?.subscription_status, trialEndsAt: company?.trial_ends_at })
        ) {
          setNeedsOnboarding(true)
          setMode('resume')
          setStep(5)
          if (company?.pending_plan_slug) setChosenPlan(company.pending_plan_slug as PlanSlug)
          if (checkout === 'canceled') {
            toast('No se completó el registro en Stripe. Puedes intentarlo de nuevo.', { icon: 'ℹ️' })
            window.history.replaceState(null, '', window.location.pathname)
          }
        }
      }
      setLoading(false)
    }
    checkStatus()
  }, [])

  // ─── Finalizar: guardar lo del onboarding y mandar a Stripe Checkout ───
  const handleComplete = async () => {
    const needsAnswers = mode === 'full'
    if (!companyName.trim() || !companyId || (needsAnswers && (!selectedTemplate || !volumeBand || (ENABLE_TEAM_SIZE_STEP && !userBand)))) {
      toast.error('Completa todos los pasos antes de continuar')
      return
    }
    const plan = plans.find(p => p.slug === planToBuy)
    if (!plan?.stripe_price_id) {
      toast.error('Este plan todavía no se puede contratar. Elige otro o contacta a soporte.')
      return
    }

    setIsSaving(true)
    try {
      if (needsAnswers) {
        const res = await fetch('/api/onboarding/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template_id: selectedTemplate,
            company_name: companyName.trim(),
            plan_slug: planToBuy,
            addon_ids: selectedAddons
          })
        })
        const result = await res.json()
        if (!res.ok) {
          const fullMsg = result.detail
            ? `${result.error}\n\nDetalle: ${result.detail}${result.hint ? '\n\n💡 ' + result.hint : ''}`
            : result.error || 'Error en el endpoint de onboarding'
          console.error('[Onboarding] Server error:', result)
          throw new Error(fullMsg)
        }
      } else {
        // Resume: solo actualizar nombre y plan pendiente.
        await supabase
          .from('companies')
          .update({ name: companyName.trim(), pending_plan_slug: planToBuy })
          .eq('id', companyId)
      }

      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: plan.stripe_price_id,
          companyId,
          planSlug: planToBuy,
          billingMode: 'monthly',
          returnTo: 'wizard'
        })
      })
      const result = await res.json().catch(() => ({}))
      if (res.status === 409) {
        // Ya tiene suscripción (p. ej. la activó en otra pestaña): entrar.
        window.location.reload()
        return
      }
      if (!res.ok || !result.url) throw new Error(result.error || 'No se pudo abrir el pago en Stripe')
      window.location.href = result.url
    } catch (error: any) {
      console.error('[Onboarding] Error:', error)
      toast.error(error?.message || 'Error guardando la configuración', { duration: 8000 })
      setIsSaving(false)
    }
  }

  const canAdvance =
    (step === 1 && !!selectedTemplate) ||
    (step === 2 && !!volumeBand) ||
    (step === 3 && !!userBand) ||
    step === 4 ||
    (step === 5 && companyName.trim().length >= 2 && plans.length > 0)

  if (loading) return null
  if (!needsOnboarding) return null
  if (typeof window === 'undefined') return null

  if (activating) {
    return createPortal(
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
        <div className="bg-white rounded-[2rem] shadow-2xl max-w-md w-full p-10 text-center">
          <div className="flex justify-center mb-6"><IAnswerLoader size={40} /></div>
          <h2 className="text-xl font-black text-slate-900 mb-2">Activando tu prueba gratuita…</h2>
          <p className="text-sm text-slate-500 font-medium">Estamos confirmando tu registro con Stripe. Esto tarda unos segundos.</p>
        </div>
      </div>,
      document.body
    )
  }

  const monthlyAddonCost = (availableAddons as AddonRow[])
    .filter(a => selectedAddons.includes(a.id) && a.is_recurring)
    .reduce((sum, a) => sum + a.price_monthly_cents, 0)

  const oneTimeAddonCost = (availableAddons as AddonRow[])
    .filter(a => selectedAddons.includes(a.id) && a.is_one_time)
    .reduce((sum, a) => sum + a.price_one_time_cents, 0)

  const selectedTemplateData = templates.find(t => t.id === selectedTemplate)

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6"
      style={{ zIndex: 99999, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <div className="bg-white rounded-[2rem] shadow-2xl shadow-slate-900/30 max-w-5xl w-full overflow-hidden animate-in zoom-in-95 duration-500 flex flex-col max-h-[95vh]">

        {/* Header con progreso */}
        <div className="px-8 pt-8 pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {/* El logo de la plataforma ya trae el nombre: el texto solo va sin logo. */}
              {logoUrl ? (
                <img src={logoUrl} alt={brandName} className="h-8 object-contain" />
              ) : (
                <>
                  <div className="h-10 w-10 bg-slate-950 rounded-xl flex items-center justify-center">
                    <Sparkles className="text-white" size={20} />
                  </div>
                  <span className="text-lg font-black text-slate-900 tracking-tight">{brandName}</span>
                </>
              )}
            </div>
            {mode === 'full' && (
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
                Paso {stepIndex + 1} de {visibleSteps.length}
              </span>
            )}
          </div>
          {mode === 'full' && (
            <div className="flex gap-2">
              {visibleSteps.map((n, i) => (
                <div
                  key={n}
                  className={`flex-1 h-1.5 rounded-full transition-all duration-500 ${
                    i <= stepIndex ? 'bg-slate-900' : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Contenido del paso */}
        <div className="flex-1 overflow-y-auto px-8 py-8">

          {/* ─── P1: Template (cargado desde la DB) ─── */}
          {step === 1 && (
            <>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2">
                ¿A qué se dedica tu negocio?
              </h2>
              <p className="text-sm text-slate-500 font-medium mb-8">
                Elige una plantilla. Vas a poder cambiarla o instalar otras después.
              </p>
              {loadingTemplates ? (
                <div className="flex justify-center py-10">
                  <IAnswerLoader size={32} />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {templates.map((tpl) => {
                    const Icon = getIcon(tpl.icon) || Sparkles
                    const isSelected = selectedTemplate === tpl.id
                    return (
                      <button
                        key={tpl.id}
                        onClick={() => setSelectedTemplate(tpl.id)}
                        className={`text-left p-5 rounded-2xl border-2 transition-all ${
                          isSelected
                            ? 'border-slate-900 bg-slate-50 ring-4 ring-slate-900/10'
                            : 'border-slate-100 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start gap-3 mb-3">
                          <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${
                            isSelected ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                          }`}>
                            <Icon size={20} />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-black text-slate-900 text-base tracking-tight">{tpl.name}</h3>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                              {tpl.short_name || 'Industria'}
                            </p>
                          </div>
                          {isSelected && <CheckCircle2 size={18} className="text-slate-900 shrink-0" />}
                        </div>
                        <p className="text-xs text-slate-600 font-medium leading-snug">{tpl.description}</p>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* ─── P2: Volumen ─── */}
          {step === 2 && (
            <>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2">
                ¿Cuántas conversaciones recibes al mes?
              </h2>
              <p className="text-sm text-slate-500 font-medium mb-8">
                Cada cliente que te escribe en el mes cuenta como una conversación, sin importar cuántos mensajes intercambien. Es una estimación: te sugerimos un plan con base en esto.
              </p>
              <div className="space-y-3 max-w-xl mx-auto">
                {volumeBands.length === 0 && (
                  <div className="flex justify-center py-10"><IAnswerLoader size={32} /></div>
                )}
                {volumeBands.map(band => {
                  const isSelected = volumeBand === band.id
                  return (
                    <button
                      key={band.id}
                      onClick={() => setVolumeBand(band.id)}
                      className={`w-full text-left p-5 rounded-2xl border-2 transition-all flex items-center gap-4 ${
                        isSelected
                          ? 'border-slate-900 bg-slate-50 ring-4 ring-slate-900/10'
                          : 'border-slate-100 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                      }`}>
                        <MessageSquare size={20} />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-black text-slate-900 text-lg">{band.label} <span className="text-sm font-bold text-slate-500">conversaciones</span></h3>
                        <p className="text-xs text-slate-500 font-medium">{band.range}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Plan sugerido</p>
                        <p className="text-sm font-black text-slate-900">{PLAN_NAMES[band.suggestedPlan]}</p>
                      </div>
                      {isSelected && <CheckCircle2 size={20} className="text-slate-900 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* ─── P3: Usuarios ─── */}
          {step === 3 && (
            <>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2">
                ¿Cuántas personas usarán {brandName}?
              </h2>
              <p className="text-sm text-slate-500 font-medium mb-8">
                Cuenta a todos los que necesitan acceso (incluido tú).
              </p>
              <div className="space-y-3 max-w-xl mx-auto">
                {USER_BANDS.map(band => {
                  const isSelected = userBand === band.id
                  return (
                    <button
                      key={band.id}
                      onClick={() => setUserBand(band.id)}
                      className={`w-full text-left p-5 rounded-2xl border-2 transition-all flex items-center gap-4 ${
                        isSelected
                          ? 'border-slate-900 bg-slate-50 ring-4 ring-slate-900/10'
                          : 'border-slate-100 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                      }`}>
                        <Users size={20} />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-black text-slate-900 text-lg">{band.label}</h3>
                        <p className="text-xs text-slate-500 font-medium">{band.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Plan sugerido</p>
                        <p className="text-sm font-black text-slate-900">{PLAN_NAMES[band.suggestedPlan]}</p>
                      </div>
                      {isSelected && <CheckCircle2 size={20} className="text-slate-900 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* ─── P4: Addons sugeridos (OPCIONAL) ─── */}
          {step === 4 && (
            <>
              <div className="flex items-start gap-3 mb-2">
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  Complementos sugeridos
                </h2>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full uppercase mt-2">
                  Opcional
                </span>
              </div>
              <p className="text-sm text-slate-500 font-medium mb-6">
                Marca los que te interesen: te los recordaremos para que los actives desde Extras cuando quieras. No se cobran ni se activan ahora.
              </p>

              {loadingAddons ? (
                <div className="flex items-center justify-center py-16">
                  <IAnswerLoader size={32} />
                </div>
              ) : availableAddons.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-2xl">
                  <PackageOpen size={32} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 font-medium">No hay complementos sugeridos para tu plantilla.</p>
                  <p className="text-xs text-slate-400 mt-1">Continúa al siguiente paso.</p>
                </div>
              ) : (
                <>
                  {/* Específicos del template */}
                  {(availableAddons as AddonRow[]).some(a => a.available_for_templates?.length > 0) && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <Layers size={14} className="text-slate-700" />
                        <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                          Específicos para {selectedTemplateData?.name || 'tu plantilla'}
                        </h3>
                      </div>
                      <div className="space-y-2">
                        {(availableAddons as AddonRow[])
                          .filter(a => a.available_for_templates?.includes(selectedTemplate || ''))
                          .map(addon => (
                            <AddonRowSelect
                              key={addon.id}
                              addon={addon}
                              isSelected={selectedAddons.includes(addon.id)}
                              onToggle={() => setSelectedAddons(prev =>
                                prev.includes(addon.id) ? prev.filter(x => x !== addon.id) : [...prev, addon.id]
                              )}
                            />
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Universales (solo los featured para no abrumar) */}
                  {(availableAddons as AddonRow[]).some(a => !a.available_for_templates?.length && a.is_featured) && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles size={14} className="text-slate-700" />
                        <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                          Recomendados (universales)
                        </h3>
                      </div>
                      <div className="space-y-2">
                        {(availableAddons as AddonRow[])
                          .filter(a => !a.available_for_templates?.length && a.is_featured)
                          .map(addon => (
                            <AddonRowSelect
                              key={addon.id}
                              addon={addon}
                              isSelected={selectedAddons.includes(addon.id)}
                              onToggle={() => setSelectedAddons(prev =>
                                prev.includes(addon.id) ? prev.filter(x => x !== addon.id) : [...prev, addon.id]
                              )}
                            />
                          ))}
                      </div>
                    </div>
                  )}

                  {selectedAddons.length > 0 && (
                    <div className="mt-6 p-4 bg-slate-900 text-white rounded-2xl">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold uppercase tracking-wider opacity-70">
                          {selectedAddons.length} complemento{selectedAddons.length !== 1 ? 's' : ''} seleccionado{selectedAddons.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-[10px] font-bold uppercase opacity-70 bg-white/10 px-2 py-0.5 rounded">De interés</span>
                      </div>
                      {monthlyAddonCost > 0 && (
                        <p className="text-lg font-black">+ {centsToMxn(monthlyAddonCost)}/mes <span className="text-xs font-medium opacity-60">si los activas después</span></p>
                      )}
                      {oneTimeAddonCost > 0 && (
                        <p className="text-sm font-bold">{centsToMxn(oneTimeAddonCost)} <span className="text-xs font-medium opacity-60">pago único</span></p>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ─── P5: Casi listo → elegir plan → Stripe ─── */}
          {step === 5 && (
            <>
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center h-16 w-16 bg-gradient-to-br from-emerald-400 to-emerald-600 text-white rounded-2xl shadow-lg shadow-emerald-500/30 mb-4">
                  <CheckCircle2 size={32} strokeWidth={2.5} />
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2">
                  Casi listo
                </h2>
                <p className="text-sm text-slate-500 font-medium max-w-lg mx-auto">
                  {mode === 'resume'
                    ? `Para usar ${brandName} necesitas un plan activo. Elige uno e inicia tu prueba gratuita de ${trialDays} días.`
                    : `Elige tu plan e inicia tu prueba gratuita de ${trialDays} días. Te sugerimos uno según tus respuestas.`}
                </p>
              </div>

              <div className="max-w-3xl mx-auto space-y-6">
                {/* Input nombre */}
                <div className="max-w-xl mx-auto">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-widest mb-2">
                    Nombre de tu negocio
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="Mi Negocio S.A. de C.V."
                    className="w-full px-4 py-3.5 bg-white border-2 border-slate-200 rounded-xl outline-none focus:border-slate-900 text-base font-bold transition-colors"
                    style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a', caretColor: '#0f172a' }}
                    autoFocus
                    autoComplete="off"
                  />
                </div>

                {/* Selector de plan */}
                <div>
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-3 text-center">Tu plan</p>
                  {plans.length === 0 ? (
                    <div className="flex justify-center py-8"><IAnswerLoader size={32} /></div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {plans.map(plan => {
                        const isSelected = planToBuy === plan.slug
                        const isSuggested = mode === 'full' && suggestedPlan === plan.slug
                        return (
                          <button
                            key={plan.slug}
                            type="button"
                            onClick={() => setChosenPlan(plan.slug)}
                            className={`relative text-left p-5 rounded-2xl border-2 transition-all ${
                              isSelected
                                ? 'border-slate-900 bg-slate-50 ring-4 ring-slate-900/10'
                                : 'border-slate-100 bg-white hover:border-slate-300'
                            }`}
                          >
                            {isSuggested && (
                              <span className="absolute -top-2.5 left-4 text-[9px] font-black uppercase tracking-widest bg-slate-900 text-white px-2 py-0.5 rounded-full">
                                Sugerido
                              </span>
                            )}
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <h3 className="font-black text-slate-900 text-lg tracking-tight">{plan.name}</h3>
                              {isSelected && <CheckCircle2 size={18} className="text-slate-900 shrink-0" />}
                            </div>
                            <p className="text-xl font-black text-slate-900">
                              {centsToMxn(plan.price_monthly_cents)}<span className="text-xs font-bold text-slate-500"> /mes</span>
                            </p>
                            <ul className="mt-3 space-y-1 text-xs text-slate-600 font-medium">
                              <li>{plan.max_sessions_per_month.toLocaleString('es-MX')} conversaciones/mes</li>
                              <li>{plan.max_team_members} {plan.max_team_members === 1 ? 'usuario' : 'usuarios'}</li>
                              <li>{plan.max_channels} {plan.max_channels === 1 ? 'canal' : 'canales'}</li>
                            </ul>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Resumen */}
                {mode === 'full' && (
                  <div className="max-w-xl mx-auto space-y-2">
                    {(() => {
                      const tpl = selectedTemplateData
                      const TplIcon = tpl?.icon ? getIcon(tpl.icon) : Sparkles
                      return (
                        <div className="flex items-center gap-3 bg-white rounded-xl p-3 border border-slate-100">
                          <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                            <TplIcon size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Plantilla</p>
                            <p className="text-sm font-black text-slate-900 truncate">{tpl?.name || '—'}</p>
                          </div>
                        </div>
                      )
                    })()}
                    {selectedAddons.length > 0 && (
                      <div className="flex items-center gap-3 bg-white rounded-xl p-3 border border-slate-100">
                        <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                          <PackageOpen size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Complementos de interés</p>
                          <p className="text-sm font-bold text-slate-700">
                            {selectedAddons.length} marcado{selectedAddons.length !== 1 ? 's' : ''} · los activas después desde Extras
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-center text-xs text-slate-500 font-medium">
                  {brandName} requiere un plan activo para funcionar.{' '}
                  <button
                    type="button"
                    onClick={handleExit}
                    disabled={isSaving || isExiting}
                    className="inline-flex items-center gap-1 font-bold text-slate-700 underline hover:text-slate-900 disabled:opacity-60 disabled:cursor-not-allowed disabled:no-underline"
                  >
                    {isExiting && <Loader2 size={12} className="animate-spin" />}
                    {isExiting ? 'Saliendo...' : 'Salir por ahora'}
                  </button>
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer con navegación */}
        <div className="px-8 py-5 border-t border-slate-100 flex items-center justify-between bg-slate-50">
          <button
            onClick={goPrev}
            disabled={stepIndex === 0 || isExiting}
            className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Anterior
          </button>

          <div className="flex items-center gap-3">
            {step === 4 && (
              <button
                onClick={goNext}
                className="px-4 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-900"
              >
                Omitir
              </button>
            )}
            <button
              onClick={() => {
                if (step === 5) handleComplete()
                else goNext()
              }}
              disabled={!canAdvance || isSaving || isExiting}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {step === 5 ? 'Abriendo Stripe...' : 'Guardando...'}
                </>
              ) : step === 5 ? (
                <>
                  Continuar con Stripe
                  <ArrowRight size={16} />
                </>
              ) : (
                <>
                  Continuar
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ────────────────────────────────────────────────────────────────────────────
// AddonRowSelect — fila de addon en el P4
// ────────────────────────────────────────────────────────────────────────────
function AddonRowSelect({
  addon, isSelected, onToggle
}: { addon: AddonRow, isSelected: boolean, onToggle: () => void }) {
  const Icon = ADDON_ICONS[addon.icon] || PackageOpen
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
        isSelected
          ? 'border-slate-900 bg-slate-50'
          : 'border-slate-100 bg-white hover:border-slate-300'
      }`}
    >
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
        isSelected ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
      }`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h4 className="font-black text-slate-900 text-sm tracking-tight truncate">{addon.name}</h4>
          {addon.is_featured && (
            <span className="text-[9px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase shrink-0">Top</span>
          )}
        </div>
        <p className="text-xs text-slate-500 font-medium line-clamp-1">{addon.description}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-black text-slate-900 whitespace-nowrap">
          {addon.is_recurring
            ? `${centsToMxn(addon.price_monthly_cents)}/mes`
            : centsToMxn(addon.price_one_time_cents)}
        </p>
      </div>
      <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
        isSelected ? 'border-slate-900 bg-slate-900' : 'border-slate-300'
      }`}>
        {isSelected && <CheckCircle2 size={14} className="text-white" />}
      </div>
    </button>
  )
}