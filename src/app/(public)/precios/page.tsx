 

'use client'

// ============================================================================
// src/app/(public)/precios/page.tsx — Pricing v2 (rediseñada)
// ============================================================================

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import PricingCard from '../../../components/public/PricingCard'
import FAQAccordion from '../../../components/public/FAQAccordion'
import CTABanner from '../../../components/public/CTABanner'
import Reveal from '../../../lib/scrollReveal'

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

  const buildFeatures = (plan: Plan): string[] => {
    const features: string[] = []
    if (plan.max_sessions_per_month) features.push(`${plan.max_sessions_per_month.toLocaleString('es-MX')} conversaciones/mes`)
    if (plan.max_team_members > 1) features.push(`Hasta ${plan.max_team_members} miembros del equipo`)
    else if (plan.max_team_members === 1) features.push('1 usuario')
    if (plan.max_channels) features.push(plan.max_channels === 1 ? '1 canal de WhatsApp' : `${plan.max_channels} canales`)
    if (plan.max_locations > 1) features.push(`${plan.max_locations} ubicaciones`)
    features.push('WhatsApp Business API')
    features.push('CRM con etapas y tareas')
    features.push('Calendario integrado')
    features.push('Reportes en tiempo real')
    if (plan.tier === 'growth' || plan.tier === 'scale') {
      features.push('Multi-canal (Instagram, web)')
      features.push('IA premium')
    }
    if (plan.tier === 'scale') {
      features.push('Soporte dedicado')
      features.push('Account manager')
    }
    return features
  }

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
                <span className="text-[10px] px-2 py-0.5 bg-lime-400 text-slate-950 rounded-full font-black uppercase tracking-wider">
                  −20%
                </span>
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* PLANS GRID */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 mb-16 md:mb-24">
        {loading ? (
          <div className="text-center py-20 text-slate-500 font-bold">Cargando planes...</div>
        ) : plans.length === 0 ? (
          <div className="text-center py-20 bg-white border border-slate-200 rounded-3xl mx-auto max-w-2xl">
            <p className="text-base font-bold text-slate-700 mb-2">No hay planes configurados</p>
            <p className="text-sm text-slate-500 font-medium mb-4">Configura tus planes desde <strong className="text-slate-700">/dashboard/admin → Planes</strong>.</p>
            {error && <p className="text-xs text-red-600 font-mono bg-red-50 px-3 py-2 rounded-lg inline-block">Debug: {error}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto">
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
                        : { text: 'Probar 14 días gratis', href: `/login?signup=1&plan=${plan.slug}` }
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
        </Reveal>
      </section>

      {/* COMPARATIVA */}
      <section className="bg-white border-y border-slate-200 py-20 md:py-32">
        <div className="max-w-5xl mx-auto px-4 md:px-8">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <p className="text-xs font-bold text-lime-600 uppercase tracking-[0.2em] mb-4">
                Lo que necesitas saber
              </p>
              <h2 className="text-4xl md:text-6xl font-black text-slate-950 tracking-[-0.02em] leading-[1.05]">
                Mismas funciones,<br/>distinto volumen.
              </h2>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
            {[
              { icon: '💬', title: 'Conversaciones', desc: 'Cada cliente único que te escribe en el mes cuenta como una conversación, sin importar cuántos mensajes intercambien.' },
              { icon: '👥', title: 'Equipo',         desc: 'El tamaño de tu equipo limita cuántas personas pueden acceder al panel. La IA no cuenta como miembro.' },
              { icon: '🚀', title: 'Funciones',      desc: 'Todos los planes traen CRM, calendario, reportes y multi-canal. No bloqueamos features para forzarte a subir.' }
            ].map((item, idx) => (
              <Reveal key={idx} delay={idx * 80}>
                <div className="bg-[#FAFAF7] border border-slate-200 rounded-3xl p-7 h-full">
                  <div className="text-3xl mb-3">{item.icon}</div>
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
