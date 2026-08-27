 

'use client'

// src/components/BatchPublishBar.tsx
// ----------------------------------------------------------------------------
// Sprint AK · Barra flotante de acciones en lote (batch) — mejorada.
//
// Ahora incluye: seleccionar todo, publicar, despublicar y borrar.
// Se usa tanto en menú como en propiedades.
// ----------------------------------------------------------------------------

import { useState } from 'react'
import { Eye, EyeOff, X, Loader2, CheckCircle2, Trash2, CheckSquare, AlertTriangle } from 'lucide-react'

export default function BatchPublishBar({
  count,
  totalCount,
  allSelected,
  onPublish,
  onUnpublish,
  onDelete,
  onSelectAll,
  onClear,
  isWorking = false,
  accentColor = '#10b981',
  publishLabel = 'Publicar',
  unpublishLabel = 'Despublicar',
}: {
  count: number
  totalCount?: number
  allSelected?: boolean
  onPublish: () => void
  onUnpublish: () => void
  onDelete?: () => void
  onSelectAll?: () => void
  onClear: () => void
  isWorking?: boolean
  accentColor?: string
  publishLabel?: string
  unpublishLabel?: string
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (count === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-2 bg-slate-900 text-white rounded-2xl shadow-2xl px-4 py-3 border border-slate-700">
        {/* Contador */}
        <div className="flex items-center gap-2 pr-2 border-r border-slate-700">
          <div className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-black" style={{ backgroundColor: accentColor }}>
            {count}
          </div>
          <span className="text-sm font-medium whitespace-nowrap hidden sm:inline">
            {count === 1 ? 'seleccionado' : 'seleccionados'}
          </span>
        </div>

        {/* Seleccionar todo */}
        {onSelectAll && totalCount !== undefined && (
          <button
            onClick={onSelectAll}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <CheckSquare size={14} />
            {allSelected ? 'Ninguno' : `Todos (${totalCount})`}
          </button>
        )}

        {confirmDelete ? (
          <div className="flex items-center gap-2 pl-1">
            <AlertTriangle size={15} className="text-amber-400" />
            <span className="text-xs font-medium whitespace-nowrap">¿Borrar {count}?</span>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-700 hover:bg-slate-600"
            >
              No
            </button>
            <button
              onClick={() => { onDelete?.(); setConfirmDelete(false) }}
              disabled={isWorking}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {isWorking ? <Loader2 size={13} className="animate-spin" /> : 'Sí, borrar'}
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={onPublish}
              disabled={isWorking}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: accentColor }}
            >
              {isWorking ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
              <span className="hidden sm:inline">{publishLabel}</span>
            </button>

            <button
              onClick={onUnpublish}
              disabled={isWorking}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold bg-slate-700 hover:bg-slate-600 disabled:opacity-50 transition-colors"
            >
              <EyeOff size={15} />
              <span className="hidden sm:inline">{unpublishLabel}</span>
            </button>

            {onDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={isWorking}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold bg-red-600/90 hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                <Trash2 size={15} />
                <span className="hidden sm:inline">Borrar</span>
              </button>
            )}

            <button
              onClick={onClear}
              className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
              title="Deseleccionar todo"
            >
              <X size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export function PublishDot({ published }: { published: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1"
      title={published ? 'Publicado' : 'Borrador (no visible al público)'}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${published ? 'bg-emerald-500' : 'bg-slate-300'}`} />
    </span>
  )
}

export function PublishBadge({ published }: { published: boolean }) {
  if (published) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-wider">
        <CheckCircle2 size={11} /> Publicado
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-wider">
      Borrador
    </span>
  )
}
