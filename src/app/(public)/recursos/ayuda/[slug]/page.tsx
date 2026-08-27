// ============================================================================
// src/app/(public)/recursos/ayuda/[slug]/page.tsx — Artículo (rediseño v2)
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Clock, BookOpen } from 'lucide-react'
import { getIcon } from '../../../../../lib/iconMap'
import Reveal from '../../../../../lib/scrollReveal'

export const revalidate = 60

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function HelpArticlePage({ params }: PageProps) {
  const { slug } = await params
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  let { data: article } = await supabase
    .from('help_articles')
    .select('*')
    .eq('slug', slug)
    .eq('is_public', true)
    .maybeSingle()

  if (!article) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)
    if (isUuid) {
      const r = await supabase
        .from('help_articles')
        .select('*')
        .eq('id', slug)
        .eq('is_public', true)
        .maybeSingle()
      article = r.data
    }
  }

  if (!article) notFound()

  const CategoryIcon = getIcon(article.category_icon || 'BookOpen', BookOpen)

  return (
    <div className="bg-[#FAFAF7] text-slate-950">
      <article className="max-w-3xl mx-auto px-4 md:px-8 py-12 md:py-20">

        <Reveal>
          <Link
            href="/recursos/ayuda"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-950 transition-colors mb-8"
          >
            <ArrowLeft size={14} /> Centro de ayuda
          </Link>
        </Reveal>

        {article.category && (
          <Reveal delay={50}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5 bg-lime-100 text-lime-800">
              <CategoryIcon size={12} />
              <span className="text-xs font-black uppercase tracking-wider">{article.category}</span>
            </div>
          </Reveal>
        )}

        <Reveal delay={100}>
          <h1 className="text-4xl md:text-6xl font-black text-slate-950 tracking-[-0.02em] leading-[1.05] mb-4">
            {article.title}
          </h1>
        </Reveal>

        {article.summary && (
          <Reveal delay={150}>
            <p className="text-lg text-slate-600 font-normal leading-relaxed mb-6">
              {article.summary}
            </p>
          </Reveal>
        )}

        <Reveal delay={200}>
          <div className="flex items-center gap-4 text-xs text-slate-500 font-bold uppercase tracking-wider mb-10 pb-6 border-b border-slate-200">
            {article.reading_time_minutes ? (
              <span className="flex items-center gap-1.5">
                <Clock size={12} /> {article.reading_time_minutes} min de lectura
              </span>
            ) : null}
          </div>
        </Reveal>

        {article.media_url && (
          <Reveal delay={250}>
            <div className="mb-8 rounded-3xl overflow-hidden border border-slate-200">
              <img src={article.media_url} alt={article.title} className="w-full h-auto" />
            </div>
          </Reveal>
        )}

        {/* Render del HTML del RichTextEditor — paleta nueva */}
        <Reveal delay={300}>
          <div
            className="
              text-base text-slate-800 leading-relaxed
              [&_h1]:text-3xl [&_h1]:font-black [&_h1]:text-slate-950 [&_h1]:mt-10 [&_h1]:mb-5 [&_h1]:tracking-tight
              [&_h2]:text-2xl [&_h2]:font-black [&_h2]:text-slate-950 [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:tracking-tight
              [&_h3]:text-xl  [&_h3]:font-black [&_h3]:text-slate-950 [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:tracking-tight
              [&_p]:my-5 [&_p]:leading-relaxed
              [&_a]:text-lime-700 [&_a]:font-bold [&_a:hover]:underline
              [&_strong]:font-black [&_strong]:text-slate-950
              [&_em]:italic
              [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-5 [&_ul]:space-y-2
              [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-5 [&_ol]:space-y-2
              [&_li]:leading-relaxed
              [&_blockquote]:border-l-4 [&_blockquote]:border-lime-400 [&_blockquote]:pl-5 [&_blockquote]:italic [&_blockquote]:text-slate-700 [&_blockquote]:my-6
              [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:bg-slate-100 [&_code]:text-slate-800 [&_code]:rounded [&_code]:font-mono [&_code]:text-sm
              [&_pre]:bg-slate-950 [&_pre]:text-white [&_pre]:p-5 [&_pre]:rounded-2xl [&_pre]:overflow-x-auto [&_pre]:my-6
              [&_pre_code]:bg-transparent [&_pre_code]:text-white [&_pre_code]:p-0
              [&_img]:rounded-2xl [&_img]:my-8 [&_img]:max-w-full [&_img]:h-auto
              [&_hr]:my-10 [&_hr]:border-slate-200
            "
            dangerouslySetInnerHTML={{ __html: article.content || '' }}
          />
        </Reveal>

        <Reveal delay={400}>
          <div className="mt-16 pt-8 border-t border-slate-200">
            <p className="text-sm text-slate-500 font-medium mb-4">¿Te resultó útil este artículo?</p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/recursos/ayuda"
                className="px-5 py-2.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl font-bold text-sm transition-colors"
              >
                Ver más guías
              </Link>
              <Link
                href="/contacto"
                className="px-5 py-2.5 bg-slate-950 hover:bg-slate-800 text-white rounded-xl font-bold text-sm transition-colors"
              >
                Contactar soporte
              </Link>
            </div>
          </div>
        </Reveal>
      </article>
    </div>
  )
}