 

// ============================================================================
// src/app/(public)/integraciones/page.tsx — Integrations (rediseño v2)
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { Sparkles } from 'lucide-react'
import Reveal from '../../../lib/scrollReveal'
import CTABanner from '../../../components/public/CTABanner'

export const revalidate = 60

const CATEGORY_LABELS: Record<string, string> = {
  channels:     'Canales',
  automations:  'Automatizaciones',
  productivity: 'Productividad',
  payments:     'Pagos'
}

export default async function IntegracionesPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: integrations } = await supabase
    .from('site_integrations')
    .select('*')
    .eq('visible', true)
    .order('display_order')

  // Agrupar por categoría
  const grouped = (integrations || []).reduce((acc: Record<string, any[]>, i: any) => {
    if (!acc[i.category]) acc[i.category] = []
    acc[i.category].push(i)
    return acc
  }, {})

  return (
    <div className="bg-[#FAFAF7] text-slate-950">

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#A3E63522,_transparent_60%)] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 md:px-8 pt-12 md:pt-24 pb-12 md:pb-20">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-200 rounded-full mb-8">
              <Sparkles size={12} className="text-lime-500" />
              <span className="text-[11px] font-bold text-slate-700 tracking-wide uppercase">Integraciones</span>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-slate-950 tracking-[-0.02em] leading-[0.95] mb-8 max-w-4xl">
              Conectado<br/>con tu stack.
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="text-lg md:text-2xl text-slate-600 font-normal leading-relaxed max-w-2xl">
              WhatsApp, Instagram, Google Calendar, Stripe, Zapier, n8n. iAnswer vive donde tu negocio ya está.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="pb-16 md:pb-24">
        <div className="max-w-7xl mx-auto px-4 md:px-8 space-y-16 md:space-y-20">
          {Object.entries(grouped).map(([category, items]: [string, any[]], idxCat) => (
            <Reveal key={category} delay={idxCat * 60}>
              <div>
                <p className="text-xs font-bold text-lime-600 uppercase tracking-[0.2em] mb-6">
                  {CATEGORY_LABELS[category] || category}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
                  {items.map((int: any, idx: number) => (
                    <Reveal key={int.id} delay={idx * 40}>
                      <div className="bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md rounded-3xl p-6 transition-all hover:-translate-y-1 h-full">
                        <div
                          className="h-11 w-11 rounded-xl flex items-center justify-center mb-4 text-white font-black text-sm"
                          style={{ backgroundColor: int.brand_color || '#0F172A' }}
                        >
                          {int.name.charAt(0)}
                        </div>
                        <h3 className="text-base font-bold text-slate-950 tracking-tight mb-1">{int.name}</h3>
                        <p className="text-xs text-slate-600 font-normal leading-relaxed">{int.description}</p>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 md:px-8 pb-8">
        <Reveal>
          <CTABanner
            title="¿Falta una integración?"
            subtitle="Pide la que necesites. Si tiene sentido para más negocios, la priorizamos."
            primaryCta={{ text: 'Sugerir integración', href: '/contacto' }}
            secondaryCta={{ text: 'Probar gratis', href: '/login?signup=1' }}
          />
        </Reveal>
      </div>
    </div>
  )
}
