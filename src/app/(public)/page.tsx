 

// ============================================================================
// src/app/(public)/page.tsx — Home (v2 rediseñada)
// ----------------------------------------------------------------------------
// Paleta nueva: slate-950 + lime-400 + cream. Vibe editorial Linear/Vercel.
// Animaciones scroll-reveal en cada sección.
// ============================================================================

import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { ArrowRight, Sparkles, Check } from 'lucide-react'
import { loadSiteSettings, s } from '../../lib/siteSettings'
import { getIcon } from '../../lib/iconMap'
import Reveal from '../../lib/scrollReveal'
import CTABanner from '../../components/public/CTABanner'

export const revalidate = 60

async function getHomeData() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [settings, features, industries, testimonials] = await Promise.all([
    loadSiteSettings(),
    supabase.from('site_features').select('*').eq('visible', true).order('display_order').limit(6),
    supabase.from('site_industries').select('*').eq('visible', true).order('display_order').limit(6),
    supabase.from('site_testimonials').select('*').eq('visible', true).eq('featured', true).order('display_order').limit(3)
  ])
  return {
    settings,
    features:     features.data || [],
    industries:   industries.data || [],
    testimonials: testimonials.data || []
  }
}

export default async function HomePage() {
  const { settings, features, industries, testimonials } = await getHomeData()

  const heroCtaPrimary   = s(settings, 'hero_cta_primary',   { text: 'Probar gratis', href: '/login?signup=1' })
  const heroCtaSecondary = s(settings, 'hero_cta_secondary', { text: 'Hablar con ventas', href: '/contacto' })
  const steps            = s(settings, 'home_steps_list', [])

  return (
    <div className="bg-[#FAFAF7] text-slate-950">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Trama sutil de fondo */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_#A3E63522,_transparent_60%)] pointer-events-none" />
        <div className="absolute top-32 -left-32 w-96 h-96 bg-lime-200/30 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 md:px-8 pt-12 md:pt-24 pb-20 md:pb-32">

          <Reveal>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-200 rounded-full mb-8">
              <span className="h-1.5 w-1.5 bg-lime-400 rounded-full animate-pulse" />
              <span className="text-[11px] font-bold text-slate-700 tracking-wide uppercase">
                {s(settings, 'hero_eyebrow', 'Asistentes AI por WhatsApp')}
              </span>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-slate-950 tracking-[-0.02em] leading-[0.95] mb-8 max-w-5xl">
              {s(settings, 'hero_title', 'Tu negocio responde. Tú descansas.')}
            </h1>
          </Reveal>

          <Reveal delay={200}>
            <p className="text-lg md:text-2xl text-slate-600 font-normal leading-relaxed max-w-2xl mb-10">
              {s(settings, 'hero_subtitle')}
            </p>
          </Reveal>

          <Reveal delay={300}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Link
                href={heroCtaPrimary.href || '/login?signup=1'}
                className="group w-full sm:w-auto px-8 py-4 bg-slate-950 hover:bg-slate-800 text-white rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2"
              >
                {heroCtaPrimary.text}
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href={heroCtaSecondary.href || '/contacto'}
                className="w-full sm:w-auto px-8 py-4 bg-white hover:bg-slate-50 text-slate-950 border border-slate-200 rounded-2xl font-bold text-base transition-all"
              >
                {heroCtaSecondary.text}
              </Link>
            </div>
          </Reveal>

          <Reveal delay={400}>
            <div className="mt-12 md:mt-16 flex items-center gap-3 text-xs text-slate-500">
              <Check size={14} className="text-lime-600" /> Sin tarjeta
              <span className="text-slate-300">·</span>
              <Check size={14} className="text-lime-600" /> 14 días gratis
              <span className="text-slate-300">·</span>
              <Check size={14} className="text-lime-600" /> Cancela cuando quieras
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────── */}
      {features.length > 0 && (
        <section className="bg-white border-y border-slate-200 py-20 md:py-32">
          <div className="max-w-7xl mx-auto px-4 md:px-8">
            <Reveal>
              <div className="max-w-2xl mb-16">
                <p className="text-xs font-bold text-lime-600 uppercase tracking-[0.2em] mb-4">
                  Plataforma
                </p>
                <h2 className="text-4xl md:text-6xl font-black text-slate-950 tracking-[-0.02em] leading-[1.05] mb-5">
                  {s(settings, 'home_features_title', 'Todo lo que necesitas en un solo lugar')}
                </h2>
                <p className="text-lg text-slate-600 font-normal leading-relaxed">
                  {s(settings, 'home_features_subtitle')}
                </p>
              </div>
            </Reveal>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-200 border border-slate-200 rounded-3xl overflow-hidden">
              {features.map((f: any, idx: number) => {
                const Icon = getIcon(f.icon_name)
                return (
                  <Reveal key={f.id} delay={idx * 80}>
                    <Link
                      href={`/funciones#${f.slug}`}
                      className="group bg-white hover:bg-slate-50 p-8 md:p-10 transition-all h-full block"
                    >
                      <div className="h-11 w-11 bg-lime-100 text-slate-950 rounded-xl flex items-center justify-center mb-6 group-hover:bg-lime-400 transition-colors">
                        <Icon size={20} strokeWidth={2.2} />
                      </div>
                      <h3 className="text-xl font-bold text-slate-950 tracking-tight mb-2">
                        {f.title}
                      </h3>
                      <p className="text-sm text-slate-600 font-normal leading-relaxed">
                        {f.short_description}
                      </p>
                      <div className="mt-6 flex items-center gap-1.5 text-xs font-bold text-slate-950 opacity-0 group-hover:opacity-100 transition-opacity">
                        Saber más <ArrowRight size={12} />
                      </div>
                    </Link>
                  </Reveal>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── INDUSTRIAS ───────────────────────────────────────────────────── */}
      {industries.length > 0 && (
        <section className="py-20 md:py-32 bg-[#FAFAF7]">
          <div className="max-w-7xl mx-auto px-4 md:px-8">
            <Reveal>
              <div className="max-w-2xl mb-16">
                <p className="text-xs font-bold text-lime-600 uppercase tracking-[0.2em] mb-4">
                  Por industria
                </p>
                <h2 className="text-4xl md:text-6xl font-black text-slate-950 tracking-[-0.02em] leading-[1.05] mb-5">
                  {s(settings, 'home_industries_title', 'Hecho para tu industria')}
                </h2>
                <p className="text-lg text-slate-600 font-normal leading-relaxed">
                  {s(settings, 'home_industries_subtitle')}
                </p>
              </div>
            </Reveal>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {industries.map((ind: any, idx: number) => {
                const Icon = getIcon(ind.icon_name)
                return (
                  <Reveal key={ind.id} delay={idx * 60}>
                    <Link
                      href={`/industrias/${ind.slug}`}
                      className="group block bg-white border border-slate-200 hover:border-slate-300 rounded-3xl p-7 transition-all hover:shadow-lg hover:-translate-y-1 h-full"
                    >
                      <div className="flex items-start gap-4 mb-5">
                        <div
                          className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 text-white"
                          style={{ backgroundColor: ind.accent_color || '#0F172A' }}
                        >
                          <Icon size={22} strokeWidth={2} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-bold text-slate-950 tracking-tight">
                            {ind.name}
                          </h3>
                          {ind.tagline && (
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mt-1">
                              {ind.tagline}
                            </p>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 font-normal leading-relaxed mb-5">
                        {ind.description}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-950">
                        Ver experiencia <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                      </div>
                    </Link>
                  </Reveal>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── 3 PASOS ──────────────────────────────────────────────────────── */}
      {steps.length > 0 && (
        <section className="bg-slate-950 text-white py-20 md:py-32 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 md:px-8">
            <Reveal>
              <div className="max-w-2xl mb-16">
                <p className="text-xs font-bold text-lime-400 uppercase tracking-[0.2em] mb-4">
                  Setup
                </p>
                <h2 className="text-4xl md:text-6xl font-black text-white tracking-[-0.02em] leading-[1.05]">
                  {s(settings, 'home_steps_title', 'En 3 pasos tu bot está activo')}
                </h2>
              </div>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
              {steps.map((step: any, idx: number) => (
                <Reveal key={idx} delay={idx * 120}>
                  <div className="relative">
                    <p className="text-[8rem] md:text-[10rem] font-black text-lime-400/15 leading-none mb-2 -ml-2">
                      {step.number}
                    </p>
                    <h3 className="text-2xl font-bold text-white tracking-tight mb-3">
                      {step.title}
                    </h3>
                    <p className="text-base text-slate-400 font-normal leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── TESTIMONIOS ──────────────────────────────────────────────────── */}
      {testimonials.length > 0 && (
        <section className="bg-white py-20 md:py-32">
          <div className="max-w-7xl mx-auto px-4 md:px-8">
            <Reveal>
              <div className="text-center max-w-2xl mx-auto mb-16">
                <p className="text-xs font-bold text-lime-600 uppercase tracking-[0.2em] mb-4">
                  Casos reales
                </p>
                <h2 className="text-4xl md:text-6xl font-black text-slate-950 tracking-[-0.02em] leading-[1.05]">
                  Negocios que ya descansan
                </h2>
              </div>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
              {testimonials.map((t: any, idx: number) => (
                <Reveal key={t.id} delay={idx * 80}>
                  <div className="bg-[#FAFAF7] border border-slate-200 rounded-3xl p-7 h-full flex flex-col">
                    <div className="mb-6">
                      <Sparkles size={16} className="text-lime-500" />
                    </div>
                    <p className="text-base text-slate-800 font-medium leading-relaxed flex-1 mb-6">
                      "{t.quote}"
                    </p>
                    {t.metric_value && (
                      <div className="mb-6 pb-6 border-b border-slate-200">
                        <p className="text-3xl font-black text-slate-950">{t.metric_value}</p>
                        <p className="text-xs text-slate-500 font-medium">{t.metric_label}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-slate-950 text-white flex items-center justify-center font-bold text-sm">
                        {t.author_name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-950 truncate">{t.author_name}</p>
                        <p className="text-xs text-slate-500 font-medium truncate">
                          {t.author_role}{t.company_name ? ` · ${t.company_name}` : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA FINAL ────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 pb-8">
        <Reveal>
          <CTABanner
            title={s(settings, 'home_final_cta_title', 'Empieza tu prueba de 14 días')}
            subtitle={s(settings, 'home_final_cta_subtitle')}
            primaryCta={heroCtaPrimary.text ? heroCtaPrimary : { text: 'Probar gratis', href: '/login?signup=1' }}
            secondaryCta={{ text: 'Ver precios', href: '/precios' }}
          />
        </Reveal>
      </div>
    </div>
  )
}
