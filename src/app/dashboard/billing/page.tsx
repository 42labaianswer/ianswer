 

'use client'

// ============================================================================
// src/app/dashboard/billing/page.tsx
// ----------------------------------------------------------------------------
// Página de gestión de suscripción. Muestra:
//   - Plan actual + status (trialing/active/past_due/expired)
//   - Días restantes de trial
//   - Lista de planes para upgrade/downgrade
//   - Toggle Mensual/Anual
//   - Botón "Confirmar plan" → llama /api/stripe/checkout
//   - Botón "Gestionar suscripción" → Stripe Customer Portal
// ============================================================================

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import PageHeader from '../../../components/PageHeader'
import {
  CreditCard, Check, Loader2, AlertTriangle, Sparkles,
  Clock, ExternalLink, ArrowRight
} from 'lucide-react'
import toast from 'react-hot-toast'
import UsageMeter from '../../../components/UsageMeter'
import BillingSummary from '../../../components/BillingSummary'

interface Plan {
  slug: string
  tier: 'start' | 'growth' | 'scale'
  name: string
  description: string | null
  price_monthly_cents: number
  price_yearly_cents: number | null
  max_sessions_per_month: number
  max_team_members: number
  max_channels: number
  max_locations: number
  stripe_price_monthly_id: string | null
  stripe_price_yearly_id: string | null
  trial_days: number
  is_active: boolean
  display_order: number
}

