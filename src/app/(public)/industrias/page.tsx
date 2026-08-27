 

// ============================================================================
// src/app/(public)/industrias/page.tsx — Índice de industrias (rediseño v2)
// ============================================================================

import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { ArrowRight, Sparkles } from 'lucide-react'
import { getIcon } from '../../../lib/iconMap'
import Reveal from '../../../lib/scrollReveal'
import CTABanner from '../../../components/public/CTABanner'

export const revalidate = 60

export default async function IndustriasPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: industries } = await supabase
    .from('site_industries')
    .select('*')
    .eq('visible', true)
    .order('display_order')

  return (
    <div className="bg-[#FAFAF7] text-slate-950">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#A3E63522,_transparent_60%)] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 md:px-8 pt-16 md:pt-28 pb-20 md:pb-24">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-200 rounded-full mb-8">
              <Sparkles size={12} className="text-lime-500" />
              <span className="text-[11px] font-bold text-slate-700 tracking-wide uppercase">
                Industrias
              </span>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-slate-950 tracking-[-0.02em] leading-[0.95] mb-8 max-w-5xl">
              Una experiencia<br/>pensada para ti.
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="text-lg md:text-2xl text-slate-600 font-normal leading-relaxed max-w-2xl">
              Cada industria tiene su propio flujo, vocabulario y campos. Elige la tuya y obtén un panel listo para producir desde el día uno.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
            {(industries || []).map((ind: any, idx: number) => {
              const Icon = getIcon(ind.icon_name)
              const accent = ind.accent_color || '#0F172A'

              return (
                <Reveal key={ind.id} delay={idx * 60}>
                  <Link
                    href={`/industrias/${ind.slug}`}
                    className="group relative block bg-white border border-slate-200 hover:border-slate-300 rounded-3xl overflow-hidden transition-all hover:shadow-xl hover:-translate-y-1 h-full"
                  >
                    <div
                      className="absolute top-0 left-0 right-0 h-1.5"
                      style={{ backgroundColor: accent }}
                    />

                    <div className="p-7 md:p-8">
                      <div className="flex items-start gap-4 mb-5">
                        <div
                          className="h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 text-white"
                          style={{ backgroundColor: accent }}
                        >
                          <Icon size={26} strokeWidth={2} />
                        </div>
                        <div className="flex-1 min-w-0 pt-1">
                          <h2 className="text-xl font-bold text-slate-950 tracking-tight leading-tight">
                            {ind.name}
                          </h2>
                          {ind.tagline && (
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mt-1">
                              {ind.tagline}
                            </p>
                          )}
                        </div>
                      </div>

                      <p className="text-sm text-slate-600 font-normal leading-relaxed mb-6">
                        {ind.description}
                      </p>

                      {Array.isArray(ind.bullet_points) && ind.bullet_points.length > 0 && (
                        <ul className="space-y-1.5 mb-6">
                          {ind.bullet_points.slice(0, 3).map((b: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-slate-700 font-medium">
                              <span
                                className="h-1 w-1 rounded-full mt-2 shrink-0"
                                style={{ backgroundColor: accent }}
                              />
                              {b}
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="flex items-center gap-1.5 text-sm font-bold text-slate-950 pt-4 border-t border-slate-100">
                        Ver experiencia
                        <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </Link>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 md:px-8 pb-8">
        <Reveal>
          <CTABanner
            title="¿No ves tu industria?"
            subtitle="La industria genérica te da los bloques para armar el flujo de cualquier negocio. Y si necesitas algo a medida, hablamos."
            primaryCta={{ text: 'Probar gratis', href: '/login?signup=1' }}
            secondaryCta={{ text: 'Hablar con ventas', href: '/contacto' }}
          />
        </Reveal>
      </div>
    </div>
  )
}
