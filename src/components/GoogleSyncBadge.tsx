'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import type { CalendarEvent } from '../lib/calendarCache'

type Props = {
  event: CalendarEvent
  /** Se llama cuando el reintento quedó en cola, para refrescar el calendario. */
  onRetried: () => void
}

/** Estado de la cita mientras se guarda y se sincroniza con Google Calendar. */
export default function GoogleSyncBadge({ event, onRetried }: Props) {
  const [retrying, setRetrying] = useState(false)

  if (event.optimistic) {
    return (
      <p className="text-[10px] font-bold text-slate-500 mt-1.5 flex items-center gap-1">
        <Loader2 size={11} className="animate-spin" /> Guardando...
      </p>
    )
  }

  if (event.googleSync === 'pending') {
    return (
      <p className="text-[10px] font-bold text-slate-500 mt-1.5 flex items-center gap-1">
        <Loader2 size={11} className="animate-spin" /> Sincronizando con Google Calendar
      </p>
    )
  }

  if (event.googleSync === 'failed' && event.appointmentId) {
    const retry = async () => {
      setRetrying(true)
      try {
        const res = await fetch(`/api/appointments/${event.appointmentId}/sync`, { method: 'POST' })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json?.success) throw new Error(json?.error || 'No se pudo reintentar')
        onRetried()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No se pudo reintentar')
      } finally {
        setRetrying(false)
      }
    }
    return (
      <p className="text-[10px] font-bold text-amber-700 mt-1.5 flex items-center gap-1 flex-wrap">
        <AlertTriangle size={11} /> No se pudo pasar a Google Calendar.
        <button
          type="button"
          onClick={retry}
          disabled={retrying}
          className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-amber-900 disabled:opacity-50"
        >
          <RefreshCw size={10} className={retrying ? 'animate-spin' : ''} /> Reintentar
        </button>
      </p>
    )
  }

  return null
}
