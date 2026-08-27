 

'use client'

// ============================================================================
// src/components/public/ScrollReveal.tsx
// ----------------------------------------------------------------------------
// Animación de entrada cuando el elemento aparece en viewport. Usa
// IntersectionObserver, sin dependencias externas, sin parpadeos.
// ============================================================================

import { useEffect, useRef, useState, type ReactNode } from 'react'

type Direction = 'up' | 'down' | 'left' | 'right' | 'fade'

interface Props {
  children: ReactNode
  delay?: number       // ms
  duration?: number    // ms
  direction?: Direction
  className?: string
  /** Si true, se anima cada vez que entra al viewport (default: una sola vez) */
  repeat?: boolean
  /** Cuánto debe estar visible antes de disparar (0–1) */
  threshold?: number
}

const TRANSFORMS: Record<Direction, string> = {
  up:    'translate-y-8',
  down:  '-translate-y-8',
  left:  'translate-x-8',
  right: '-translate-x-8',
  fade:  ''
}

export default function ScrollReveal({
  children,
  delay = 0,
  duration = 700,
  direction = 'up',
  className = '',
  repeat = false,
  threshold = 0.15
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Si el usuario prefiere reduced motion, mostrar directo sin animar
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          if (!repeat) observer.disconnect()
        } else if (repeat) {
          setVisible(false)
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [repeat, threshold])

  return (
    <div
      ref={ref}
      style={{
        transitionDelay:  `${delay}ms`,
        transitionDuration: `${duration}ms`
      }}
      className={`transition-all ease-out will-change-transform ${
        visible
          ? 'opacity-100 translate-x-0 translate-y-0'
          : `opacity-0 ${TRANSFORMS[direction]}`
      } ${className}`}
    >
      {children}
    </div>
  )
}
