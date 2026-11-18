 

'use client'

// ============================================================================
// src/app/(public)/precios/page.tsx — Pricing
// ============================================================================

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import PricingCard from '../../../components/public/PricingCard'
import PricingCompareTable from '../../../components/public/PricingCompareTable'
import FAQAccordion from '../../../components/public/FAQAccordion'
import CTABanner from '../../../components/public/CTABanner'
import Reveal from '../../../lib/scrollReveal'
import { MessageCircle, BellRing, PackagePlus, ArrowDown } from 'lucide-react'
import { yearlyDiscountPct, type ComparablePlan } from '../../../lib/planCompare'
import IAnswerLoader from '../../../components/IAnswerLoader'

interface Plan {
  slug: string
  tier: 'lite' | 'start' | 'growth' | 'scale'
  name: string
  description: string | null
  price_monthly_cents: number
  price_yearly_cents: number | null
  max_sessions_per_month: number
  max_ai_replies_per_month?: number | null
  max_reminders_per_month?: number | null
  max_team_members: number
  max_internal_users?: number | null
  max_channels: number
  max_locations: number
  max_agendas?: number | null
  max_campaign_messages_per_month?: number | null
  features_jsonb?: ComparablePlan['features_jsonb']
  features: string | null
  feature_flags: Record<string, any> | null
  is_active: boolean
  display_order: number
}

interface FAQ { question: string; answer: string }

