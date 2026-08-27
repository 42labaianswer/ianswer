 

'use client'

// ============================================================================
// src/components/AppGate.tsx · Sprint S2
// ----------------------------------------------------------------------------
// Componente para envolver páginas de apps. Si la company no tiene la app
// instalada (o el sistema viejo no la marca activa), muestra paywall.
//
// Uso:
//   <AppGate appId="propiedades" legacyFallback={modules.properties}>
//     <PropertiesPage />
//   </AppGate>
//
// Si la query de useInstalledApps aún carga, muestra skeleton.
// Si tampoco está en el modelo viejo, muestra Paywall con link al marketplace.
// ============================================================================

import { ReactNode } from 'react'
import Link from 'next/link'
import { Sparkles, Lock } from 'lucide-react'
import { useInstalledApps, useHasNewAppsModel } from '../hooks/useInstalledApps'
import { type AppId } from '../types/apps'

type AppGateProps = {
  appId: AppId
  /** Valor del modelo viejo (modules.X o features.X). Solo se usa si el nuevo modelo no tiene data. */
  legacyFallback?: boolean
  /** Nombre humano de la app para mostrar en el paywall. Si no, usa el appId. */
  appName?: string
  children: ReactNode
}

export default function AppGate({
  appId,
  legacyFallback = false,
  appName,
  children,
}: AppGateProps) {
  const { data: apps, isLoading } = useInstalledApps()
  const hasNewModel = useHasNewAppsModel()

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-3">
          <div className="h-6 w-48 bg-slate-200 rounded" />
          <div className="h-32 w-full bg-slate-100 rounded-xl" />
        </div>
      </div>
    )
  }

  const hasAppNew = apps?.[appId] === true
  const isAllowed = hasNewModel ? hasAppNew : legacyFallback

  if (isAllowed) {
    return <>{children}</>
  }

  return <AppPaywall appId={appId} appName={appName ?? appId} />
}

// ----------------------------------------------------------------------------
// Paywall: bloqueo visual + CTA al marketplace
// ----------------------------------------------------------------------------

function AppPaywall({ appId, appName }: { appId: AppId; appName: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <div className="max-w-md w-full bg-white border-2 border-slate-200 rounded-3xl p-10 text-center shadow-sm">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-6">
          <Lock className="text-white" size={28} />
        </div>

        <h2 className="text-2xl font-black tracking-tight text-slate-900 mb-2">
          Esta app no está instalada
        </h2>

        <p className="text-slate-500 leading-relaxed mb-8">
          La app <strong className="text-slate-900 capitalize">{appName.replace('_', ' ')}</strong>{' '}
          no está activa en tu cuenta. Instálala desde el marketplace para empezar a usarla.
        </p>

        <Link
          href="/dashboard/marketplace"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors"
        >
          <Sparkles size={18} />
          Ir al marketplace
        </Link>

        <div className="mt-6 text-xs text-slate-400 font-mono">app_id: {appId}</div>
      </div>
    </div>
  )
}
