 

// ============================================================================
// src/app/(public)/funciones/page.tsx — Features (rediseño v2)
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { ArrowRight, Sparkles, Check } from 'lucide-react'
import { getIcon } from '../../../lib/iconMap'
import Reveal from '../../../lib/scrollReveal'
import CTABanner from '../../../components/public/CTABanner'
import { loadPlatformBranding } from '../../../lib/siteSettings'  
  const branding = await loadPlatformBranding()
  const brandName = branding.name || 'Plataforma'  // fallback genérico
export const revalidate = 60

export default async function FuncionesPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: features } = await supabase
    .from('site_features')
    .select('*')
    .eq('visible', true)
    .order('display_order')

  return (
    <div className="bg-[#FAFAF7] text-slate-950">

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#A3E63522,_transparent_60%)] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 md:px-8 pt-12 md:pt-24 pb-20 md:pb-24">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-200 rounded-full mb-8">
              <Sparkles size={12} className="text-lime-500" />
              <span className="text-[11px] font-bold text-slate-700 tracking-wide uppercase">Funciones</span>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-slate-950 tracking-[-0.02em] leading-[0.95] mb-8 max-w-5xl">
              Todo lo que {brandName}<br/>hace por ti.
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="text-lg md:text-2xl text-slate-600 font-normal leading-relaxed max-w-2xl">
              WhatsApp con IA real, calendario, CRM, reportes y multi-canal. Sin features bloqueadas por plan.
            </p>
          </Reveal>
        </div>
      </section>

      {(features || []).map((f: any, idx: number) => {
        const Icon = getIcon(f.icon_name)
        const reverse = idx % 2 === 1
        return (
          <section key={f.id} id={f.slug} className="py-16 md:py-24 border-t border-slate-200/60 bg-white even:bg-[#FAFAF7]">
            <div className="max-w-7xl mx-auto px-4 md:px-8">
              <div className={`grid lg:grid-cols-2 gap-10 lg:gap-16 items-center`}>

                <div className={reverse ? 'lg:order-2' : ''}>
                  <Reveal direction={reverse ? 'right' : 'left'}>
                    <div className="h-12 w-12 bg-lime-100 text-slate-950 rounded-xl flex items-center justify-center mb-5">
                      <Icon size={22} strokeWidth={2.2} />
                    </div>
                    <p className="text-xs font-bold text-lime-600 uppercase tracking-[0.2em] mb-4">{f.category || 'core'}</p>
                    <h2 className="text-4xl md:text-5xl font-black text-slate-950 tracking-[-0.02em] leading-[1.05] mb-5">{f.title}</h2>
                    <p className="text-lg text-slate-600 font-normal leading-relaxed mb-8">{f.long_description || f.short_description}</p>

                    {Array.isArray(f.benefits) && f.benefits.length > 0 && (
                      <ul className="space-y-3">
                        {f.benefits.map((b: string, i: number) => (
                          <li key={i} className="flex items-start gap-3">
                            <div className="h-5 w-5 rounded-full bg-lime-100 text-lime-700 flex items-center justify-center shrink-0 mt-0.5">
                              <Check size={12} strokeWidth={3} />
                            </div>
                            <span className="text-base text-slate-700 font-medium">{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Reveal>
                </div>

                <div className={reverse ? 'lg:order-1' : ''}>
                  <Reveal direction={reverse ? 'left' : 'right'} delay={100}>
                    <div className="relative aspect-square max-w-md mx-auto">
                      <div className="absolute inset-0 bg-gradient-to-br from-lime-50 to-emerald-50 rounded-[2.5rem] border border-slate-200" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-32 w-32 md:h-44 md:w-44 rounded-[2rem] flex items-center justify-center bg-white text-slate-950 shadow-2xl border border-slate-100 rotate-3 hover:rotate-0 transition-transform duration-700">
                          <Icon size={80} strokeWidth={1.5} />
                        </div>
                      </div>
                    </div>
                  </Reveal>
                </div>
              </div>
            </div>
          </section>
        )
      })}

      <div className="max-w-7xl mx-auto px-4 md:px-8 pb-8">
        <Reveal>
          <CTABanner
            title="Activa tu agente en 10 minutos"
            subtitle="Sin tarjeta. 7 días gratis. Cancela cuando quieras."
            primaryCta={{ text: 'Probar gratis', href: '/login?signup=1' }}
            secondaryCta={{ text: 'Ver precios', href: '/precios' }}
          />
        </Reveal>
      </div>
    </div>
  )
}
