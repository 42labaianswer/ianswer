'use client'

// ============================================================================
// src/components/InfoHint.tsx
// ----------------------------------------------------------------------------
// Icono de información que muestra un texto en un globo. Se abre al pasar el
// ratón, con el foco del teclado o con un toque (móvil); se cierra al salir,
// con Escape o tocando fuera.
//
// Uso:
//   <PageHeader title={<>Mi Plan <InfoHint label="Sobre los planes">Texto…</InfoHint></>} />
// ============================================================================

import { useEffect, useId, useRef, useState } from 'react'
import { Info } from 'lucide-react'

interface InfoHintProps {
  /** Nombre accesible del botón. */
  label: string
  children: React.ReactNode
}

const WIDTH = 288
const GUTTER = 16

type Position = { top: number; left: number; width: number }

export default function InfoHint({ label, children }: InfoHintProps) {
  const [pos, setPos] = useState<Position | null>(null)
  const ref = useRef<HTMLSpanElement>(null)
  const id = useId()
  const open = pos !== null

  // Fijo a la ventana y acotado a sus bordes, para que en pantallas de
  // teléfono el globo no quede cortado aunque el icono esté cerca del borde.
  const show = () => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.min(WIDTH, window.innerWidth - GUTTER * 2)
    const left = Math.min(Math.max(rect.left, GUTTER), window.innerWidth - width - GUTTER)
    setPos({ top: rect.bottom + 8, left, width })
  }
  const hide = () => setPos(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) hide()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide() }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [open])

  return (
    <span
      ref={ref}
      className="inline-flex align-middle"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        // Solo abre: el hover o el foco ya lo abrieron y un toggle lo cerraría
        // en el mismo clic. Se cierra al salir, con Escape o tocando fuera.
        onClick={show}
        onFocus={show}
        onBlur={hide}
        className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
      >
        <Info size={16} />
      </button>
      {pos && (
        <span
          id={id}
          role="tooltip"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
          className="fixed z-50 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-medium leading-relaxed text-white shadow-xl tracking-normal"
        >
          {children}
        </span>
      )}
    </span>
  )
}
