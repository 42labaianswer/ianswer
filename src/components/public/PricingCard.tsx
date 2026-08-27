 

// ============================================================================
// src/components/public/PricingCard.tsx
// ----------------------------------------------------------------------------
// Card de plan con paleta nueva (emerald + stone). Altura uniforme. El plan
// destacado va con border gradient emerald, NO con scale (para no romper grid).
// Botón al fondo siempre.
// ============================================================================

import Link from 'next/link'
import { Check, ArrowRight } from 'lucide-react'

interface PricingCardProps {
  name: string
  description: string
  priceMonthly: number
  priceYearly?: number
  currency?: string
  features: string[]
  cta: { text: string; href: string }
  highlighted?: boolean
  badgeText?: string
  billing?: 'monthly' | 'yearly'
  trialDays?: number
}

export default function PricingCard({
  name,
  description,
  priceMonthly,
  priceYearly,
  currency = 'MXN',
  features,
  cta,
  highlighted = false,
  badgeText = 'Mejor opción',
  billing = 'monthly',
  trialDays
}: PricingCardProps) {
  const displayPrice = billing === 'yearly' && priceYearly ? Math.round(priceYearly / 12) : priceMonthly
  const yearlyTotal = priceYearly && billing === 'yearly' ? priceYearly : null

  return (
    <div className={`relative h-full rounded-3xl p-7 md:p-8 flex flex-col transition-all ${
      highlighted
        ? 'bg-stone-950 text-white shadow-2xl shadow-emerald-500/20 border-2 border-emerald-500'
        : 'bg-white border border-stone-200 text-stone-900 hover:shadow-xl hover:border-stone-300'
    }`}>

      {/* Badge "Mejor opción" */}
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <span className="px-4 py-1 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-[0.15em] rounded-full shadow-lg shadow-emerald-500/40 whitespace-nowrap">
            ✦ {badgeText}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h3 className={`text-xl font-black tracking-tight mb-2 ${highlighted ? 'text-white' : 'text-stone-900'}`}>
          {name}
        </h3>
        <p className={`text-sm font-medium leading-relaxed ${highlighted ? 'text-stone-300' : 'text-stone-500'}`}>
          {description}
        </p>
      </div>

      {/* Precio */}
      <div className={`mb-6 pb-6 border-b border-dashed ${highlighted ? 'border-stone-700' : 'border-stone-200'}`}>
        <div className="flex items-baseline gap-1">
          <span className={`text-sm font-bold ${highlighted ? 'text-stone-400' : 'text-stone-500'}`}>$</span>
          <span className={`text-5xl font-black tracking-tight ${highlighted ? 'text-white' : 'text-stone-900'}`}>
            {displayPrice.toLocaleString('es-MX')}
          </span>
          <span className={`text-sm font-bold ${highlighted ? 'text-stone-400' : 'text-stone-500'}`}>
            /mes
          </span>
        </div>
        <p className={`text-xs font-medium mt-1.5 ${highlighted ? 'text-stone-400' : 'text-stone-500'}`}>
          {billing === 'yearly' && yearlyTotal
            ? `${yearlyTotal.toLocaleString('es-MX')} ${currency}/año facturado anualmente`
            : `${currency} facturado mensualmente`
          }
        </p>
      </div>

      {/* Features con flex-1 → botón al fondo */}
      <div className="flex-1 space-y-3 mb-7">
        {features.map((feature, idx) => (
          <div key={idx} className="flex items-start gap-2.5">
            <div className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
              highlighted ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
            }`}>
              <Check size={12} strokeWidth={3} />
            </div>
            <p className={`text-sm font-medium leading-relaxed ${highlighted ? 'text-stone-200' : 'text-stone-700'}`}>
              {feature}
            </p>
          </div>
        ))}
      </div>

      {/* CTA fondo */}
      <Link
        href={cta.href}
        className={`block w-full text-center px-5 py-3 rounded-2xl font-black text-sm transition-all ${
          highlighted
            ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/40'
            : 'bg-stone-900 text-white hover:bg-stone-800'
        }`}
      >
        {cta.text}
        <ArrowRight size={14} className="inline ml-1.5 -mt-0.5" />
      </Link>

      {/* Trial note */}
      {trialDays && (
        <p className={`text-center text-[11px] font-bold uppercase tracking-wider mt-3 ${highlighted ? 'text-stone-400' : 'text-stone-500'}`}>
          {trialDays} días gratis · sin tarjeta
        </p>
      )}
    </div>
  )
}
