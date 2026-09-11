
'use client'

import { AlertTriangle, Loader2 } from 'lucide-react'

export type ConfirmModalProps = {
  isOpen: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  isPending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// Modal de confirmación genérico para reemplazar los confirm()/alert() nativos
// del navegador en toda la plataforma. Estilo alineado con CancelDialog.
export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  danger = false,
  isPending = false,
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget && !isPending) onCancel() }}
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-5 flex items-start gap-3">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${danger ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-700'}`}>
            <AlertTriangle size={20} />
          </div>
          <div className="pt-1">
            {title && <h2 className="text-lg font-black text-slate-900">{title}</h2>}
            <p className="text-sm text-slate-600 mt-1 font-medium leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-40"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className={`px-6 py-2.5 text-white text-sm font-black rounded-xl shadow-md disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all ${danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 hover:bg-slate-800'}`}
          >
            {isPending ? <><Loader2 size={16} className="animate-spin" /> Procesando...</> : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
