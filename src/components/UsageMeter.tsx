 

'use client'

// src/components/UsageMeter.tsx
// ----------------------------------------------------------------------------
// Sprint U · Medidor de uso de sesiones (estilo Claude).
//
// Muestra una barra de progreso con las sesiones usadas del mes vs el límite
// del plan. Cambia de color según el % (verde → amarillo → rojo) y muestra
// un CTA de upgrade cuando está cerca o llegó al límite.
//
// Una sesión = ventana de 24h con un contacto (como cobra Meta).
// ----------------------------------------------------------------------------

import { MessageSquare, TrendingUp, AlertTriangle, Calendar } from 'lucide-react'
import { useUsageCurrentMonth } from '../hooks/useBilling'

export default function UsageMeter({
  companyId,
  accentColor = '#4f46e5',
  onUpgrade,
}: {
  companyId: string
  accentColor?: string
  onUpgrade?: () => void
}) {
  const { data: usage, isLoading, error } = useUsageCurrentMonth(companyId)

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 animate-pulse">
        <div className="h-4 bg-slate-100 rounded w-1/3 mb-4" />
        <div className="h-3 bg-slate-100 rounded-full w-full" />
      </div>
    )
  }

  // Antes esto devolvía null y el widget desaparecía sin explicar nada.
  // Si la RPC get_usage_current_month falla o no existe, conviene decirlo:
  // un contador en blanco se confunde con "no has usado nada".
  if (error || !usage) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
            <MessageSquare size={17} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Uso de conversaciones</h3>
            <p className="text-xs text-slate-500">No disponible por ahora</p>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          No se pudo calcular el consumo del mes. Tus conversaciones siguen
          funcionando con normalidad.
        </p>
      </div>
    )
  }

  const { sessions_used, sessions_limit, pct_used, period_end } = usage
  const noLimit = sessions_limit === 0
  const pct = noLimit ? 0 : Math.min(pct_used, 100)
  const remaining = Math.max(sessions_limit - sessions_used, 0)

  // Color según nivel de uso
  const barColor = pct >= 90 ? '#dc2626' : pct >= 70 ? '#f59e0b' : accentColor
  const isNearLimit = pct >= 80
  const isAtLimit = !noLimit && sessions_used >= sessions_limit

  const periodEndDate = new Date(period_end)
  const daysUntilReset = Math.ceil((periodEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: accentColor }}
          >
            <MessageSquare size={17} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Uso de conversaciones</h3>
            <p className="text-xs text-slate-500">Sesiones de 24h por contacto este mes</p>
          </div>
        </div>
        {!noLimit && (
          <div className="text-right">
            <p className="text-2xl font-black" style={{ color: barColor }}>
              {sessions_used.toLocaleString('es-MX')}
            </p>
            <p className="text-[11px] font-bold text-slate-400">de {sessions_limit.toLocaleString('es-MX')}</p>
          </div>
        )}
      </div>

      {noLimit ? (
        <div className="py-3 text-center text-sm text-slate-500">
          Sin límite de conversaciones configurado.
        </div>
      ) : (
        <>
          {/* Barra */}
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, backgroundColor: barColor }}
            />
          </div>

          <div className="flex items-center justify-between text-xs mb-4">
            <span className="font-medium text-slate-600">{pct.toFixed(0)}% usado</span>
            <span className="flex items-center gap-1 text-slate-400">
              <Calendar size={11} /> Se reinicia en {daysUntilReset} {daysUntilReset === 1 ? 'día' : 'días'}
            </span>
          </div>

          {/* Estado / CTA */}
          {isAtLimit ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-bold text-red-900">Llegaste a tu límite mensual</p>
                <p className="text-[11px] text-red-700 mt-0.5">
                  Sube de plan para más conversaciones, o espera al reinicio en {daysUntilReset} {daysUntilReset === 1 ? 'día' : 'días'}.
                </p>
                {onUpgrade && (
                  <button
                    onClick={onUpgrade}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg"
                  >
                    <TrendingUp size={12} /> Subir de plan
                  </button>
                )}
              </div>
            </div>
          ) : isNearLimit ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-bold text-amber-900">Te quedan {remaining.toLocaleString('es-MX')} conversaciones</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Estás cerca de tu límite. Considera subir de plan si esperas más volumen.
                </p>
                {onUpgrade && (
                  <button
                    onClick={onUpgrade}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg"
                  >
                    <TrendingUp size={12} /> Ver planes
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Te quedan <strong className="text-slate-900">{remaining.toLocaleString('es-MX')}</strong> conversaciones este mes.
            </p>
          )}
        </>
      )}
    </div>
  )
}
