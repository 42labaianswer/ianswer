 

'use client'

// ============================================================================
// src/components/PageHeader.tsx
// ----------------------------------------------------------------------------
// Header consistente para todas las pages del dashboard. Coincide visualmente
// con el header del módulo CRM: eyebrow opcional, título grande, descripción
// y slot de acciones a la derecha.
//
// Uso:
//   <PageHeader
//     title="Reportes"
//     description="Métricas y KPIs en tiempo real."
//     actions={<button>+ Crear reporte</button>}
//   />
//
// IMPORTANTE: Diseñado para "escapar" del padding del MainContainer (-mx-8 -mt-6)
// y ocupar full-width. Después aplica su propio padding interno.
// ============================================================================

interface PageHeaderProps {
  eyebrow?: string
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}

export default function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-6 mb-4 md:mb-6 px-4 md:px-8 py-4 md:py-5 bg-white border-b border-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
              {eyebrow}
            </p>
          )}
          <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="text-xs md:text-sm text-slate-500 font-medium mt-0.5">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
