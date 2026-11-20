'use client'

// Consumo del periodo de cobro: respuestas de IA, recordatorios y mensajes de
// marketing contra lo que incluye el plan (más add-ons). Las métricas sin
// límite en el plan no se muestran.

import type { ReactNode } from 'react'
import { AlertTriangle, Calendar, Gauge, TrendingUp } from 'lucide-react'
import { useUsageSummary } from '../hooks/useBilling'
import { USAGE_METRICS, daysUntil, meterState, type MeterLevel } from '../lib/usageSummary'

const BAR: Record<MeterLevel, string> = {
  ok: 'bg-(--ia-accent)',
  near: 'bg-amber-500',
  full: 'bg-red-600',
}

const n = (v: number) => v.toLocaleString('es-MX')

export default function UsageMeter({ companyId, onUpgrade }: { companyId: string; onUpgrade?: () => void }) {
  const { data: usage, isLoading, error } = useUsageSummary(companyId)

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 animate-pulse">
        <div className="h-4 bg-slate-100 rounded w-1/3 mb-5" />
        <div className="space-y-4">
          <div className="h-3 bg-slate-100 rounded-full w-full" />
          <div className="h-3 bg-slate-100 rounded-full w-full" />
        </div>
      </div>
    )
  }

  // Un medidor en blanco se confundiría con "no has usado nada".
  if (error || !usage) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <Header subtitle="No disponible por ahora" muted />
        <p className="text-xs text-slate-400 mt-3">
          No se pudo calcular el consumo del periodo. Tu asistente sigue funcionando con normalidad.
        </p>
      </div>
    )
  }

  const rows = USAGE_METRICS
    .map(m => ({ ...m, state: meterState(usage.metrics[m.key]) }))
    .filter(r => r.state)
  const days = daysUntil(usage.period_end)
  const resetDate = new Date(usage.period_end).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })
  const full = rows.filter(r => r.state!.level === 'full')
  const near = rows.filter(r => r.state!.level === 'near')

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <Header
        subtitle={
          <span className="inline-flex items-center gap-1">
            <Calendar size={11} /> Se reinicia el {resetDate} ({days === 1 ? 'mañana' : `en ${days} días`})
          </span>
        }
      />

      {rows.length === 0 ? (
        <p className="py-3 text-center text-sm text-slate-500">Tu plan no tiene límites de consumo configurados.</p>
      ) : (
        <div className="mt-5 space-y-4">
          {rows.map(({ key, label, state }) => (
            <div key={key}>
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <span className="text-sm font-bold text-slate-800">{label}</span>
                <span className="text-xs font-bold text-slate-500 tabular-nums">
                  <span className={state!.level === 'full' ? 'text-red-600' : 'text-slate-900'}>{n(state!.used)}</span> de {n(state!.limit)}
                </span>
              </div>
              <div
                className="h-2.5 bg-slate-100 rounded-full overflow-hidden"
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={state!.limit}
                aria-valuenow={Math.min(state!.used, state!.limit)}
              >
                <div
                  className={`h-full rounded-full transition-all duration-700 ${BAR[state!.level]}`}
                  style={{ width: `${state!.pct}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] font-medium text-slate-500">
                {state!.level === 'full' ? 'Sin saldo en este periodo' : `Te quedan ${n(state!.remaining)}`}
              </p>
            </div>
          ))}
        </div>
      )}

      {(full.length > 0 || near.length > 0) && (
        <div
          className={`mt-5 rounded-xl border p-3 flex items-start gap-2.5 ${
            full.length ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
          }`}
        >
          <AlertTriangle size={16} className={`shrink-0 mt-0.5 ${full.length ? 'text-red-600' : 'text-amber-600'}`} />
          <div className="flex-1">
            <p className={`text-xs font-bold ${full.length ? 'text-red-900' : 'text-amber-900'}`}>
              {full.length
                ? `Se acabaron tus ${full.map(r => r.inSentence).join(' y ')}`
                : `Llevas más del 80% de tus ${near.map(r => r.inSentence).join(' y ')}`}
            </p>
            <p className={`text-[11px] mt-0.5 ${full.length ? 'text-red-700' : 'text-amber-700'}`}>
              {full.length ? full.map(r => r.atLimit).join(' ') + ' ' : ''}
              Suma más con un complemento o sube de plan.
            </p>
            {onUpgrade && (
              <button
                type="button"
                onClick={onUpgrade}
                className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-bold rounded-lg ${
                  full.length ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                <TrendingUp size={12} /> Ver planes
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Header({ subtitle, muted }: { subtitle: ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
          muted ? 'bg-slate-100 text-slate-400' : 'bg-(--ia-accent)/10 text-(--ia-accent)'
        }`}
      >
        <Gauge size={17} />
      </div>
      <div>
        <h3 className="text-sm font-bold text-slate-900">Consumo del periodo</h3>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
    </div>
  )
}
