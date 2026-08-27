 

// ============================================================================
// src/app/(public)/addons/page.tsx — Addons público (landing zigzag)
// ----------------------------------------------------------------------------
// Lista todos los addons disponibles. Los precios se muestran u ocultan según
// la setting `addons_show_prices` (toggle en /dashboard/admin → Sitio público).
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { ArrowRight, Sparkles, Check } from 'lucide-react'
import { getIcon } from '../../../lib/iconMap'
import Reveal from '../../../lib/scrollReveal'
import CTABanner from '../../../components/public/CTABanner'
import { loadSiteSettings } from '../../../lib/siteSettings'

export const revalidate = 60

// Tonos por categoría
const CATEGORY_TONES: Record<string, { bg: string, text: string, label: string }> = {
  channel:  { bg: 'bg-sky-50',     text: 'text-sky-600',     label: 'Canal' },
  ai:       { bg: 'bg-violet-50',  text: 'text-violet-600',  label: 'Inteligencia' },
  feature:  { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Función' },
  service:  { bg: 'bg-amber-50',   text: 'text-amber-600',   label: 'Servicio' },
  support:  { bg: 'bg-rose-50',    text: 'text-rose-600',    label: 'Soporte' },
  capacity: { bg: 'bg-blue-50',    text: 'text-blue-600',    label: 'Capacidad' }
}

// Tonos por template/industria. Las keys son los slugs reales en la DB (en inglés).
const TEMPLATE_TONES: Record<string, { bg: string, text: string, label: string }> = {
  health:           { bg: 'bg-rose-50',    text: 'text-rose-700',    label: 'Salud' },
  real_estate:      { bg: 'bg-blue-50',    text: 'text-blue-700',    label: 'Inmobiliaria' },
  restaurant:       { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Restaurantes' },
  marketing_agency: { bg: 'bg-violet-50',  text: 'text-violet-700',  label: 'Marketing' }
}

function getTone(addon: any) {
  // Si el addon es específico de una industria, usar el tono de esa industria
  if (addon.requires_template && TEMPLATE_TONES[addon.requires_template]) {
    return TEMPLATE_TONES[addon.requires_template]
  }
  // Si no, usar el tono de su categoría
  return CATEGORY_TONES[addon.category] || CATEGORY_TONES.feature
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', maximumFractionDigits: 0
  }).format(cents / 100)
}

