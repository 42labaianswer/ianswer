 

'use client'

// ============================================================================
// src/app/dashboard/properties/page.tsx
// ----------------------------------------------------------------------------
// Solo verifica modules.properties del template instalado.
// Si la industria no incluye propiedades, el sidebar tampoco muestra el tab
// (así que en la práctica esta página solo se carga si modules.properties = true).
// ============================================================================

import { useWorkspace } from '../../../components/WorkspaceContext'
import PropertiesContent from './PropertiesContent'
import { Home } from 'lucide-react'

export default function PropertiesPage() {
  const { modules, isLoadingWorkspace } = useWorkspace()

  if (isLoadingWorkspace) {
    return <div className="p-8 text-slate-400">Cargando...</div>
  }

  if (!modules.properties) {
    return (
      <div className="max-w-2xl mx-auto mt-20 px-6">
        <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 shadow-lg">
          <div className="inline-flex h-16 w-16 bg-slate-100 text-slate-500 rounded-2xl items-center justify-center mb-6">
            <Home size={28} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-3">
            Tu industria no incluye propiedades
          </h1>
          <p className="text-sm text-slate-500 font-medium leading-relaxed">
            Las propiedades son parte de la industria <strong className="text-slate-900">Inmobiliaria</strong>.
            Si necesitas cambiar de industria, escríbenos a soporte.
          </p>
        </div>
      </div>
    )
  }

  return <PropertiesContent />
}
