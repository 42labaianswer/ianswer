 

'use client'

// ============================================================================
// src/lib/scrollReveal.tsx
// ----------------------------------------------------------------------------
// Componente <Reveal> que aplica animación fade-in + slide-up cuando entra
// al viewport. Usa Intersection Observer (no necesita framer-motion).
//
// Uso:
//   <Reveal>           ← fade-up básico
//     <h2>Hola</h2>
//   </Reveal>
//
//   <Reveal delay={150} direction="left">  ← entra desde la izquierda con delay
//     <Card />
//   </Reveal>
// ============================================================================

import { useEffect, useRef, useState, ReactNode } from 'react'

interface RevealProps {
  children: ReactNode
  delay?: number                         // ms de retraso (para escalonar)
  direction?: 'up' | 'down' | 'left' | 'right' | 'none'
  className?: string
  threshold?: number                     // 0..1, cuándo dispara (default 0.15)
  once?: boolean                         // true = solo una vez (default true)
  as?: 'div' | 'section' | 'article' | 'span'
}

export default function Reveal({
  children,
  delay = 0,
  direction = 'up',
  className = '',
  threshold = 0.15,
  once = true,
  as = 'div'
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Si el usuario tiene prefers-reduced-motion, mostrar todo de una
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (delay > 0) {
            setTimeout(() => setVisible(true), delay)
          } else {
            setVisible(true)
          }
          if (once) observer.unobserve(el)
        } else if (!once) {
          setVisible(false)
        }
      },
      { threshold, rootMargin: '0px 0px -50px 0px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [delay, threshold, once])

  // Vectores de translate inicial según dirección
  const hiddenTransform: Record<string, string> = {
    up:    'translate3d(0, 24px, 0)',
    down:  'translate3d(0, -24px, 0)',
    left:  'translate3d(-24px, 0, 0)',
    right: 'translate3d(24px, 0, 0)',
    none:  'translate3d(0, 0, 0)'
  }

  const style: React.CSSProperties = {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translate3d(0,0,0)' : hiddenTransform[direction],
    transition: 'opacity 700ms cubic-bezier(0.22, 1, 0.36, 1), transform 700ms cubic-bezier(0.22, 1, 0.36, 1)',
    willChange: visible ? 'auto' : 'opacity, transform'
  }

  const Tag = as as any
  return (
    <Tag ref={ref} className={className} style={style}>
      {children}
    </Tag>
  )
}
