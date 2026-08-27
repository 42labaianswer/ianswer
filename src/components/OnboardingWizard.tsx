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

// ============================================================================
// OnboardingWizard v3.1 — Carga dinámica de plantillas desde la DB
// ----------------------------------------------------------------------------
// P1: ¿A qué te dedicas?              → template (cargado de la DB)
// P2: ¿Cuántos mensajes recibes al mes? → sugiere plan
// P3: ¿Cuántos usuarios usarán?         → ajusta plan
// P4: Addons sugeridos (OPCIONAL)       → addons del template + universales
// P5: Crear cuenta                      → nombre + resumen → /api/onboarding/complete
//
// Endpoint: POST /api/onboarding/complete con
//   { template_id, company_name, plan_slug, addon_ids[] }
// ============================================================================

const VOLUME_BANDS = [
  { id: 'small',  label: 'Menos de 1,000',       range: 'Pocos mensajes',    suggestedPlan: 'start' as const },
  { id: 'medium', label: 'Entre 1,000 y 5,000',  range: 'Volumen medio',     suggestedPlan: 'growth' as const },
  { id: 'large',  label: 'Más de 5,000',         range: 'Alto volumen',      suggestedPlan: 'scale' as const }
]

const USER_BANDS = [
  { id: '1',      label: '1 usuario',          description: 'Solo yo',                        suggestedPlan: 'start' as const },
  { id: '2_5',    label: '2 a 5 usuarios',     description: 'Equipo pequeño',                  suggestedPlan: 'growth' as const },
  { id: '6_plus', label: '6 o más usuarios',   description: 'Equipo grande / multi-sucursal',  suggestedPlan: 'scale' as const }
]

