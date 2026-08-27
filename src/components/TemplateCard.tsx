 

'use client'
import {
  Stethoscope, Home, Utensils, Megaphone, Sparkles,
  CheckCircle2, Loader2, Star
} from 'lucide-react'

const TEMPLATE_ICONS: Record<string, any> = {
  Stethoscope, Home, Utensils, Megaphone, Sparkles
}

type TemplateCardProps = {
  template: {
    id: string
    name: string
    description: string | null
    icon: string
    theme_color: string
    accent_color: string
    is_generic: boolean
  }
  isInstalled: boolean
  isPrimary: boolean
  isLoading?: boolean
  onInstall?: () => void
  onMakePrimary?: () => void
  onUninstall?: () => void
}

/**
 * Convierte un hex → tokens pastel para mantener la estética sutil de Conectividad
 * (bg-{color}-50 con border-slate-100 y text-{color}-600).
 */
function colorTokens(hex: string) {
  return {
    bg:     `${hex}14`,  // ~8% alpha
    border: `${hex}22`,  // ~13% alpha
    text:   hex
  }
}

export default function TemplateCard({
  template,
  isPrimary,
  isLoading = false,
  onInstall
}: TemplateCardProps) {
  const Icon = TEMPLATE_ICONS[template.icon] || Sparkles
  const tone = colorTokens(template.theme_color)

  return (
    <div className="bg-white rounded-[24px] border border-slate-200 p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition-all flex flex-col">

      {/* Header: icono pastel + badge sutil */}
      <div className="flex items-start justify-between mb-4">
        <div
          className="p-3 rounded-2xl border"
          style={{
            backgroundColor: tone.bg,
            borderColor: tone.border,
            color: tone.text
          }}
        >
          <Icon size={24} strokeWidth={2} />
        </div>
        {isPrimary && (
          <span className="px-2.5 py-1 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wider rounded-full flex items-center gap-1">
            <Star size={9} className="fill-amber-300 text-amber-300" />
            Activa
          </span>
        )}
      </div>

      {/* Título + descripción */}
      <h3 className="font-bold text-slate-900 text-lg mb-2">
        {template.name}
      </h3>
      <p className="text-sm text-slate-500 flex-1 leading-relaxed mb-6">
        {template.description}
      </p>

      {/* CTA */}
      {isPrimary ? (
        <div className="w-full py-2.5 text-sm font-bold rounded-xl border bg-slate-50 text-slate-500 border-slate-200 flex items-center justify-center gap-2">
          <CheckCircle2 size={14} />
          Tu plantilla actual
        </div>
      ) : (
        <button
          type="button"
          onClick={onInstall}
          disabled={isLoading}
          className="w-full py-2.5 text-sm font-bold rounded-xl border bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Cambiando...
            </>
          ) : (
            'Cambiar a esta'
          )}
        </button>
      )}
    </div>
  )
}
