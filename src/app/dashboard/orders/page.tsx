 

'use client'

import { useWorkspace } from '../../../components/WorkspaceContext'
import OrdersContent from './OrdersContent'
import { ClipboardList, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export default function OrdersPage() {
  const { modules, isLoadingWorkspace } = useWorkspace()

  if (isLoadingWorkspace) {
    return <div className="p-8 text-slate-400">Cargando...</div>
  }

  // Las órdenes son parte del módulo "menu" (restaurantes)
  if (!modules.menu) {
    return (
      <div className="max-w-2xl mx-auto mt-20 px-6">
        <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 shadow-lg">
          <div className="inline-flex h-16 w-16 bg-slate-100 text-slate-500 rounded-2xl items-center justify-center mb-6">
            <ClipboardList size={28} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-3">
            Tu industria no incluye órdenes
          </h1>
          <p className="text-sm text-slate-500 font-medium mb-8 leading-relaxed">
            Las órdenes son parte de la industria <strong className="text-slate-900">Restaurantes</strong>.
            Cámbiate a esa industria desde Industrias para empezar a recibir pedidos.
          </p>
          <Link
            href="/dashboard/templates"
            className="inline-flex items-center gap-2 px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors"
          >
            Ver industrias
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    )
  }

  return <OrdersContent />
}
