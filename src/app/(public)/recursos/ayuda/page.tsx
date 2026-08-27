 

// ============================================================================
// src/app/(public)/recursos/ayuda/page.tsx — Help center (rediseño v2)
// ============================================================================

import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { Search, ArrowRight, BookOpen, Sparkles } from 'lucide-react'
import { getIcon } from '../../../../lib/iconMap'
import Reveal from '../../../../lib/scrollReveal'
import CTABanner from '../../../../components/public/CTABanner'

export const revalidate = 60

interface Article {
  id: string
  slug: string | null
  title: string
  summary: string | null
  category: string | null
  category_icon: string | null
  reading_time_minutes: number | null
}

function articleHref(a: Article): string {
  return `/recursos/ayuda/${a.slug || a.id}`
}

export default async function HelpCenterPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: articles } = await supabase
    .from('help_articles')
    .select('id, slug, title, summary, category, category_icon, reading_time_minutes')
    .eq('is_public', true)
    .order('display_order', { ascending: true })

  const safeArticles: Article[] = articles || []
  const byCategory = safeArticles.reduce((acc: Record<string, Article[]>, art) => {
    const cat = art.category || 'Otros'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(art)
    return acc
  }, {})
  const categories = Object.keys(byCategory).sort()

  return (
    <div className="bg-[#FAFAF7] text-slate-950">

      {/* HERO con buscador */}
      <section className="relative overflow-hidden border-b border-slate-200">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#A3E63522,_transparent_60%)] pointer-events-none" />

        <div className="relative max-w-3xl mx-auto px-4 md:px-8 pt-12 md:pt-24 pb-16 md:pb-20 text-center">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-200 rounded-full mb-8">
              <Sparkles size={12} className="text-lime-500" />
              <span className="text-[11px] font-bold text-slate-700 tracking-wide uppercase">
                Centro de Ayuda
              </span>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-slate-950 tracking-[-0.02em] leading-[0.95] mb-6">
              ¿En qué te ayudamos?
            </h1>
          </Reveal>

          <Reveal delay={200}>
            <p className="text-base md:text-xl text-slate-600 font-normal leading-relaxed mb-10 max-w-2xl mx-auto">
              Guías, tutoriales y respuestas a las preguntas más comunes.
            </p>
          </Reveal>

          <Reveal delay={300}>
            <div className="relative max-w-xl mx-auto">
              <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar en la documentación..."
                className="w-full pl-12 pr-5 py-4 bg-white text-slate-900 placeholder:text-slate-400 rounded-2xl font-medium text-sm shadow-lg border border-slate-200 outline-none focus:ring-2 focus:ring-lime-400 focus:border-lime-400 transition-all"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Categorías */}
      <section className="max-w-6xl mx-auto px-4 md:px-8 py-16 md:py-24">
        {categories.length === 0 ? (
          <Reveal>
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center max-w-2xl mx-auto">
              <BookOpen size={32} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-500">Aún no hay artículos publicados.</p>
              <p className="text-xs text-slate-400 mt-1">
                Marca artículos como públicos desde <strong>/dashboard/admin → Helpdesk</strong>.
              </p>
            </div>
          </Reveal>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
            {categories.map((cat, idxCat) => {
              const items = byCategory[cat]
              const firstIcon = items[0]?.category_icon || 'BookOpen'
              const Icon = getIcon(firstIcon, BookOpen)

              return (
                <Reveal key={cat} delay={idxCat * 60}>
                  <div className="bg-white rounded-3xl border border-slate-200 hover:border-slate-300 hover:shadow-md p-7 transition-all hover:-translate-y-1 h-full">
                    <div className="flex items-start gap-3 mb-5">
                      <div className="p-3 bg-lime-100 text-slate-950 rounded-xl">
                        <Icon size={22} strokeWidth={2.2} />
                      </div>
                      <div className="flex-1 min-w-0 pt-1">
                        <h2 className="font-bold text-slate-950 text-lg tracking-tight leading-tight">
                          {cat}
                        </h2>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                          {items.length} {items.length === 1 ? 'artículo' : 'artículos'}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1 pt-2 border-t border-slate-100">
                      {items.slice(0, 5).map(art => (
                        <Link
                          key={art.id}
                          href={articleHref(art)}
                          className="block px-2 py-1.5 -mx-2 rounded-lg text-sm font-bold text-slate-700 hover:text-slate-950 hover:bg-slate-50 transition-colors"
                        >
                          {art.title}
                        </Link>
                      ))}
                      {items.length > 5 && (
                        <p className="px-2 py-1.5 text-xs font-bold text-slate-400">
                          + {items.length - 5} más
                        </p>
                      )}
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </div>
        )}
      </section>

      {/* CTA */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 pb-8">
        <Reveal>
          <CTABanner
            title="¿No encontraste lo que buscabas?"
            subtitle="Nuestro equipo responde en menos de 24 horas."
            primaryCta={{ text: 'Contactar soporte', href: '/contacto' }}
            secondaryCta={{ text: 'Ver precios', href: '/precios' }}
          />
        </Reveal>
      </div>
    </div>
  )
}