interface Company {
  id: string
  name: string
  plan_slug: string | null
  selected_plan_slug: string | null
  subscription_status: string | null
  trial_ends_at: string | null
  current_period_ends_at: string | null
  billing_cycle: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

export default function BillingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')
  const [plans, setPlans] = useState<Plan[]>([])
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)

  useEffect(() => {
    // Toast de éxito/cancelado tras volver de Stripe
    const success = searchParams.get('success')
    const canceled = searchParams.get('canceled')
    if (success === 'true') toast.success('¡Plan activado! Bienvenido.')
    if (canceled === 'true') toast('Checkout cancelado. Puedes intentarlo de nuevo.', { icon: 'ℹ️' })
  }, [searchParams])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
      if (!profile?.company_id) {
        toast.error('No se encontró la compañía asociada')
        setLoading(false)
        return
      }

      const [plansRes, companyRes] = await Promise.all([
        supabase.from('plans').select('*').eq('is_active', true).order('display_order'),
        supabase.from('companies').select('*').eq('id', profile.company_id).maybeSingle()
      ])

      setPlans((plansRes.data as Plan[]) || [])
      setCompany(companyRes.data as Company)
      if ((companyRes.data as Company)?.billing_cycle === 'yearly') setBilling('yearly')
      setLoading(false)
    }
    load()
  }, [router])

  const startCheckout = async (plan: Plan) => {
    if (!company) return

    const priceId = billing === 'monthly' ? plan.stripe_price_monthly_id : plan.stripe_price_yearly_id
    if (!priceId) {
      toast.error(`Este plan no tiene precio de Stripe configurado para ciclo ${billing}. Configúralo en admin.`)
      return
    }

    setCheckoutLoading(plan.slug)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId,
          companyId: company.id,
          planSlug: plan.slug,
          billingMode: billing
        })
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        toast.error(data.error || 'No se pudo iniciar checkout')
        setCheckoutLoading(null)
      }
    } catch (e: any) {
      toast.error('Error: ' + e.message)
      setCheckoutLoading(null)
    }
  }

  const openCustomerPortal = async () => {
    if (!company?.stripe_customer_id) {
      toast.error('Aún no tienes suscripción activa')
      return
    }
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: company.id })
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else toast.error('No se pudo abrir el portal')
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    }
  }

  if (loading) {
    return (
      <div className="px-4 md:px-8 py-12 flex items-center justify-center">
        <Loader2 size={32} className="text-slate-400 animate-spin" />
      </div>
    )
  }

  if (!company) return null

  // Días restantes
  const trialEnd = company.trial_ends_at ? new Date(company.trial_ends_at) : null
  const daysRemaining = trialEnd
    ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0
  const isTrialing  = company.subscription_status === 'trialing'
  const isActive    = company.subscription_status === 'active'
  const isExpired   = ['expired', 'past_due', 'canceled'].includes(company.subscription_status || '')
  const currentPlan = company.plan_slug || company.selected_plan_slug

  return (
    <div className="px-4 md:px-8 py-4 md:py-6 space-y-6">

      <PageHeader
        eyebrow="Suscripción"
        title="Mi Plan"
        description="Gestiona tu plan, ciclo de cobro y método de pago"
      />

      {/* Uso de conversaciones + Resumen de facturación */}
      {currentPlan && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <UsageMeter
            companyId={company.id}
            accentColor="#6366f1"
            onUpgrade={() => document.getElementById('plans-section')?.scrollIntoView({ behavior: 'smooth' })}
          />
          <BillingSummary
            companyId={company.id}
            planName={plans.find(p => p.slug === currentPlan)?.name || currentPlan}
            planPriceCents={
              billing === 'yearly'
                ? (plans.find(p => p.slug === currentPlan)?.price_yearly_cents || 0)
                : (plans.find(p => p.slug === currentPlan)?.price_monthly_cents || 0)
            }
            nextPaymentDate={company.current_period_ends_at}
            billingCycle={billing}
            accentColor="#6366f1"
          />
        </div>
      )}

      {/* Status actual */}
      <div className={`rounded-2xl p-6 md:p-8 border ${
        isExpired ? 'bg-rose-50 border-rose-200' :
        isTrialing ? 'bg-lime-50 border-lime-200' :
        'bg-white border-slate-200'
      }`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {isExpired ? <AlertTriangle size={18} className="text-rose-600" /> :
               isTrialing ? <Sparkles size={18} className="text-lime-600" /> :
               <Check size={18} className="text-emerald-600" />}
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                {isExpired ? 'Suscripción expirada' : isTrialing ? 'Período de prueba' : 'Plan activo'}
              </p>
            </div>
            <h2 className="text-3xl font-black text-slate-950 tracking-tight mb-2">
              {currentPlan
                ? plans.find(p => p.slug === currentPlan)?.name || currentPlan
                : 'Sin plan'}
            </h2>
            {isTrialing && trialEnd && (
              <p className="text-sm text-slate-700 font-medium flex items-center gap-1.5">
                <Clock size={14} />
                {daysRemaining > 0
                  ? `Quedan ${daysRemaining} ${daysRemaining === 1 ? 'día' : 'días'} de prueba`
                  : 'El período de prueba terminó'}
                {trialEnd && ` · vence ${trialEnd.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}`}
              </p>
            )}
            {isActive && company.current_period_ends_at && (
              <p className="text-sm text-slate-700 font-medium flex items-center gap-1.5">
                <Clock size={14} />
                Próximo cobro: {new Date(company.current_period_ends_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
            {isExpired && (
              <p className="text-sm text-rose-700 font-medium">
                Activa un plan para volver a usar iAnswer.
              </p>
            )}
          </div>
          {company.stripe_customer_id && (
            <button
              onClick={openCustomerPortal}
              className="shrink-0 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
            >
              <CreditCard size={12} /> Gestionar
              <ExternalLink size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Selector ciclo */}
      <div className="flex items-center justify-center">
        <div className="inline-flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-full shadow-sm">
          <button
            onClick={() => setBilling('monthly')}
            className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${billing === 'monthly' ? 'bg-slate-950 text-white' : 'text-slate-500'}`}
          >
            Mensual
          </button>
          <button
            onClick={() => setBilling('yearly')}
            className={`px-5 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${billing === 'yearly' ? 'bg-slate-950 text-white' : 'text-slate-500'}`}
          >
            Anual
            <span className="text-[10px] px-2 py-0.5 bg-lime-400 text-slate-950 rounded-full font-black uppercase tracking-wider">−20%</span>
          </button>
        </div>
      </div>

      {/* Grid de planes */}
      <div id="plans-section" className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {plans.map(plan => {
          const isCurrent = currentPlan === plan.slug
          const priceCents = billing === 'monthly' ? plan.price_monthly_cents : plan.price_yearly_cents || plan.price_monthly_cents * 12
          const monthlyDisplay = billing === 'yearly' && plan.price_yearly_cents
            ? Math.round(plan.price_yearly_cents / 12 / 100)
            : Math.round(plan.price_monthly_cents / 100)
          const priceId = billing === 'monthly' ? plan.stripe_price_monthly_id : plan.stripe_price_yearly_id
          const hasPrice = !!priceId

          return (
            <div
              key={plan.slug}
              className={`rounded-3xl p-6 md:p-7 border transition-all flex flex-col h-full ${
                isCurrent
                  ? 'bg-slate-950 text-white border-slate-950 shadow-xl'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'
              }`}
            >
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className={`text-xl font-black tracking-tight ${isCurrent ? 'text-white' : 'text-slate-950'}`}>
                    {plan.name}
                  </h3>
                  {isCurrent && (
                    <span className="px-2.5 py-1 bg-lime-400 text-slate-950 text-[10px] font-black uppercase tracking-wider rounded-full">
                      Tu plan
                    </span>
                  )}
                </div>
                <p className={`text-sm font-medium ${isCurrent ? 'text-slate-300' : 'text-slate-500'}`}>
                  {plan.description}
                </p>
              </div>

              <div className="mb-5 pb-5 border-b border-dashed border-slate-200/40">
                <div className="flex items-baseline gap-1">
                  <span className={`text-sm font-bold ${isCurrent ? 'text-slate-400' : 'text-slate-500'}`}>$</span>
                  <span className={`text-4xl font-black tracking-tight ${isCurrent ? 'text-white' : 'text-slate-950'}`}>
                    {monthlyDisplay.toLocaleString('es-MX')}
                  </span>
                  <span className={`text-sm font-bold ${isCurrent ? 'text-slate-400' : 'text-slate-500'}`}>/mes</span>
                </div>
                <p className={`text-xs font-medium mt-1.5 ${isCurrent ? 'text-slate-400' : 'text-slate-500'}`}>
                  {billing === 'yearly' && plan.price_yearly_cents
                    ? `${Math.round(plan.price_yearly_cents / 100).toLocaleString('es-MX')} MXN/año`
                    : 'MXN/mes'}
                </p>
              </div>

              <ul className="flex-1 space-y-2 mb-6 text-sm">
                <li className="flex items-center gap-2"><Check size={14} className={isCurrent ? 'text-lime-400' : 'text-emerald-600'} strokeWidth={3} />{plan.max_sessions_per_month.toLocaleString('es-MX')} conversaciones/mes</li>
                <li className="flex items-center gap-2"><Check size={14} className={isCurrent ? 'text-lime-400' : 'text-emerald-600'} strokeWidth={3} />{plan.max_team_members} {plan.max_team_members === 1 ? 'usuario' : 'miembros del equipo'}</li>
                {plan.max_channels && (
                  <li className="flex items-center gap-2"><Check size={14} className={isCurrent ? 'text-lime-400' : 'text-emerald-600'} strokeWidth={3} />{plan.max_channels} {plan.max_channels === 1 ? 'canal' : 'canales'}</li>
                )}
                {plan.max_locations > 1 && (
                  <li className="flex items-center gap-2"><Check size={14} className={isCurrent ? 'text-lime-400' : 'text-emerald-600'} strokeWidth={3} />{plan.max_locations} ubicaciones</li>
                )}
              </ul>

              <button
                onClick={() => startCheckout(plan)}
                disabled={!hasPrice || checkoutLoading === plan.slug || isCurrent}
                className={`w-full py-3 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 ${
                  isCurrent
                    ? 'bg-white/10 text-white/50 cursor-not-allowed'
                    : !hasPrice
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-slate-950 text-white hover:bg-slate-800'
                }`}
              >
                {checkoutLoading === plan.slug ? <Loader2 size={14} className="animate-spin" /> :
                 isCurrent ? 'Plan actual' :
                 !hasPrice ? 'Sin price ID' :
                 <>Cambiar a {plan.name} <ArrowRight size={14} /></>}
              </button>
              {!hasPrice && (
                <p className="text-[10px] text-amber-700 text-center mt-1.5 font-medium">
                  Configura stripe_price_id en admin
                </p>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-center text-xs text-slate-500 font-medium">
        Los precios incluyen {plans[0]?.trial_days || 14} días de prueba en el primer plan.
        Sin permanencia.
      </p>
    </div>
  )
}
