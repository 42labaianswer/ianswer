 

'use client'

// ============================================================================
// src/components/MobileSidebarContext.tsx
// ----------------------------------------------------------------------------
// Provee estado open/close del drawer del sidebar en móvil. Envolvemos el
// dashboard entero; el botón hamburger en el header y el Sidebar mismo lo
// consumen.
// ============================================================================

import { createContext, useContext, useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

interface Ctx {
  open: boolean
  setOpen: (v: boolean) => void
  toggle: () => void
}

const MobileSidebarCtx = createContext<Ctx>({
  open: false,
  setOpen: () => {},
  toggle: () => {}
})

export function MobileSidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Cerrar al navegar
  useEffect(() => { setOpen(false) }, [pathname])

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Bloquear scroll del body cuando está abierto
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <MobileSidebarCtx.Provider value={{ open, setOpen, toggle: () => setOpen(!open) }}>
      {children}
    </MobileSidebarCtx.Provider>
  )
}

export function useMobileSidebar() {
  return useContext(MobileSidebarCtx)
}
