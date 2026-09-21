 

'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '../../../components/WorkspaceContext'
import PlanCard from '../../../components/PlanCard'
import PageHeader from '../../../components/PageHeader'
import toast from 'react-hot-toast'
import { CreditCard, Loader2, Sparkles, ExternalLink, Clock, AlertTriangle } from 'lucide-react'
import UsageMeter from '../../../components/UsageMeter'
import BillingSummary from '../../../components/BillingSummary'
import { useConfirm } from '../../../hooks/useConfirm'
import IAnswerLoader from '../../../components/IAnswerLoader'

type Plan = {
  slug: string
  tier: string | null
  name: string
  description: string | null
  price_monthly_cents: number
  price_yearly_cents: number | null
  max_sessions_per_month: number
  max_team_members: number
  max_channels: number
  max_locations: number
  features: string | null
  is_active: boolean
  display_order: number
  stripe_price_id: string | null
  stripe_price_yearly_id: string | null
}

type CompanyData = {
  id: string
  plan_slug: string
  selected_plan_slug: string | null
  account_status: string
  subscription_status: string
  stripe_customer_id: string | null
  trial_ends_at: string | null
  current_period_ends_at: string | null
}

export default function PlansPage() {
  const { confirm, ConfirmDialog } = useConfirm()
  const queryClient = useQueryClient()
  const { primaryTemplate } = useWorkspace()
  const searchParams = useSearchParams()
  const [billingMode, setBillingMode] = useState<'monthly' | 'yearly'>('monthly')

  // Toast de éxito/cancelado tras volver de Stripe Checkout o del portal.
  // (Antes solo lo hacía /dashboard/billing — fusionado aquí, ver P1 Stripe semana 4.)
  useEffect(() => {
    const success = searchParams.get('success')
    const canceled = searchParams.get('canceled')
    if (success === 'true') toast.success('¡Plan activado! Bienvenido.')
    if (canceled === 'true') toast('Checkout cancelado. Puedes intentarlo de nuevo.', { icon: 'ℹ️' })
  }, [searchParams])

  const { data, isLoading } = useQuery({
    queryKey: ['plans-page'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuario no autenticado')

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id, role, is_admin')
        .eq('id', user.id)
        .single()

      if (!profile?.company_id) throw new Error('Sin compañía')

      const [planRes, compRes] = await Promise.all([
        supabase
          .from('plans')
          .select('*')
          .eq('is_legacy', false)
          .eq('is_active', true)
          .order('display_order'),
        supabase
          .from('companies')
          .select('id, plan_slug, selected_plan_slug, account_status, subscription_status, stripe_customer_id, trial_ends_at, current_period_ends_at')
          .eq('id', profile.company_id)
          .single()
      ])

      return {
        isAdmin: !!profile.is_admin || profile.role === 'admin',
        plans: (planRes.data as Plan[]) || [],
        company: compRes.data as CompanyData | null
      }
    }
  })

  // Cambiar plan vía Stripe Checkout
  const subscribeMutation = useMutation({
    mutationFn: async (plan: Plan) => {
      if (!data?.company?.id) throw new Error('Sin company')

      const priceId = billingMode === 'yearly' ? plan.stripe_price_yearly_id : plan.stripe_price_id
      if (!priceId || priceId.includes('...')) {
        throw new Error('Este plan aún no tiene precio de Stripe configurado. Avísale al admin.')
      }

      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId,
          companyId: data.company.id,
          planSlug: plan.slug,
          billingMode
        })
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Error en checkout')
      }

      const { url } = await response.json()
      return url
    },
    onSuccess: (url) => {
      window.location.href = url
    },
    onError: (e: any) => toast.error(e?.message)
  })

  // Modo admin: forzar plan sin pagar
  const adminForceMutation = useMutation({
    mutationFn: async (planSlug: string) => {
      if (!data?.company?.id) throw new Error('Sin company')
      const { error } = await supabase.rpc('change_company_plan', {
        p_company_id: data.company.id,
        p_new_plan_slug: planSlug
      })
      if (error) throw error

      // Un plan asignado a mano no pasa por Stripe, así que nadie pone
      // subscription_status = 'active'. Sin esto la empresa se queda en
      // 'inactive' y el flujo de n8n la trataba como suscripción muerta
      // (era el origen real del HTTP 402 al responder desde la bandeja).
      const { error: statusError } = await supabase
        .from('companies')
        .update({ subscription_status: 'active', account_status: 'active' })
        .eq('id', data.company.id)
      if (statusError) throw statusError
    },
    onSuccess: () => {
      toast.success('Plan actualizado (modo admin, sin cobro)')
      queryClient.invalidateQueries({ queryKey: ['plans-page'] })
      queryClient.invalidateQueries({ queryKey: ['entitlements'] })
    },
    onError: (e: any) => toast.error(e?.message)
  })

  const portalMutation = useMutation({
    mutationFn: async () => {
      if (!data?.company?.id) throw new Error('Sin company')
      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: data.company.id })
      })
      if (!response.ok) throw new Error('Error abriendo portal')
      const { url } = await response.json()
      return url
    },
    onSuccess: (url) => {
      window.location.href = url
    },
    onError: (e: any) => toast.error(e?.message)
  })

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <IAnswerLoader size={40} />
      </div>
    )
  }

  const plans = data?.plans || []
  // Fallback a selected_plan_slug igual que hacía /dashboard/billing: por si una
  // cuenta trae el plan elegido pero plan_slug todavía no se confirmó.
  const currentPlanSlug = data?.company?.plan_slug || data?.company?.selected_plan_slug || 'start'
  const isActive = data?.company?.account_status === 'active'

  // Descuento anual real, calculado del primer plan con datos válidos (no hardcodeado).
  // Antes decía "-20%" fijo en el código, aunque el descuento real cargado en Stripe/DB
  // es de 17% — ver diagnóstico del P1 de Stripe, semana 4.
  const referencePlan = plans.find(p => p.price_yearly_cents && p.price_monthly_cents)
  const yearlyDiscountBadge = referencePlan
    ? Math.round((1 - (referencePlan.price_yearly_cents! / (referencePlan.price_monthly_cents * 12))) * 100)
    : 17

  // Estado de trial/expiración — fusionado desde /dashboard/billing (ver P1 Stripe
  // semana 4: esa página se retira, /dashboard/plans pasa a ser la única).
  const trialEnd = data?.company?.trial_ends_at ? new Date(data.company.trial_ends_at) : null
  const daysRemaining = trialEnd
    ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0
  const isTrialing = data?.company?.subscription_status === 'trialing'
  const isExpired = ['expired', 'past_due', 'canceled'].includes(data?.company?.subscription_status || '')

  return (
    <div className="animate-in fade-in duration-500 pb-20">
      <PageHeader
        title="Mi Plan"
        description="Sin permanencia. Cambia o cancela cuando quieras. Todas las funciones están incluidas en todos los planes — lo que limita es el volumen y el tamaño del equipo."
      />

      {/* Estado de trial / expiración — fusionado desde /dashboard/billing */}
      {(isTrialing || isExpired) && (
        <div className={`mb-8 rounded-2xl p-5 border flex items-start gap-3 ${
          isExpired ? 'bg-rose-50 border-rose-200' : 'bg-lime-50 border-lime-200'
        }`}>
          {isExpired
            ? <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
            : <Sparkles size={18} className="text-lime-600 shrink-0 mt-0.5" />}
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">
              {isExpired ? 'Suscripción expirada' : 'Período de prueba'}
            </p>
            {isTrialing && (
              <p className="text-sm text-slate-700 font-medium flex items-center gap-1.5">
                <Clock size={14} />
                {daysRemaining > 0
                  ? `Quedan ${daysRemaining} ${daysRemaining === 1 ? 'día' : 'días'} de prueba`
                  : 'El período de prueba terminó'}
                {trialEnd && ` · vence ${trialEnd.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}`}
              </p>
            )}
            {isExpired && (
              <p className="text-sm text-rose-700 font-medium">
                Activa un plan para volver a usar iAnswer.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Sub-header con CTA principal centrado */}
      <div className="text-center mb-12">
        <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-3">
          Elige el plan correcto para tu equipo
        </h2>

        {/* Toggle mensual/anual */}
        <div className="mt-4 inline-flex items-center gap-1 bg-slate-100 p-1 rounded-full">
          <button
            type="button"
            onClick={() => setBillingMode('monthly')}
            className={`px-5 py-2 text-xs font-bold rounded-full transition-all ${
              billingMode === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            Mensual
          </button>
          <button
            type="button"
            onClick={() => setBillingMode('yearly')}
            className={`px-5 py-2 text-xs font-bold rounded-full transition-all flex items-center gap-2 ${
              billingMode === 'yearly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            Anual
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
              -{yearlyDiscountBadge}%
            </span>
          </button>
        </div>
      </div>

      {/* Banner admin */}
      {data?.isAdmin && (
        <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3">
          <Sparkles size={18} className="text-amber-700 shrink-0" />
          <p className="text-xs font-bold text-amber-900">
            Modo admin activo: puedes forzar cambios de plan sin pasar por Stripe.
          </p>
        </div>
      )}

      {/* Grid de planes */}
      <div id="plans-grid" className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
        {plans.map(plan => {
          const isCurrent = plan.slug === currentPlanSlug
          const isRecommended = plan.slug === 'growth'
          return (
            <PlanCard
              key={plan.slug}
              plan={plan}
              isCurrent={isCurrent}
              isRecommended={isRecommended}
              billingMode={billingMode}
              isLoading={subscribeMutation.isPending || adminForceMutation.isPending}
              onSelect={async () => {
                if (data?.isAdmin) {
                  const ok = await confirm(`Forzar cambio a plan "${plan.name}" sin cobro?`, { title: 'Forzar cambio de plan', danger: true, confirmText: 'Forzar' })
                  if (!ok) return
                  adminForceMutation.mutate(plan.slug)
                } else {
                  subscribeMutation.mutate(plan)
                }
              }}
            />
          )
        })}
      </div>

      {/* Uso de conversaciones + Resumen de facturación */}
      {data?.company?.id && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-12">
          <UsageMeter
            companyId={data.company.id}
            accentColor={primaryTemplate?.accent_color || '#6366f1'}
          />
          <BillingSummary
            companyId={data.company.id}
            planName={plans.find(p => p.slug === currentPlanSlug)?.name || currentPlanSlug}
            planPriceCents={
              billingMode === 'yearly'
                ? (plans.find(p => p.slug === currentPlanSlug)?.price_yearly_cents || 0)
                : (plans.find(p => p.slug === currentPlanSlug)?.price_monthly_cents || 0)
            }
            nextPaymentDate={data?.company?.current_period_ends_at || null}
            billingCycle={billingMode}
            accentColor={primaryTemplate?.accent_color || '#6366f1'}
            stripeCustomerId={data.company.stripe_customer_id}
          />
        </div>
      )}

      {/* Footer: gestionar suscripción */}
      {isActive && data?.company?.stripe_customer_id && (
        <div className="mt-12 p-6 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-black text-slate-900">Gestionar tu suscripción</h3>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Cambia tu método de pago, descarga facturas o cancela tu suscripción.
            </p>
          </div>
          <button
            type="button"
            onClick={() => portalMutation.mutate()}
            disabled={portalMutation.isPending}
            className="px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl flex items-center gap-2 text-sm transition-colors"
          >
            {portalMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                Abrir portal
                <ExternalLink size={14} />
              </>
            )}
          </button>
        </div>
      )}
      {ConfirmDialog}
    </div>
  )
}
