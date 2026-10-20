// ============================================================================
// components/IAnswerLoader.tsx
// ----------------------------------------------------------------------------
// Loader de marca para pantallas/secciones de carga que TARDAN (dashboard
// cargando, tabs de admin, login/recuperar contraseña, listas, etc). No sustituye
// a los spinners de botón/acción rápida ("Guardando...", "Enviando...",
// "Conectando...") — esos usan <Loader2 className="animate-spin" /> de
// lucide-react.
//
// Animación: el punto de la "i" da una vuelta alrededor de la asta con
// aceleración/frenado y una estela, aterriza arriba (la asta se comprime un
// poco) y hace una pausa breve antes de repetir.
//
// Colores tomados de la guía de marca (docs/identidad de la marca/README.md):
//   - variant="light" (default, fondo claro): punto #5B2BE8, asta #14162B
//   - variant="dark" (fondo Ink / oscuro):     punto #8B6BFF, asta #FFFFFF
// ============================================================================

// Duración del ciclo completo: ~72% vuelta con aceleración/frenado, el resto
// es el aterrizaje sobre la asta y una pausa breve.
const CYCLE = 2

const TRAIL = [
  { delay: 0.04, r: 9.5, opacity: 0.45 },
  { delay: 0.08, r: 8,   opacity: 0.28 },
  { delay: 0.12, r: 6.5, opacity: 0.15 },
]

function OrbitRotation({ delay }: { delay: number }) {
  return (
    <animateTransform
      attributeName="transform"
      type="rotate"
      values="0 50 64;-360 50 64;-360 50 64"
      keyTimes="0;0.72;1"
      calcMode="spline"
      keySplines="0.65 0 0.35 1;0 0 1 1"
      begin={`${delay}s`}
      dur={`${CYCLE}s`}
      repeatCount="indefinite"
    />
  )
}

interface IAnswerLoaderProps {
  /** Tamaño en px del símbolo. Equivale a w-8/w-10 de Tailwind (32/40). */
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
      {/* El viewBox abarca la órbita completa del punto (centro 50,64, radio 43,
          más el radio del punto) para que no se recorte al pasar por abajo. */}
      <svg width={size} height={size} viewBox="-8 6 116 116" fill="none" aria-hidden="true">
        <rect x="38" y="40" width="24" height="48" rx="12" fill={stemColor}>
          {/* La asta se comprime al "aterrizar" el punto */}
          <animate
            attributeName="y"
            values="40;40;45;40"
            keyTimes="0;0.72;0.8;1"
            dur={`${CYCLE}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="height"
            values="48;48;43;48"
            keyTimes="0;0.72;0.8;1"
            dur={`${CYCLE}s`}
            repeatCount="indefinite"
          />
        </rect>
        <g>
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0;0 0;0 5;0 0"
            keyTimes="0;0.72;0.8;1"
            dur={`${CYCLE}s`}
            repeatCount="indefinite"
          />
          {/* Estela: copias más pequeñas y tenues que siguen al punto con retraso.
              Solo se separan del punto mientras gira; en reposo quedan debajo. */}
          {TRAIL.map(({ delay, r, opacity }) => (
            <circle key={delay} cx="50" cy="21" r={r} fill={dotColor} opacity={opacity}>
              <OrbitRotation delay={delay} />
            </circle>
          ))}
          <circle cx="50" cy="21" r="11" fill={dotColor}>
            <OrbitRotation delay={0} />
          </circle>
        </g>
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
