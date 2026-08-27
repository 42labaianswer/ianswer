 

'use client'
import { Check, Loader2, Sparkles, Crown, Zap } from 'lucide-react'

type PlanCardProps = {
  plan: {
    slug: string
    tier: string | null
    name: string
    description: string | null
    price_monthly_cents: number
    price_yearly_cents: number | null
    max_sessions_per_month: number
    max_team_members: number
    max_channels: number
    max_locations: number
    features: string | null
  }
  isCurrent: boolean
  isRecommended?: boolean
  billingMode?: 'monthly' | 'yearly'
  isLoading?: boolean
  onSelect?: () => void
}

const TIER_BADGES: Record<string, { label: string, icon: any, gradient: string }> = {
  start:  { label: 'Para empezar', icon: Sparkles, gradient: 'from-sky-500 to-blue-600' },
  growth: { label: 'Más vendido',  icon: Zap,      gradient: 'from-violet-600 to-fuchsia-600' },
  scale:  { label: 'Empresarial',  icon: Crown,    gradient: 'from-amber-500 to-orange-600' }
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0
  }).format(cents / 100)
}

export default function PlanCard({
  plan,
  isCurrent,
  isRecommended = false,
  billingMode = 'monthly',
  isLoading = false,
  onSelect
}: PlanCardProps) {
  const tier = plan.tier || plan.slug
  const tierBadge = TIER_BADGES[tier] || TIER_BADGES.start
  const TierIcon = tierBadge.icon

  const monthlyPrice = plan.price_monthly_cents
  const yearlyPrice = plan.price_yearly_cents || (monthlyPrice * 12)
  const displayedPrice = billingMode === 'yearly' ? yearlyPrice / 12 : monthlyPrice
  const yearlyDiscount = plan.price_yearly_cents
    ? Math.round((1 - (plan.price_yearly_cents / (monthlyPrice * 12))) * 100)
    : 0

  const featureLines = (plan.features || '').split('\n').filter(Boolean)

  return (
    <div
      className={`relative bg-white rounded-3xl border-2 p-6 sm:p-8 flex flex-col transition-all ${
        isCurrent
          ? 'border-emerald-500 shadow-2xl shadow-emerald-900/10 ring-4 ring-emerald-500/10'
          : isRecommended
          ? 'border-slate-900 shadow-2xl shadow-slate-900/15 scale-[1.03]'
          : 'border-slate-100 hover:border-slate-300 hover:shadow-xl'
      }`}
    >
      {/* Badge */}
      {(isRecommended || isCurrent) && (
        <div
          className={`absolute -top-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg ${
            isCurrent
              ? 'bg-emerald-500 text-white'
              : `bg-gradient-to-r ${tierBadge.gradient} text-white`
          }`}
        >
          {isCurrent ? (
            <>
              <Check size={12} />
              Tu plan actual
            </>
          ) : (
            <>
              <TierIcon size={11} />
              {tierBadge.label}
            </>
          )}
        </div>
      )}

      {/* Nombre + descripción */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {plan.name}
          </h3>
        </div>
        <p className="text-sm text-slate-500 font-medium leading-relaxed">
          {plan.description}
        </p>
      </div>

      {/* Precio */}
      <div className="mb-6 pb-6 border-b border-slate-100">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">
            {formatPrice(displayedPrice)}
          </span>
          <span className="text-sm font-bold text-slate-500">/ mes</span>
        </div>
        {billingMode === 'yearly' && yearlyDiscount > 0 && (
          <p className="text-[11px] font-bold text-emerald-700 mt-2">
            Ahorras {yearlyDiscount}% pagando anual
          </p>
        )}
      </div>

      {/* Capacidad destacada */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        <div className="text-center p-2 bg-slate-50 rounded-xl">
          <div className="text-base font-black text-slate-900">
            {plan.max_sessions_per_month.toLocaleString('es-MX')}
          </div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Convs/mes</div>
        </div>
        <div className="text-center p-2 bg-slate-50 rounded-xl">
          <div className="text-base font-black text-slate-900">{plan.max_team_members}</div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Usuarios</div>
        </div>
        <div className="text-center p-2 bg-slate-50 rounded-xl">
          <div className="text-base font-black text-slate-900">{plan.max_channels}</div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Canales</div>
        </div>
      </div>

      {/* Features */}
      <div className="flex-1 space-y-2.5 mb-6">
        {featureLines.map((line, idx) => (
          <div key={idx} className="flex items-start gap-2.5">
            <div className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
              <Check size={12} className="text-emerald-700 stroke-[3]" />
            </div>
            <span className="text-sm text-slate-700 font-medium leading-snug">{line}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onSelect}
        disabled={isCurrent || isLoading}
        className={`w-full px-6 py-3.5 font-bold rounded-xl flex items-center justify-center gap-2 text-sm transition-all ${
          isCurrent
            ? 'bg-emerald-50 text-emerald-700 cursor-default'
            : isRecommended
            ? `bg-gradient-to-r ${tierBadge.gradient} text-white shadow-lg hover:shadow-xl hover:scale-[1.02]`
            : 'bg-slate-900 hover:bg-slate-800 text-white'
        }`}
      >
        {isLoading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : isCurrent ? (
          <>
            <Check size={16} />
            Plan actual
          </>
        ) : (
          'Elegir este plan'
        )}
      </button>
    </div>
  )
}
