// ============================================================================
// src/app/(public)/industrias/[slug]/page.tsx — Landing por industria
// ----------------------------------------------------------------------------
// Cada industria tiene su propia experiencia: hero específico con accent color,
// problemas que resuelve, features de la industria, casos de uso, CTA.
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, ArrowLeft, Check, Sparkles, MessageCircle, Calendar, Users, BarChart3 } from 'lucide-react'
import { getIcon } from '../../../../lib/iconMap'
import Reveal from '../../../../lib/scrollReveal'
import CTABanner from '../../../../components/public/CTABanner'

export const revalidate = 60

// Convierte hex → tinte con alpha (para fondos/badges sutiles)
function tint(hex: string, alpha: string = '14'): string {
  return `${hex}${alpha}`
}

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function IndustriaSlugPage({ params }: PageProps) {
  const { slug } = await params
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Industria + testimonios de la misma industria + features genéricas
  const [industriaRes, testimonialsRes] = await Promise.all([
    supabase.from('site_industries').select('*').eq('slug', slug).eq('visible', true).maybeSingle(),
    supabase.from('site_testimonials').select('*').eq('visible', true).eq('industry_slug', slug).order('display_order').limit(3)
  ])

  const industria = industriaRes.data
  if (!industria) notFound()

  const testimonials = testimonialsRes.data || []
  const Icon = getIcon(industria.icon_name)
  const accent = industria.accent_color || '#0F172A'
  const bullets: string[] = Array.isArray(industria.bullet_points) ? industria.bullet_points : []

  return (
    <div className="bg-[#FAFAF7] text-slate-950">

      {/* HERO con accent de la industria */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(circle at top right, ${tint(accent, '22')}, transparent 60%)` }}
        />
        <div
          className="absolute top-32 -left-32 w-96 h-96 rounded-full blur-3xl pointer-events-none"
          style={{ backgroundColor: tint(accent, '20') }}
        />

        <div className="relative max-w-7xl mx-auto px-4 md:px-8 pt-12 md:pt-20 pb-20 md:pb-28">

          <Reveal>
            <Link href="/industrias" className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors mb-10">
              <ArrowLeft size={14} /> Todas las industrias
            </Link>
          </Reveal>

          <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
            <div className="lg:col-span-7">
              <Reveal>
                <div
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-8 border"
                  style={{ backgroundColor: tint(accent, '0F'), borderColor: tint(accent, '33'), color: accent }}
                >
                  <Sparkles size={12} />
                  <span className="text-[11px] font-bold tracking-wide uppercase">
                    Industria · {industria.name}
                  </span>
                </div>
              </Reveal>

              <Reveal delay={100}>
                <h1 className="text-5xl md:text-7xl font-black text-slate-950 tracking-[-0.02em] leading-[0.95] mb-6">
                  {industria.tagline || industria.name}
                </h1>
              </Reveal>

              <Reveal delay={200}>
                <p className="text-lg md:text-2xl text-slate-600 font-normal leading-relaxed mb-10 max-w-2xl">
                  {industria.description}
                </p>
              </Reveal>

              <Reveal delay={300}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <Link
                    href={`/login?signup=1&template=${industria.slug}`}
                    className="group w-full sm:w-auto px-8 py-4 bg-slate-950 hover:bg-slate-800 text-white rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2"
                  >
                    Activar industria
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </Link>
                  <Link
                    href="/contacto"
                    className="w-full sm:w-auto px-8 py-4 bg-white hover:bg-slate-50 text-slate-950 border border-slate-200 rounded-2xl font-bold text-base transition-all"
                  >
                    Ver demo
                  </Link>
                </div>
              </Reveal>
            </div>

            {/* Card mockup con icono grande */}
            <div className="lg:col-span-5">
              <Reveal delay={400} direction="right">
                <div
                  className="relative aspect-square rounded-[2.5rem] overflow-hidden border-2 flex items-center justify-center"
                  style={{ backgroundColor: tint(accent, '08'), borderColor: tint(accent, '22') }}
                >
                  <div
                    className="h-40 w-40 md:h-56 md:w-56 rounded-[2rem] flex items-center justify-center text-white shadow-2xl rotate-3 hover:rotate-0 transition-transform duration-700"
                    style={{ backgroundColor: accent }}
                  >
                    <Icon size={100} strokeWidth={1.5} />
                  </div>

                  {/* Pequeños chips flotando */}
                  <div className="absolute top-8 left-8 bg-white rounded-2xl shadow-lg px-3 py-2 flex items-center gap-2 -rotate-6">
                    <MessageCircle size={14} className="text-slate-500" />
                    <span className="text-xs font-bold text-slate-700">WhatsApp activo</span>
                  </div>
                  <div className="absolute bottom-8 right-8 bg-white rounded-2xl shadow-lg px-3 py-2 flex items-center gap-2 rotate-6">
                    <Sparkles size={14} className="text-lime-500" />
                    <span className="text-xs font-bold text-slate-700">IA respondiendo</span>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* QUÉ INCLUYE LA PLANTILLA */}
      {bullets.length > 0 && (
        <section className="bg-white border-y border-slate-200 py-20 md:py-32">
          <div className="max-w-7xl mx-auto px-4 md:px-8">
            <Reveal>
              <div className="max-w-2xl mb-16">
                <p className="text-xs font-bold uppercase tracking-[0.2em] mb-4" style={{ color: accent }}>
                  Qué incluye
                </p>
                <h2 className="text-4xl md:text-6xl font-black text-slate-950 tracking-[-0.02em] leading-[1.05]">
                  Todo lo que un {industria.name.toLowerCase()} necesita.
                </h2>
              </div>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
              {bullets.map((bullet: string, idx: number) => (
                <Reveal key={idx} delay={idx * 60}>
                  <div className="flex items-start gap-4 p-6 bg-[#FAFAF7] rounded-3xl border border-slate-200">
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 text-white"
                      style={{ backgroundColor: accent }}
                    >
                      <Check size={18} strokeWidth={3} />
                    </div>
                    <p className="text-base text-slate-800 font-medium leading-relaxed pt-2">
                      {bullet}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* COMO FUNCIONA EN ESTA INDUSTRIA */}
      <section className="py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <Reveal>
            <div className="max-w-2xl mb-16">
              <p className="text-xs font-bold uppercase tracking-[0.2em] mb-4" style={{ color: accent }}>
                Cómo funciona
              </p>
              <h2 className="text-4xl md:text-6xl font-black text-slate-950 tracking-[-0.02em] leading-[1.05]">
                Tu equipo, multiplicado por la IA.
              </h2>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-5 md:gap-6">
            {[
              { icon: MessageCircle, title: 'Tu cliente escribe', desc: `Por WhatsApp, Instagram o tu web. Tu bot le responde con el tono y vocabulario propio de un ${industria.name.toLowerCase()}.` },
              { icon: Calendar,      title: 'El bot resuelve',   desc: `Agenda, cotiza, comparte info o registra el pedido. Sin pasar por tu equipo.` },
              { icon: Users,         title: 'Tú monitoreas',     desc: `Desde el panel ves todas las conversaciones, KPIs y cierres. Y entras tú cuando hace falta.` }
            ].map((step, idx) => (
              <Reveal key={idx} delay={idx * 100}>
                <div className="bg-white border border-slate-200 rounded-3xl p-7 h-full">
                  <div
                    className="h-12 w-12 rounded-xl flex items-center justify-center mb-5"
                    style={{ backgroundColor: tint(accent, '14'), color: accent }}
                  >
                    <step.icon size={22} strokeWidth={2} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-950 tracking-tight mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-slate-600 font-normal leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIOS DE LA INDUSTRIA */}
      {testimonials.length > 0 && (
        <section className="bg-slate-950 text-white py-20 md:py-32 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 md:px-8">
            <Reveal>
              <div className="max-w-2xl mb-16">
                <p className="text-xs font-bold uppercase tracking-[0.2em] mb-4" style={{ color: accent }}>
                  Casos reales
                </p>
                <h2 className="text-4xl md:text-6xl font-black text-white tracking-[-0.02em] leading-[1.05]">
                  Negocios como el tuyo.
                </h2>
              </div>
            </Reveal>

            <div className="grid md:grid-cols-3 gap-5 md:gap-6">
              {testimonials.map((t: any, idx: number) => (
                <Reveal key={t.id} delay={idx * 80}>
                  <div className="bg-white/5 backdrop-blur border border-white/10 rounded-3xl p-7 h-full flex flex-col">
                    <p className="text-base text-white/90 font-medium leading-relaxed flex-1 mb-6">
                      "{t.quote}"
                    </p>
                    {t.metric_value && (
                      <div className="mb-6 pb-6 border-b border-white/10">
                        <p className="text-3xl font-black" style={{ color: accent }}>{t.metric_value}</p>
                        <p className="text-xs text-white/50 font-medium">{t.metric_label}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-white text-slate-950 flex items-center justify-center font-bold text-sm">
                        {t.author_name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{t.author_name}</p>
                        <p className="text-xs text-white/50 font-medium truncate">
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

      {/* CTA FINAL */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 pb-8">
        <Reveal>
          <CTABanner
            title={`Activa la industria ${industria.name.toLowerCase()}`}
            subtitle="14 días gratis. Sin tarjeta. Cancela cuando quieras."
            primaryCta={{ text: 'Probar gratis', href: `/login?signup=1&template=${industria.slug}` }}
            secondaryCta={{ text: 'Hablar con ventas', href: '/contacto' }}
          />
        </Reveal>
      </div>
    </div>
  )
}

// SEO: meta dinámico
export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data } = await supabase
    .from('site_industries')
    .select('name, tagline, description')
    .eq('slug', slug)
    .maybeSingle()

  if (!data) return { title: 'Industria · iAnswer' }
  return {
    title: `${data.name} · iAnswer`,
    description: data.tagline || data.description || ''
  }
}