export default async function AddonsPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [addonsRes, settings] = await Promise.all([
    supabase.from('addons').select('*').eq('is_active', true).order('is_featured', { ascending: false }).order('display_order', { ascending: true }),
    loadSiteSettings()
  ])

  // Default: NO mostrar precios. El admin lo activa cuando esté listo.
  const showPrices: boolean = settings['addons_show_prices'] === true

  const addons = addonsRes.data || []
  const featured  = addons.filter((a: any) => a.is_featured).slice(0, 6)
  const allAddons = addons

  return (
    <div className="bg-[#FAFAF7] text-slate-950">

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_#A3E63522,_transparent_60%)] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 md:px-8 pt-12 md:pt-24 pb-20 md:pb-24">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-200 rounded-full mb-8">
              <Sparkles size={12} className="text-lime-500" />
              <span className="text-[11px] font-bold text-slate-700 tracking-wide uppercase">
                Marketplace de Addons
              </span>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-slate-950 tracking-[-0.02em] leading-[0.95] mb-8 max-w-4xl">
              Extiende tu agente<br />cuando lo necesites.
            </h1>
          </Reveal>

          <Reveal delay={200}>
            <p className="text-lg md:text-2xl text-slate-600 font-normal leading-relaxed max-w-2xl">
              Canales adicionales, más inteligencia, soporte prioritario, funciones avanzadas. Activa solo lo que tu negocio pide hoy. Cancela cuando ya no.
            </p>
          </Reveal>
        </div>
      </section>

      {/* SECCIONES ALTERNADAS por addon destacado */}
      <section className="py-12 md:py-16 space-y-20 md:space-y-32">
        {featured.map((addon: any, idx: number) => {
          const Icon = getIcon(addon.icon)
          const tone = getTone(addon)
          const reverse = idx % 2 === 1
          const price = addon.is_recurring ? addon.price_monthly_cents : addon.price_one_time_cents

          return (
            <div key={addon.id} className="max-w-7xl mx-auto px-4 md:px-8">
              <div className={`grid lg:grid-cols-12 gap-10 lg:gap-16 items-center`}>

                {/* Texto */}
                <div className={`lg:col-span-6 ${reverse ? 'lg:order-2' : ''}`}>
                  <Reveal direction={reverse ? 'right' : 'left'}>
                    <p className={`text-xs font-bold uppercase tracking-[0.2em] mb-4 ${tone.text}`}>
                      {tone.label}
                    </p>
                    <h2 className="text-4xl md:text-5xl font-black text-slate-950 tracking-[-0.02em] leading-[1.05] mb-5">
                      {addon.name}
                    </h2>
                    <p className="text-lg text-slate-600 font-normal leading-relaxed mb-8 max-w-xl">
                      {addon.description}
                    </p>

                    {/* Precio solo si la setting está activa */}
                    {showPrices && price > 0 && (
                      <div className="flex items-baseline gap-2 mb-8">
                        <span className="text-4xl font-black text-slate-950 tracking-tight">
                          {formatPrice(price)}
                        </span>
                        <span className="text-sm text-slate-500 font-medium">
                          {addon.is_recurring ? '/ mes' : 'pago único'}
                        </span>
                      </div>
                    )}

                    {addon.requires_plan_min && (
                      <p className="text-xs font-medium text-amber-700 mb-6 inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full">
                        Requiere plan {addon.requires_plan_min} o superior
                      </p>
                    )}

                    <Link
                      href={`/login?signup=1&addon=${addon.id}`}
                      className="group inline-flex items-center gap-2 px-6 py-3.5 bg-slate-950 hover:bg-slate-800 text-white rounded-2xl font-bold text-sm transition-all"
                    >
                      Activar addon
                      <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </Reveal>
                </div>

                {/* Visual del addon */}
                <div className={`lg:col-span-6 ${reverse ? 'lg:order-1' : ''}`}>
                  <Reveal direction={reverse ? 'left' : 'right'}>
                    <div className="relative aspect-square max-w-md mx-auto">
                      <div className={`absolute inset-0 ${tone.bg} rounded-[2.5rem] border border-slate-200`} />

                      {/* Icono central grande */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className={`h-32 w-32 md:h-44 md:w-44 rounded-[2rem] flex items-center justify-center bg-white shadow-2xl border border-slate-100 ${tone.text} rotate-3 hover:rotate-0 transition-transform duration-700`}>
                          <Icon size={80} strokeWidth={1.5} />
                        </div>
                      </div>

                      {/* Chip flotante con precio (solo si activos los precios) */}
                      {showPrices && price > 0 && (
                        <div className="absolute top-6 right-6 bg-white rounded-2xl shadow-lg px-4 py-2.5 -rotate-3">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5">Desde</p>
                          <p className="text-lg font-black text-slate-950">
                            {formatPrice(price)}
                          </p>
                        </div>
                      )}

                      {/* Chip flotante con "Activo" */}
                      {/* Chip flotante con industria o "Activar en 1 clic" */}
                      <div className="absolute bottom-6 left-6 bg-white rounded-2xl shadow-lg px-3 py-2 flex items-center gap-2 rotate-3">
                        <Check size={14} className="text-lime-500" strokeWidth={3} />
                        <span className="text-xs font-bold text-slate-700">
                          {addon.requires_template ? `Para ${tone.label}` : 'Activar en 1 clic'}
                        </span>
                      </div>
                    </div>
                  </Reveal>
                </div>
              </div>
            </div>
          )
        })}
      </section>

      {/* GRID DE TODOS LOS ADDONS */}
      {allAddons.length > 0 && (
        <section className="bg-white border-t border-slate-200 py-20 md:py-32">
          <div className="max-w-7xl mx-auto px-4 md:px-8">
            <Reveal>
              <div className="max-w-2xl mb-16">
                <p className="text-xs font-bold text-lime-600 uppercase tracking-[0.2em] mb-4">
                  Catálogo completo
                </p>
                <h2 className="text-4xl md:text-6xl font-black text-slate-950 tracking-[-0.02em] leading-[1.05]">
                  Todos los addons disponibles.
                </h2>
              </div>
            </Reveal>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {allAddons.map((addon: any, idx: number) => {
                const Icon = getIcon(addon.icon)
                const tone = getTone(addon)
                const price = addon.is_recurring ? addon.price_monthly_cents : addon.price_one_time_cents

                return (
                  <Reveal key={addon.id} delay={(idx % 6) * 40}>
                    <div className="bg-white border border-slate-200 hover:border-slate-300 rounded-3xl p-7 h-full flex flex-col transition-all hover:shadow-lg hover:-translate-y-1">
                      <div className="flex items-start justify-between mb-4">
                        <div className={`p-2.5 rounded-xl border border-slate-100 ${tone.bg} ${tone.text}`}>
                          <Icon size={20} strokeWidth={2} />
                        </div>
                        {addon.is_featured && (
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider rounded-full border border-slate-200">
                            Popular
                          </span>
                        )}
                      </div>

                      <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${tone.text}`}>
                        {tone.label}
                      </p>
                      <h3 className="text-base font-bold text-slate-950 tracking-tight mb-2">
                        {addon.name}
                      </h3>
                      <p className="text-sm text-slate-600 font-normal leading-relaxed flex-1 mb-5">
                        {addon.description}
                      </p>

                      {/* Precio solo si la setting está activa */}
                      {showPrices && price > 0 ? (
                        <div className="flex items-baseline justify-between pt-4 border-t border-slate-100">
                          <div>
                            <p className="text-lg font-black text-slate-950 tracking-tight">
                              {formatPrice(price)}
                            </p>
                            <p className="text-[10px] text-slate-500 font-medium">
                              {addon.is_recurring ? '/ mes' : 'pago único'}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="pt-4 border-t border-slate-100">
                          <Link
                            href="/contacto"
                            className="text-sm font-bold text-slate-950 hover:text-lime-700 transition-colors inline-flex items-center gap-1.5"
                          >
                            Consultar precio <ArrowRight size={12} />
                          </Link>
                        </div>
                      )}
                    </div>
                  </Reveal>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* CTA FINAL */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 pb-8">
        <Reveal>
          <CTABanner
            title="Activa solo lo que necesitas"
            subtitle="Tu plan base trae lo esencial. Los addons cubren las necesidades especiales sin obligarte a subir de plan."
            primaryCta={{ text: 'Probar gratis', href: '/login?signup=1' }}
            secondaryCta={{ text: 'Ver precios', href: '/precios' }}
          />
        </Reveal>
      </div>
    </div>
  )
}
