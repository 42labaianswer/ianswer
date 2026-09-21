// ============================================================================
// components/IAnswerLoader.tsx
// ----------------------------------------------------------------------------
// Loader de marca para pantallas/secciones de carga que TARDAN (dashboard
// cargando, tabs de admin, login/recuperar contraseña, listas, etc). No es un
// reemplazo de los spinners de botón/acción rápida ("Guardando...",
// "Enviando...", "Conectando...") — esos se quedan con
// <Loader2 className="animate-spin" /> de lucide-react, tal como estaban.
//
// Animación: el punto de la "i" orbita alrededor de la asta (como pidió Roy),
// una vuelta completa en loop. La asta se queda fija.
//
// Colores tomados de la guía de marca (docs/identidad de la marca/README.md):
//   - variant="light" (default, fondo claro): punto #5B2BE8, asta #14162B
//   - variant="dark" (fondo Ink / oscuro):     punto #8B6BFF, asta #FFFFFF
// ============================================================================

interface IAnswerLoaderProps {
  /** Tamaño en px del símbolo. Equivalente a los w-8/w-10 que reemplaza. */
  size?: number
  /** 'light' para fondo claro (default), 'dark' para fondo Ink/oscuro. */
  variant?: 'light' | 'dark'
  /** Texto opcional debajo del símbolo, ej. "Cargando contactos..." */
  label?: string
  className?: string
}

export default function IAnswerLoader({
  size = 40,
  variant = 'light',
  label,
  className = '',
}: IAnswerLoaderProps) {
  const dotColor  = variant === 'dark' ? '#8B6BFF' : '#5B2BE8'
  const stemColor = variant === 'dark' ? '#FFFFFF' : '#14162B'

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${className}`}
      role="status"
      aria-live="polite"
    >
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <rect x="38" y="40" width="24" height="48" rx="12" fill={stemColor} />
        <circle cx="50" cy="21" r="11" fill={dotColor}>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 50 64"
            to="-360 50 64"
            dur="1.6s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
      {label && (
        <p className={`text-xs font-bold uppercase tracking-widest ${variant === 'dark' ? 'text-white/60' : 'text-slate-400'}`}>
          {label}
        </p>
      )}
      <span className="sr-only">Cargando…</span>
    </div>
  )
}
