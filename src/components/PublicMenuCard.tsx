'use client'

// Recuadro "Tu menú en línea" de la pantalla de Menú: el link de la página
// pública (/menu/<id de la empresa>) para copiarlo o abrirlo. La página
// pública es parte del add-on Menú digital; sin él, el recuadro invita a
// activarlo.

import Link from 'next/link'
import toast from 'react-hot-toast'
import { Copy, ExternalLink, Globe, Lock } from 'lucide-react'

export default function PublicMenuCard({ companyId, enabled }: { companyId: string, enabled: boolean }) {
  if (!companyId) return null
  const url = typeof window !== 'undefined' ? `${window.location.origin}/menu/${companyId}` : `/menu/${companyId}`

  if (!enabled) {
    return (
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <Lock size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900">Comparte tu menú en línea</p>
          <p className="text-xs text-slate-500">
            Una página con tus platillos, fotos y precios para mandar por WhatsApp o redes. Viene con el complemento Menú digital.
          </p>
        </div>
        <Link
          href="/dashboard/addons"
          className="shrink-0 inline-flex items-center justify-center px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
        >
          Ver complemento
        </Link>
      </div>
    )
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado')
    } catch {
      toast.error('No se pudo copiar el link')
    }
  }

  return (
    <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
        <Globe size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900">Tu menú en línea</p>
        <p className="text-xs text-slate-500 font-mono truncate">{url}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold"
        >
          <Copy size={13} /> Copiar
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
        >
          <ExternalLink size={13} /> Abrir
        </a>
      </div>
    </div>
  )
}
