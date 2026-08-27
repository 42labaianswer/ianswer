 

// ============================================================================
// src/components/public/LegalPage.tsx — Layout reusable para legales (v2)
// ----------------------------------------------------------------------------
// Paleta nueva: cream bg + slate-950 primary + lime-600 accents.
// ============================================================================

import { Calendar } from 'lucide-react'
import Reveal from '../../lib/scrollReveal'

interface Section {
  id: string
  title: string
  body: React.ReactNode
}

interface Props {
  title: string
  description?: string
  effectiveDate: string
  sections: Section[]
}

export default function LegalPage({ title, description, effectiveDate, sections }: Props) {
  return (
    <div className="bg-[#FAFAF7] text-slate-950">

      {/* HERO compacto editorial */}
      <section className="relative overflow-hidden border-b border-slate-200">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#A3E63522,_transparent_60%)] pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 md:px-8 pt-12 md:pt-20 pb-10 md:pb-14">
          <Reveal>
            <p className="text-xs font-bold text-lime-600 uppercase tracking-[0.2em] mb-4">
              Documento legal
            </p>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="text-4xl md:text-6xl font-black text-slate-950 tracking-[-0.02em] leading-[1.05] mb-4">
              {title}
            </h1>
          </Reveal>
          {description && (
            <Reveal delay={200}>
              <p className="text-base md:text-lg text-slate-600 font-normal leading-relaxed max-w-3xl">
                {description}
              </p>
            </Reveal>
          )}
          <Reveal delay={300}>
            <div className="inline-flex items-center gap-2 mt-6 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-700">
              <Calendar size={12} className="text-lime-600" />
              Vigente desde {effectiveDate}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Contenido + sidebar */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 py-12 md:py-16">
        <div className="grid md:grid-cols-4 gap-8 md:gap-12">

          {/* TOC sticky en desktop */}
          <aside className="md:col-span-1 hidden md:block">
            <div className="sticky top-28">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">
                Contenido
              </p>
              <ul className="space-y-2">
                {sections.map(s => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="block text-sm font-medium text-slate-600 hover:text-slate-950 hover:translate-x-0.5 transition-all"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Secciones */}
          <article className="md:col-span-3 space-y-12">
            {sections.map((s, idx) => (
              <Reveal key={s.id} delay={idx * 50}>
                <section id={s.id} className="scroll-mt-28">
                  <h2 className="text-2xl md:text-3xl font-black text-slate-950 tracking-tight mb-5">
                    {s.title}
                  </h2>
                  <div className="
                    text-base text-slate-700 leading-relaxed
                    [&_p]:my-4 [&_p]:leading-relaxed
                    [&_a]:text-lime-700 [&_a]:font-bold [&_a:hover]:underline
                    [&_strong]:font-black [&_strong]:text-slate-950
                    [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-4 [&_ul]:space-y-2
                    [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-4 [&_ol]:space-y-2
                    [&_li]:leading-relaxed
                  ">
                    {s.body}
                  </div>
                </section>
              </Reveal>
            ))}
          </article>
        </div>
      </section>
    </div>
  )
}
