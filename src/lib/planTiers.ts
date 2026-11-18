// Ícono y frase de cada plan en Mi Plan. El color no cambia por plan: todo usa
// el acento de la industria (--ia-accent), igual que el resto del dashboard.

import { Crown, Leaf, Sparkles, Zap, type LucideIcon } from 'lucide-react'

export type TierInfo = { tagline: string; icon: LucideIcon }

const TIERS: Record<string, TierInfo> = {
  lite:   { tagline: 'Para arrancar', icon: Leaf },
  start:  { tagline: 'Para empezar', icon: Sparkles },
  growth: { tagline: 'Más vendido', icon: Zap },
  scale:  { tagline: 'Empresarial', icon: Crown },
}

export function tierInfo(plan: { tier: string | null; slug: string }): TierInfo {
  return TIERS[plan.tier || plan.slug] || TIERS.start
}
