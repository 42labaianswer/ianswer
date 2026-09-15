
'use client'

import { useState, useCallback, useRef, useMemo } from 'react'
import ConfirmModal from '../components/ConfirmModal'

type ConfirmOptions = {
  title?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

// Reemplazo drop-in para window.confirm()/alert() nativos, pero con el
// modal propio de la plataforma. Uso:
//   const { confirm, ConfirmDialog } = useConfirm()
//   if (!(await confirm('¿Eliminar este contacto?'))) return
//   ...
//   return <>{ContenidoDelComponente}{ConfirmDialog}</>
export function useConfirm() {
  const [state, setState] = useState<{ message: string; options: ConfirmOptions } | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((message: string, options: ConfirmOptions = {}) => {
    setState({ message, options })
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const handleConfirm = useCallback(() => {
    resolver.current?.(true)
    resolver.current = null
    setState(null)
  }, [])

  const handleCancel = useCallback(() => {
    resolver.current?.(false)
    resolver.current = null
    setState(null)
  }, [])

  const ConfirmDialog = useMemo(() => (
    <ConfirmModal
      isOpen={!!state}
      message={state?.message || ''}
      title={state?.options.title}
      confirmText={state?.options.confirmText}
      cancelText={state?.options.cancelText}
      danger={state?.options.danger}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ), [state, handleConfirm, handleCancel])

  return { confirm, ConfirmDialog }
}
