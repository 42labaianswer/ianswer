 

'use client'

// ============================================================================
// src/components/AddonTile.tsx — v2 estilo Wix App Market
// ----------------------------------------------------------------------------
// Card horizontal: icono grande con fondo sólido a la izquierda + nombre y
// pequeña intro a la derecha. Badge de estado arriba a la derecha.
// Click → abre AddonDetailModal con info completa.
// ============================================================================

import { Check } from 'lucide-react'
import { getIcon } from '../lib/iconMap'

interface AddonTileProps {
  addon: {
    id: string
    name: string
    short_name?: string | null
    description: string | null
    category: string
    icon: string
    requires_template?: string | null
    is_featured?: boolean
  }
  isActive: boolean
  onClick: () => void
}

// ─── Paletas sólidas (no gradientes) ──────────────────────────────────────
// Cada paleta define el COLOR DEL BLOQUE del ícono y el color del ícono.
// El ícono va en blanco siempre, sobre fondo de color saturado.

const TEMPLATE_PALETTE: Record<string, { bg: string }> = {
  health:           { bg: 'bg-rose-500' },
  real_estate:      { bg: 'bg-blue-600' },
  restaurant:       { bg: 'bg-orange-500' },
  marketing_agency: { bg: 'bg-violet-600' }
}

const CATEGORY_PALETTE: Record<string, { bg: string }> = {
  channel:  { bg: 'bg-sky-500' },
  ai:       { bg: 'bg-violet-600' },
  feature:  { bg: 'bg-emerald-600' },
  service:  { bg: 'bg-amber-500' },
  support:  { bg: 'bg-rose-500' },
  capacity: { bg: 'bg-blue-600' }
}

function getPalette(addon: AddonTileProps['addon']) {
  if (addon.requires_template && TEMPLATE_PALETTE[addon.requires_template]) {
    return TEMPLATE_PALETTE[addon.requires_template]
  }
  return CATEGORY_PALETTE[addon.category] || CATEGORY_PALETTE.feature
}

// Genera una "intro" corta a partir de la descripción (primera oración o ~60 chars)
function getIntro(description: string | null | undefined): string {
  if (!description) return ''
  // Primera oración hasta el punto
  const firstSentence = description.split(/[.\n]/)[0].trim()
  if (firstSentence.length <= 90) return firstSentence
  return firstSentence.slice(0, 85).trim() + '…'
}

export default function AddonTile({ addon, isActive, onClick }: AddonTileProps) {
  const Icon = getIcon(addon.icon)
  const palette = getPalette(addon)
  const displayName = addon.short_name || addon.name
  const intro = getIntro(addon.description)

  return (
    <button
      type="button"
      onClick={onClick}
      className="
        group relative text-left
        bg-white border border-slate-200
        hover:border-slate-300 hover:shadow-md
        rounded-2xl p-5
        transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2
        w-full h-full flex flex-col
      "
    >
      {/* Header: ícono grande + badge */}
      <div className="flex items-start justify-between gap-3 mb-4">
        {/* Ícono cuadrado con fondo de color sólido */}
        <div
          className={`
            ${palette.bg}
            h-14 w-14 md:h-16 md:w-16
            rounded-2xl
            flex items-center justify-center
            shadow-sm
            shrink-0
            transition-transform duration-200
            group-hover:scale-105
          `}
        >
          <Icon
            size={28}
            strokeWidth={2.2}
            className="text-white"
          />
        </div>

        {/* Badge estado */}
        {isActive ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Check size={10} strokeWidth={3} /> Activo
          </span>
        ) : addon.is_featured ? (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-50 text-slate-700 border border-slate-200">
            Recomendado
          </span>
        ) : null}
      </div>

      {/* Nombre */}
      <h3 className="text-base font-black text-slate-950 tracking-tight leading-tight mb-1.5">
        {displayName}
      </h3>

      {/* Intro corta (1-2 líneas) */}
      <p className="text-sm text-slate-600 font-medium leading-snug line-clamp-2">
        {intro}
      </p>
    </button>
  )
}
