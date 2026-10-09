'use client'

// ============================================================================
// src/hooks/useUndoableDelete.tsx
// ----------------------------------------------------------------------------
// Borrado diferido con "Deshacer".
//
// Al eliminar, la fila se anima hacia afuera y se oculta de la vista, pero el
// DELETE real no se manda hasta que expira el toast (UNDO_MS). "Deshacer"
// cancela el borrado pendiente y la fila vuelve a su lugar con el mismo id —
// no hay que re-insertar nada.
//
// - Cada borrado tiene su propio timer y su propio toast (varios seguidos OK).
// - Si el componente se desmonta (navegar a otra página), los borrados
//   pendientes se ejecutan en ese momento.
// - Si se cierra/recarga la pestaña, se mandan con fetch `keepalive` directo a
//   PostgREST, que el navegador termina aunque la página ya no exista.
// - Si el DELETE falla, la fila reaparece y se muestra un toast de error.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'

const UNDO_MS = 5000
// Debe coincidir con la duración de la transición de `undoableRowClass`.
const LEAVE_MS = 300

type Phase = 'leaving' | 'hidden'

type Options = {
  /** Tabla de Supabase de donde se borra (`.from(table).delete().eq('id', id)`). */
  table: string
  /** Texto del toast, p. ej. "Tarea eliminada". */
  label: string
  /** Texto del toast si falla el borrado. */
  errorLabel?: string
  /** Se llama tras un borrado exitoso (p. ej. invalidar la query). Si regresa
   *  una promesa, la fila se mantiene oculta hasta que resuelva, para que no
   *  "parpadee" de regreso antes de que llegue la lista nueva. */
  onDeleted?: () => unknown
}

type Pending = { timer: ReturnType<typeof setTimeout>, token: string | null }

export function useUndoableDelete({ table, label, errorLabel, onDeleted }: Options) {
  const [phases, setPhases] = useState<Record<string, Phase>>({})
  const pending = useRef(new Map<string, Pending>())
  // Refs para que los callbacks de timers/cleanup vean siempre la versión actual.
  const onDeletedRef = useRef(onDeleted)
  useEffect(() => { onDeletedRef.current = onDeleted }, [onDeleted])

  const setPhase = useCallback((id: string, phase: Phase | null) => {
    setPhases(prev => {
      const next = { ...prev }
      if (phase) next[id] = phase
      else delete next[id]
      return next
    })
  }, [])

  const commit = useCallback(async (id: string) => {
    pending.current.delete(id)
    toast.dismiss(`undo-${id}`)
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) {
      setPhase(id, null)
      toast.error(errorLabel || 'No se pudo eliminar. Intenta de nuevo.')
      return
    }
    await onDeletedRef.current?.()
    setPhase(id, null)
  }, [table, errorLabel, setPhase])

  const undo = useCallback((id: string) => {
    const p = pending.current.get(id)
    if (!p) return
    clearTimeout(p.timer)
    pending.current.delete(id)
    toast.dismiss(`undo-${id}`)
    // Vuelve a montarse colapsada y en el siguiente frame se expande.
    setPhase(id, 'leaving')
    requestAnimationFrame(() => requestAnimationFrame(() => setPhase(id, null)))
  }, [setPhase])

  const remove = useCallback(async (id: string) => {
    if (pending.current.has(id)) return
    setPhase(id, 'leaving')
    setTimeout(() => {
      // Solo ocultar si no se deshizo durante la animación.
      if (pending.current.has(id)) setPhase(id, 'hidden')
    }, LEAVE_MS)

    const timer = setTimeout(() => { commit(id) }, UNDO_MS)
    pending.current.set(id, { timer, token: null })

    toast(t => (
      <span className="flex items-center gap-3">
        {label}
        <button
          type="button"
          onClick={() => { undo(id); toast.dismiss(t.id) }}
          className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-black uppercase tracking-wider transition-colors"
        >
          Deshacer
        </button>
      </span>
    ), { id: `undo-${id}`, duration: UNDO_MS, position: 'bottom-center' })

    // Token de sesión guardado por adelantado: en `pagehide` ya no hay tiempo
    // de pedirlo de forma asíncrona.
    const { data: { session } } = await supabase.auth.getSession()
    const p = pending.current.get(id)
    if (p) p.token = session?.access_token ?? null
  }, [commit, undo, label, setPhase])

  // Cierre/recarga de pestaña: mandar los pendientes con keepalive.
  useEffect(() => {
    const flushOnUnload = () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!url || !key) return
      pending.current.forEach((p, id) => {
        clearTimeout(p.timer)
        fetch(`${url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE',
          keepalive: true,
          headers: { apikey: key, Authorization: `Bearer ${p.token || key}` }
        }).catch(() => {})
      })
      pending.current.clear()
    }
    window.addEventListener('pagehide', flushOnUnload)
    return () => window.removeEventListener('pagehide', flushOnUnload)
  }, [table])

  // Navegación dentro de la app (desmontaje): ejecutar los pendientes ya.
  useEffect(() => {
    const map = pending.current
    return () => {
      map.forEach((p, id) => {
        clearTimeout(p.timer)
        toast.dismiss(`undo-${id}`)
        supabase.from(table).delete().eq('id', id).then(({ error }) => {
          if (error) toast.error(errorLabel || 'No se pudo eliminar. Intenta de nuevo.')
          else onDeletedRef.current?.()
        })
      })
      map.clear()
    }
  }, [table, errorLabel])

  /** 'leaving' mientras se anima, 'hidden' ya fuera de la vista, undefined si normal. */
  const phaseOf = useCallback((id: string): Phase | undefined => phases[id], [phases])

  return { remove, undo, phaseOf }
}

/** Clases para el contenedor de una fila: colapsa altura + fade out.
 *  El hijo directo debe tener `overflow-hidden min-h-0`. */
export function undoableRowClass(phase: Phase | undefined) {
  return `grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
    phase ? 'grid-rows-[0fr] opacity-0 pointer-events-none' : 'grid-rows-[1fr] opacity-100'
  }`
}
