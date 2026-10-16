 

'use client'

import { useWorkspace } from '../../../components/WorkspaceContext'
import OrdersContent from './OrdersContent'
import { ClipboardList } from 'lucide-react'

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
          <p className="text-sm text-slate-500 font-medium leading-relaxed">
            Las órdenes son parte de la industria <strong className="text-slate-900">Restaurantes</strong>.
            Si necesitas cambiar de industria, escríbenos a soporte.
          </p>
        </div>
      </div>
    )
  }

  return <OrdersContent />
}
