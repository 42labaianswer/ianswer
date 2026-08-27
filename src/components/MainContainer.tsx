 

'use client'

// ============================================================================
// src/components/MainContainer.tsx
// ----------------------------------------------------------------------------
// Wrapper de <main>. Las rutas "full-width" (CRM, Mensajes) van pegadas sin
// padding ni container. El resto del dashboard usa todo el ancho con un padding
// generoso, estilo respond.io.
// ============================================================================

import { usePathname } from 'next/navigation'

const FULL_WIDTH_NO_PADDING = [
  '/dashboard/crm',
  '/dashboard/inbox'
]

export default function MainContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ''
  const isFullWidth = FULL_WIDTH_NO_PADDING.some(r => pathname.startsWith(r))

  if (isFullWidth) {
    return (
      <main className="flex-1 overflow-y-auto bg-slate-50">
        {children}
      </main>
    )
  }

  // Resto del dashboard: full-width con padding responsive
  return (
    <main className="flex-1 overflow-y-auto px-4 md:px-8 pb-8 pt-4 md:pt-6">
      {children}
    </main>
  )
}
