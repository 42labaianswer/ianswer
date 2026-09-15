 

// ============================================================================
// src/app/(public)/sobre-nosotros/page.tsx — About (rediseño v2)
// ============================================================================

import { Sparkles, Heart, Zap, Shield, Users } from 'lucide-react'
import Reveal from '../../../lib/scrollReveal'
import CTABanner from '../../../components/public/CTABanner'

export const revalidate = 3600

const VALORES = [
  { icon: Heart,  title: 'Negocios humanos', desc: 'La tecnología debe liberar tiempo, no consumirlo. Construimos para gente real, con problemas reales.' },
  { icon: Zap,    title: 'Simple gana',      desc: 'Diseño cuidado, defaults sensatos. Los problemas complejos no requieren herramientas complicadas.' },
  { icon: Shield, title: 'Tu data es tuya',  desc: 'Sin venta de datos, sin entrenamiento de modelos públicos con tus conversaciones, sin permanencia.' },
  { icon: Users,  title: 'Soporte humano',   desc: 'Detrás del bot, somos personas. Te respondemos por WhatsApp cuando lo necesites.' }
]

export default function SobreNosotrosPage() {
  return (
    <div className="bg-[#FAFAF7] text-slate-950">

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#A3E63522,_transparent_60%)] pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 md:px-8 pt-12 md:pt-24 pb-16">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-200 rounded-full mb-8">
              <Sparkles size={12} className="text-lime-500" />
              <span className="text-[11px] font-bold text-slate-700 tracking-wide uppercase">Sobre nosotros</span>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-slate-950 tracking-[-0.02em] leading-[0.95] mb-8 max-w-4xl">
              Hechos en Mérida.<br/>Para todo el mundo.
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="text-lg md:text-2xl text-slate-600 font-normal leading-relaxed max-w-3xl">
              iAnswer nació para que negocios pequeños y medianos accedan a asistentes de IA de verdad — los mismos que usan las grandes corporaciones, pero con un setup de 10 minutos y precios honestos.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="bg-white border-y border-slate-200 py-20 md:py-32">
        <div className="max-w-5xl mx-auto px-4 md:px-8">
          <Reveal>
            <div className="max-w-2xl mb-16">
              <p className="text-xs font-bold text-lime-600 uppercase tracking-[0.2em] mb-4">Nuestros valores</p>
              <h2 className="text-4xl md:text-6xl font-black text-slate-950 tracking-[-0.02em] leading-[1.05]">Por qué construimos.</h2>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-5 md:gap-6">
            {VALORES.map((v, idx) => (
              <Reveal key={idx} delay={idx * 80}>
                <div className="bg-[#FAFAF7] border border-slate-200 rounded-3xl p-7 h-full">
                  <div className="h-11 w-11 bg-lime-100 text-slate-950 rounded-xl flex items-center justify-center mb-5">
                    <v.icon size={20} strokeWidth={2.2} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-950 tracking-tight mb-2">{v.title}</h3>
                  <p className="text-sm text-slate-600 font-normal leading-relaxed">{v.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 md:px-8 pb-8">
        <Reveal>
          <CTABanner
            title="Únete a quienes ya descansan"
            subtitle="Tu bot listo en 10 minutos. 7 días para probarlo. Sin tarjeta."
            primaryCta={{ text: 'Probar gratis', href: '/login?signup=1' }}
            secondaryCta={{ text: 'Hablar con ventas', href: '/contacto' }}
          />
        </Reveal>
      </div>
    </div>
  )
}
