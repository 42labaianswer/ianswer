 

// ============================================================================
// src/app/(public)/contacto/page.tsx — Contacto (rediseño v2)
// ============================================================================

import { Mail, MessageCircle, MapPin, Sparkles } from 'lucide-react'
import { loadPlatformBranding } from '../../../lib/siteSettings'
import { loadLegalConfig, formatWhatsApp } from '../../../lib/legalConfig'
import Reveal from '../../../lib/scrollReveal'

export const revalidate = 60

export default async function ContactoPage() {
  const [branding, { legalSettings }] = await Promise.all([
    loadPlatformBranding(),
    loadLegalConfig()
  ])

  const brandName = branding.name || 'Plataforma'

  // Tomar los datos de legal_settings, con fallbacks genéricos (sin iAnswer)
  const email = legalSettings.support_email || 'soporte@midominio.com'
  const whatsappRaw = legalSettings.whatsapp_number || ''
  const address = legalSettings.contact_address || 'Mérida, Yucatán, México'

  // Construir el enlace de WhatsApp solo si hay número
  const whatsappHref = whatsappRaw ? `https://wa.me/${whatsappRaw.replace(/\D/g, '')}` : '#'
  const whatsappDisplay = whatsappRaw ? formatWhatsApp(whatsappRaw) : ''

  return (
    <div className="bg-[#FAFAF7] text-slate-950">

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#A3E63522,_transparent_60%)] pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 md:px-8 pt-12 md:pt-24 pb-12 md:pb-16 text-center">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-200 rounded-full mb-8">
              <Sparkles size={12} className="text-lime-500" />
              <span className="text-[11px] font-bold text-slate-700 tracking-wide uppercase">Contacto</span>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-slate-950 tracking-[-0.02em] leading-[0.95] mb-6">
              {legalSettings.contact_title || 'Hablemos.'}
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="text-lg md:text-2xl text-slate-600 font-normal leading-relaxed max-w-2xl mx-auto">
              {legalSettings.contact_subtitle || `Escríbenos a ${brandName} y te responderemos en breve.`}
            </p>
          </Reveal>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 md:px-8 pb-20">
        <div className="grid md:grid-cols-3 gap-5 md:gap-6">
          {[
            { icon: Mail,          label: 'Email',     value: email,   href: `mailto:${email}` },
            { icon: MessageCircle, label: 'WhatsApp',  value: whatsappDisplay || 'No disponible', href: whatsappHref !== '#' ? whatsappHref : undefined },
            { icon: MapPin,        label: 'Oficina',   value: address, href: undefined }
          ].map((item, idx) => (
            <Reveal key={idx} delay={idx * 80}>
              {item.href ? (
                <a href={item.href} target={item.href.startsWith('http') ? '_blank' : undefined} rel="noopener" className="block bg-white border border-slate-200 hover:border-slate-300 hover:shadow-lg rounded-3xl p-7 transition-all h-full hover:-translate-y-1">
                  <div className="h-11 w-11 bg-lime-100 text-slate-950 rounded-xl flex items-center justify-center mb-5">
                    <item.icon size={20} strokeWidth={2.2} />
                  </div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{item.label}</p>
                  <p className="text-lg font-bold text-slate-950 tracking-tight break-words">{item.value}</p>
                </a>
              ) : (
                <div className="bg-white border border-slate-200 rounded-3xl p-7 h-full">
                  <div className="h-11 w-11 bg-lime-100 text-slate-950 rounded-xl flex items-center justify-center mb-5">
                    <item.icon size={20} strokeWidth={2.2} />
                  </div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{item.label}</p>
                  <p className="text-lg font-bold text-slate-950 tracking-tight">{item.value}</p>
                </div>
              )}
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  )
}