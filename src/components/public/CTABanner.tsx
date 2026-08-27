 

// ============================================================================
// src/components/public/CTABanner.tsx
// ----------------------------------------------------------------------------
// Banner CTA con paleta nueva: slate-950 + lime-400 accent.
// ============================================================================

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

interface Props {
  title: string
  subtitle?: string
  primaryCta: { text: string; href: string }
  secondaryCta?: { text: string; href: string }
}

export default function CTABanner({ title, subtitle, primaryCta, secondaryCta }: Props) {
  return (
    <div className="relative overflow-hidden rounded-[2.5rem] bg-slate-950 text-white p-10 md:p-20 my-16 md:my-24">
      {/* Acento lima decorativo */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-lime-400/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-lime-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto text-center">
        <h2 className="text-4xl md:text-6xl font-black tracking-[-0.02em] leading-[1.05] mb-5">
          {title}
        </h2>
        {subtitle && (
          <p className="text-lg md:text-xl text-slate-300 font-normal leading-relaxed mb-10 max-w-2xl mx-auto">
            {subtitle}
          </p>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href={primaryCta.href}
            className="group w-full sm:w-auto px-8 py-4 bg-lime-400 hover:bg-lime-300 text-slate-950 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2"
          >
            {primaryCta.text}
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </Link>
          {secondaryCta && (
            <Link
              href={secondaryCta.href}
              className="w-full sm:w-auto px-8 py-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold text-base transition-all border border-white/20"
            >
              {secondaryCta.text}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