const PLAN_NAMES = { start: 'Start', growth: 'Growth', scale: 'Scale' }
type PlanSlug = 'start' | 'growth' | 'scale'

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
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [volumeBand, setVolumeBand] = useState<typeof VOLUME_BANDS[number]['id'] | null>(null)
  const [userBand, setUserBand] = useState<typeof USER_BANDS[number]['id'] | null>(null)
  const [selectedAddons, setSelectedAddons] = useState<string[]>([])
  const [companyName, setCompanyName] = useState('')
  const [isSaving, setIsSaving] = useState(false)

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

  const suggestedPlan: PlanSlug = (() => {
    if (!volumeBand && !userBand) return 'start'
    const vp = VOLUME_BANDS.find(b => b.id === volumeBand)?.suggestedPlan || 'start'
    const up = USER_BANDS.find(b => b.id === userBand)?.suggestedPlan || 'start'
    return getMaxPlan(vp, up)
  })()

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
          .select('name, onboarding_completed, plan_slug')
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

        if (!isCompleted && !hasPrimaryTemplate) {
          setNeedsOnboarding(true)
          if (company?.name && !company.name.includes('@')) {
            setCompanyName(company.name)
          }
        }
      }
      setLoading(false)
    }
    checkStatus()
  }, [])

  // ─── Finalizar onboarding ───
  const handleComplete = async () => {
    if (!selectedTemplate || !volumeBand || !userBand || !companyName.trim() || !companyId) {
      toast.error('Completa todos los pasos antes de finalizar')
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: selectedTemplate,
          company_name: companyName.trim(),
          plan_slug: suggestedPlan,
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

      toast.success('¡Listo! Tu cuenta está configurada')
      setTimeout(() => window.location.reload(), 600)
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
    (step === 5 && companyName.trim().length >= 2)

  if (loading) return null
  if (!needsOnboarding) return null
  if (typeof window === 'undefined') return null

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
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-8 object-contain" />
              ) : (
                <div className="h-10 w-10 bg-slate-950 rounded-xl flex items-center justify-center">
                  <Sparkles className="text-white" size={20} />
                </div>
              )}
              <span className="text-lg font-black text-slate-900 tracking-tight">{brandName}</span>
            </div>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
              Paso {step} de 5
            </span>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <div
                key={n}
                className={`flex-1 h-1.5 rounded-full transition-all duration-500 ${
                  n <= step ? 'bg-slate-900' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
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
                  <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
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
                ¿Cuántos mensajes recibes al mes?
              </h2>
              <p className="text-sm text-slate-500 font-medium mb-8">
                Estimación aproximada (entre todos los canales). Te sugerimos un plan basado en esto.
              </p>
              <div className="space-y-3 max-w-xl mx-auto">
                {VOLUME_BANDS.map(band => {
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
                        <h3 className="font-black text-slate-900 text-lg">{band.label}</h3>
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
                Te recomendamos estos addons según tu plantilla. Puedes activarlos ahora con 14 días gratis o más tarde desde el dashboard.
              </p>

              {loadingAddons ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
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
                        <span className="text-[10px] font-bold uppercase opacity-70 bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded">14 días gratis</span>
                      </div>
                      {monthlyAddonCost > 0 && (
                        <p className="text-lg font-black">+ {centsToMxn(monthlyAddonCost)}/mes <span className="text-xs font-medium opacity-60">después del trial</span></p>
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

          {/* ─── P5: Resumen + crear cuenta ─── */}
          {step === 5 && (
            <>
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center h-16 w-16 bg-gradient-to-br from-emerald-400 to-emerald-600 text-white rounded-2xl shadow-lg shadow-emerald-500/30 mb-4">
                  <CheckCircle2 size={32} strokeWidth={2.5} />
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2">
                  Casi listo
                </h2>
                <p className="text-sm text-slate-500 font-medium">
                  Confirma el nombre de tu negocio para terminar la configuración.
                </p>
              </div>

              <div className="max-w-xl mx-auto space-y-6">
                {/* Input nombre */}
                <div>
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

                {/* Resumen rediseñado con cards */}
                <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl p-6 border border-slate-200">
                  <div className="flex items-center gap-2 mb-5">
                    <Sparkles size={14} className="text-slate-500" />
                    <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">
                      Tu configuración
                    </h3>
                  </div>

                  <div className="space-y-3">
                    {/* Plantilla */}
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

                    {/* Plan */}
                    <div className="flex items-center gap-3 bg-white rounded-xl p-3 border border-slate-100">
                      <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                        <TrendingUp size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Plan</p>
                        <p className="text-sm font-black text-slate-900">{PLAN_NAMES[suggestedPlan]}</p>
                      </div>
                    </div>

                    {/* Addons */}
                    {selectedAddons.length > 0 && (
                      <div className="flex items-center gap-3 bg-white rounded-xl p-3 border border-emerald-200">
                        <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                          <PackageOpen size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Complementos</p>
                          <p className="text-sm font-black text-slate-900">
                            {selectedAddons.length} activo{selectedAddons.length !== 1 ? 's' : ''}
                            <span className="text-[10px] font-bold text-emerald-700 ml-2 bg-emerald-100 px-1.5 py-0.5 rounded">14 días gratis</span>
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Nota final */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-2">
                  <Sparkles size={14} className="text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-900 font-medium leading-relaxed">
                    Podrás cambiar tu plan, instalar más plantillas o activar/desactivar complementos en cualquier momento desde el dashboard.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer con navegación */}
        <div className="px-8 py-5 border-t border-slate-100 flex items-center justify-between bg-slate-50">
          <button
            onClick={() => setStep((step - 1) as 1 | 2 | 3 | 4 | 5)}
            disabled={step === 1}
            className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Anterior
          </button>

          <div className="flex items-center gap-3">
            {step === 4 && (
              <button
                onClick={() => setStep(5)}
                className="px-4 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-900"
              >
                Omitir
              </button>
            )}
            <button
              onClick={() => {
                if (step === 5) handleComplete()
                else setStep((step + 1) as 1 | 2 | 3 | 4 | 5)
              }}
              disabled={!canAdvance || isSaving}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Guardando...
                </>
              ) : step === 5 ? (
                <>
                  <CheckCircle2 size={16} />
                  Finalizar
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
        <p className="text-[10px] font-bold text-emerald-700">14 días gratis</p>
      </div>
      <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
        isSelected ? 'border-slate-900 bg-slate-900' : 'border-slate-300'
      }`}>
        {isSelected && <CheckCircle2 size={14} className="text-white" />}
      </div>
    </button>
  )
}