export default function PreciosPage() {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')
  const [plans, setPlans] = useState<Plan[]>([])
  const [faqs, setFaqs] = useState<FAQ[]>([])
  const [settings, setSettings] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const [plansRes, faqsRes, settingsRes] = await Promise.all([
        supabase.from('plans').select('*').eq('is_active', true).order('display_order'),
        supabase.from('site_faqs').select('question, answer').eq('visible', true).in('category', ['pricing', 'general']).order('display_order'),
        supabase.from('site_settings').select('key, value')
      ])
      if (plansRes.error) setError(plansRes.error.message)
      setPlans((plansRes.data as Plan[]) || [])
      setFaqs((faqsRes.data as FAQ[]) || [])
      const settingsMap = (settingsRes.data || []).reduce((acc: any, r: any) => {
        acc[r.key] = r.value
        return acc
      }, {})
      setSettings(settingsMap)
      setLoading(false)
    }
    load()
  }, [])

  const recommendedTier = settings['pricing_recommended_slug'] || 'growth'
  const currency = settings['pricing_currency'] || 'MXN'
  const yearlyPct = Math.max(0, ...plans.map(p => yearlyDiscountPct(p)))

  // Mismo texto que PlanCard en /dashboard/plans: plans.features, una línea por feature
  const buildFeatures = (plan: Plan): string[] =>
    (plan.features || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)

  return (
    <div className="bg-[#FAFAF7] text-slate-950">

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#A3E63522,_transparent_60%)] pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 md:px-8 pt-12 md:pt-24 pb-12 md:pb-16 text-center">
          <Reveal>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-slate-950 tracking-[-0.02em] leading-[0.95] mb-6">
              {settings['pricing_title'] || 'Planes que crecen contigo'}
            </h1>
          </Reveal>
          <Reveal delay={100}>
            <p className="text-lg md:text-2xl text-slate-600 font-normal leading-relaxed max-w-3xl mx-auto mb-10">
              {settings['pricing_subtitle']}
            </p>
          </Reveal>

          {/* Toggle Mensual/Anual */}
          <Reveal delay={200}>
            <div className="inline-flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-full shadow-sm">
              <button
                onClick={() => setBilling('monthly')}
                className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all ${
                  billing === 'monthly' ? 'bg-slate-950 text-white' : 'text-slate-500'
                }`}
              >
                Mensual
              </button>
              <button
                onClick={() => setBilling('yearly')}
                className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${
                  billing === 'yearly' ? 'bg-slate-950 text-white' : 'text-slate-500'
                }`}
              >
                Anual
                {yearlyPct > 0 && (
                  <span className="text-[10px] px-2 py-0.5 bg-lime-400 text-slate-950 rounded-full font-black uppercase tracking-wider">
                    −{yearlyPct}%
                  </span>
                )}
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* PLANS GRID */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 mb-16 md:mb-24">
        {loading ? (
          <div className="flex justify-center py-20"><IAnswerLoader size={40} label="Cargando planes..." /></div>
        ) : plans.length === 0 ? (
          <div className="text-center py-20 bg-white border border-slate-200 rounded-3xl mx-auto max-w-2xl">
            <p className="text-base font-bold text-slate-700 mb-2">No hay planes configurados</p>
            <p className="text-sm text-slate-500 font-medium mb-4">Configura tus planes desde <strong className="text-slate-700">/dashboard/admin → Planes</strong>.</p>
            {error && <p className="text-xs text-red-600 font-mono bg-red-50 px-3 py-2 rounded-lg inline-block">Debug: {error}</p>}
          </div>
        ) : (
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 mx-auto ${
            plans.length >= 4 ? 'xl:grid-cols-4 xl:gap-5 max-w-7xl' : 'lg:grid-cols-3 lg:gap-8 max-w-6xl'
          }`}>
            {plans.map((plan, idx) => {
              const priceMonthly = Math.round((plan.price_monthly_cents || 0) / 100)
              const priceYearly  = plan.price_yearly_cents ? Math.round(plan.price_yearly_cents / 100) : undefined
              return (
                <Reveal key={plan.slug} delay={idx * 100}>
                  <PricingCard
                    name={plan.name}
                    description={plan.description || ''}
                    priceMonthly={priceMonthly}
                    priceYearly={priceYearly}
                    currency={currency}
                    billing={billing}
                    features={buildFeatures(plan)}
                    cta={
                      plan.tier === 'scale'
                        ? { text: 'Hablar con ventas', href: '/contacto' }
                        : { text: 'Probar gratis', href: `/login?signup=1&plan=${plan.slug}` }
                    }
                    highlighted={plan.tier === recommendedTier || plan.slug === recommendedTier}
                    badgeText="Más popular"
                  />
                </Reveal>
              )
            })}
          </div>
        )}

        <Reveal>
          <p className="text-center text-xs text-slate-500 font-medium mt-10">
            Todos los precios en {currency} sin IVA. Sin permanencia. Cambia o cancela cuando quieras.
          </p>
          {plans.length > 0 && (
            <p className="text-center mt-4">
              <a href="#comparar" className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-950 hover:text-lime-600 transition-colors">
                Ver comparación completa <ArrowDown size={14} />
              </a>
            </p>
          )}
        </Reveal>
      </section>

      {/* COMPARAR PLANES */}
      {plans.length > 0 && (
        <section id="comparar" className="scroll-mt-20 max-w-7xl mx-auto px-4 md:px-8 mb-16 md:mb-24">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
              <p className="text-xs font-bold text-lime-600 uppercase tracking-[0.2em] mb-4">
                Comparativa
              </p>
              <h2 className="text-4xl md:text-6xl font-black text-slate-950 tracking-[-0.02em] leading-[1.05]">
                Compara los planes
              </h2>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <PricingCompareTable plans={plans} recommendedSlug={recommendedTier} billing={billing} />
          </Reveal>
        </section>
      )}

      {/* COMPARATIVA */}
      <section className="bg-white border-y border-slate-200 py-20 md:py-32">
        <div className="max-w-5xl mx-auto px-4 md:px-8">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <p className="text-xs font-bold text-lime-600 uppercase tracking-[0.2em] mb-4">
                Lo que necesitas saber
              </p>
              <h2 className="text-4xl md:text-6xl font-black text-slate-950 tracking-[-0.02em] leading-[1.05]">
                Cuentan mensajes,<br/>no conversaciones.
              </h2>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
            {[
              { icon: MessageCircle, title: 'Respuestas de IA', desc: 'Cada mensaje que envía la IA cuenta como una respuesta. Lo que te escriben tus clientes y lo que contesta tu equipo desde el CRM no cuenta.' },
              { icon: BellRing,      title: 'Recordatorios',    desc: 'Cada recordatorio de cita entregado cuenta aparte, con botones para confirmar o reagendar. Ves tu consumo con una barrita en el panel.' },
              { icon: PackagePlus,   title: 'Add-ons',          desc: 'En todos los planes, incluido Lite: +1,000 respuestas, +1,000 recordatorios y paquetes de mensajes de marketing desde 500.' }
            ].map((item, idx) => (
              <Reveal key={idx} delay={idx * 80}>
                <div className="bg-[#FAFAF7] border border-slate-200 rounded-3xl p-7 h-full">
                  <div className="h-11 w-11 mb-4 rounded-2xl bg-white border border-slate-200 flex items-center justify-center">
                    <item.icon size={20} className="text-lime-600" />
                  </div>
                  <h3 className="font-bold text-slate-950 text-lg tracking-tight mb-2">{item.title}</h3>
                  <p className="text-sm text-slate-600 font-normal leading-relaxed">{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQs */}
      {faqs.length > 0 && (
        <section className="max-w-3xl mx-auto px-4 md:px-8 py-20 md:py-32">
          <Reveal>
            <h2 className="text-3xl md:text-5xl font-black text-slate-950 tracking-[-0.02em] text-center mb-12">
              Preguntas frecuentes
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <FAQAccordion items={faqs} />
          </Reveal>
        </section>
      )}

      {/* CTA */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 pb-8">
        <Reveal>
          <CTABanner
            title="¿Todavía con dudas?"
            subtitle="Hablamos contigo, te mostramos el producto y aclaramos lo que necesites. Sin presión de venta."
            primaryCta={{ text: 'Probar gratis', href: '/login?signup=1' }}
            secondaryCta={{ text: 'Hablar con ventas', href: '/contacto' }}
          />
        </Reveal>
      </div>
    </div>
  )
}
